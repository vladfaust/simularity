import base64
import io
import os
import tempfile
import time
import wave
import torch
import torchaudio
import numpy as np
from typing import BinaryIO, List
from pydantic import BaseModel
import os
import psutil

from TTS.tts.configs.xtts_config import XttsConfig
from TTS.tts.models.xtts import Xtts
from TTS.utils.generic_utils import get_user_data_dir
from TTS.utils.manage import ModelManager

num_threads = int(os.environ.get("NUM_THREADS", int(os.cpu_count() or 1)))
print(f"Setting number of threads to {num_threads}")
torch.set_num_threads(num_threads)

device = "cuda" if torch.cuda.is_available() and os.environ.get(
    "USE_CPU", "0") == "0" else "cpu"
if device == "cuda":
    print("Using GPU")
else:
    print("Using CPU")

model_name = "tts_models/multilingual/multi-dataset/xtts_v2"
model_path = os.path.join(get_user_data_dir(
    "tts"), model_name.replace("/", "--"))

print("Downloading XTTS Model...", model_path, flush=True)
ModelManager().download_model(model_name)

print("Loading XTTS to device...", flush=True)

process = psutil.Process()
start_mem = torch.cuda.memory_allocated(
) if device == "cuda" else process.memory_info().rss
start_time = time.time()

config = XttsConfig()
config.load_json(os.path.join(model_path, "config.json"))
model = Xtts.init_from_config(config)
model.load_checkpoint(
    config,
    checkpoint_dir=model_path,
    eval=True,
    use_deepspeed=True if device == "cuda" else False),
model.to(device)

now_mem = torch.cuda.memory_allocated(
) if device == "cuda" else process.memory_info().rss
now_time = time.time()

print("XTTS Loaded in {:.0f}s, memory used: {:.0f}MB".format(
    now_time - start_time, (now_mem - start_mem) / 1024 / 1024), flush=True)


def create_speaker(wav_file: BinaryIO):
    """Compute conditioning inputs from reference audio file."""
    temp_file = tempfile.NamedTemporaryFile("wb")
    temp_file.write(io.BytesIO(wav_file.read()).getbuffer())

    torch.inference_mode()
    gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(
        temp_file.name
    )

    if speaker_embedding is None:
        raise RuntimeError("Failed to compute conditioning inputs")

    return {
        "gpt_cond_latent": gpt_cond_latent.cpu().squeeze().half().tolist(),
        "speaker_embedding": speaker_embedding.cpu().squeeze().half().tolist(),
    }


def postprocess(wav):
    """Post process the output waveform"""
    if isinstance(wav, list):
        wav = torch.cat(wav, dim=0)
    wav = wav.clone().detach().cpu().numpy()
    wav = wav[None, : int(wav.shape[0])]
    wav = np.clip(wav, -1, 1)
    wav = (wav * 32767).astype(np.int16)
    return wav


def encode_audio_common(
    frame_input,
    encode_base64=True,
    sample_rate=24000,
    sample_width=2,
    channels=1
):
    """Return encoded audio."""

    wav_buf = io.BytesIO()
    with wave.open(wav_buf, "wb") as vfout:
        vfout.setnchannels(channels)
        vfout.setsampwidth(sample_width)
        vfout.setframerate(sample_rate)
        vfout.writeframes(frame_input)

    wav_buf.seek(0)
    if encode_base64:
        b64_encoded = base64.b64encode(wav_buf.getbuffer()).decode("utf-8")
        return b64_encoded
    else:
        return wav_buf.read()


class StreamingInputs(BaseModel):
    speaker_embedding: List[float]
    gpt_cond_latent: List[List[float]]
    text: str
    language: str
    add_wav_header: bool = True

    # The following are the default values.
    stream_chunk_size: int = 20
    overlap_wav_len: int = 1024
    temperature: float = 0.75
    length_penalty: float = 1
    repetition_penalty: float = 5.0
    top_k: int = 50
    top_p: float = 0.85
    do_sample: bool = True
    speed: float = 1
    enable_text_splitting: bool = False


def predict_streaming_generator(parsed_input: StreamingInputs):
    speaker_embedding = torch.tensor(
        parsed_input.speaker_embedding).unsqueeze(0).unsqueeze(-1)
    gpt_cond_latent = torch.tensor(
        parsed_input.gpt_cond_latent).reshape((-1, 1024)).unsqueeze(0)

    chunks = model.inference_stream(
        text=parsed_input.text,
        language=parsed_input.language,
        gpt_cond_latent=gpt_cond_latent,
        speaker_embedding=speaker_embedding,
        stream_chunk_size=parsed_input.stream_chunk_size,
        overlap_wav_len=parsed_input.overlap_wav_len,
        temperature=parsed_input.temperature,
        length_penalty=parsed_input.length_penalty,
        repetition_penalty=parsed_input.repetition_penalty,
        top_k=parsed_input.top_k,
        top_p=parsed_input.top_p,
        do_sample=parsed_input.do_sample,
        speed=parsed_input.speed,
        enable_text_splitting=parsed_input.enable_text_splitting,
    )

    t0 = time.time()
    wav_chunks = []
    for i, chunk in enumerate(chunks):
        if i == 0:
            print(
                f"Latency to first audio chunk: {round((time.time() - t0)*1000)} milliseconds")

        chunk = postprocess(chunk)
        print(f"Received chunk {i} of audio length {chunk.shape[-1]}")

        if i == 0 and parsed_input.add_wav_header:
            yield encode_audio_common(b"", encode_base64=False)
            yield chunk.tobytes()
        else:
            yield chunk.tobytes()

        wav_chunks.append(chunk)

    inference_time = time.time() - t0
    print(
        f"I: Time to generate audio: {round(inference_time*1000)} milliseconds"
    )

    # FIXME: TypeError: expected Tensor as element 0 in argument 0, but got numpy.ndarray
    # wav = torch.cat(wav_chunks, dim=0)
    # real_time_factor = (time.time() - t0) / wav.shape[0] * 24000
    # print(f"Real-time factor (RTF): {real_time_factor}")


class TTSInputs(BaseModel):
    speaker_embedding: List[float]
    gpt_cond_latent: List[List[float]]
    text: str
    language: str

    # The following are the default values.
    overlap_wav_len: int = 1024
    temperature: float = 0.75
    length_penalty: float = 1.0
    repetition_penalty: float = 5.0
    top_k: int = 50
    top_p: float = 0.85
    do_sample: bool = True
    speed: float = 1.0
    enable_text_splitting: bool = False


def predict_speech(parsed_input: TTSInputs):
    speaker_embedding = torch.tensor(
        parsed_input.speaker_embedding).unsqueeze(0).unsqueeze(-1)
    gpt_cond_latent = torch.tensor(
        parsed_input.gpt_cond_latent).reshape((-1, 1024)).unsqueeze(0)

    t0 = time.time()
    out = model.inference(
        text=parsed_input.text,
        language=parsed_input.language,
        gpt_cond_latent=gpt_cond_latent,
        speaker_embedding=speaker_embedding,
        temperature=parsed_input.temperature,
        length_penalty=parsed_input.length_penalty,
        repetition_penalty=parsed_input.repetition_penalty,
        top_k=parsed_input.top_k,
        top_p=parsed_input.top_p,
        do_sample=parsed_input.do_sample,
        speed=parsed_input.speed,
        enable_text_splitting=parsed_input.enable_text_splitting,
    )

    wav = postprocess(torch.tensor(out["wav"]).unsqueeze(0))
    print(
        f"Time to generate audio: {round((time.time() - t0)*1000)} milliseconds")

    # TODO:
    # real_time_factor = (time.time() - t0) / wav.shape[0] * 24000
    # print(f"Real-time factor (RTF): {real_time_factor}")

    # torchaudio.save("output.wav", torch.tensor(out["wav"]).unsqueeze(0), 24000)

    return encode_audio_common(wav.tobytes(), encode_base64=False)


def get_languages():
    return config.languages
