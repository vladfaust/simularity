# Simularity

> Run interactive simulations locally, or in cloud.

This project aims to implement a foundation for self-hosted interactive simulation applications.

The closest description for the project right now is "AI-driven visual novels".

## Foundation

This project implements a base for future interactive simulation applications, presumably with application-specific modules and assets.

Ideally, a typical application workflow includes development of the assets only (such as scenarios, characters, images, UI elements etc.), so that all the foundation is re-used.

## Research 📚

### Token healing

- https://github.com/ahmed-moubtahij/TokenHealer (https://github.com/ggerganov/llama.cpp/issues/4778)
- https://github.com/ggerganov/llama.cpp/issues/5599

### Streaming LLM

A.k.a. Context Shifting.

Paper: https://github.com/mit-han-lab/streaming-llm.

- https://github.com/LostRuins/koboldcpp/issues/550
- https://github.com/ggerganov/llama.cpp/issues/3440
  - https://github.com/ggerganov/llama.cpp/blob/4399f13fb9462cd06f3f154d0aee738425000fea/examples/main/main.cpp#L542-L575

### Llama.cpp

- On KV cache size & sequences: https://github.com/ggerganov/llama.cpp/discussions/4130#discussioncomment-8053636
- https://www.youtube.com/watch?v=80bIUggRJf4 (contains math for KV cache size)
- https://blog.eleuther.ai/transformer-math/
- https://github.com/ggerganov/llama.cpp/pull/6412 (bfloat16)
- https://www.omrimallis.com/posts/understanding-how-llm-inference-works-with-llama-cpp
- https://kipp.ly/transformer-inference-arithmetic
- https://www.anyscale.com/blog/continuous-batching-llm-inference (vLLM)
- https://github.com/ggerganov/llama.cpp/discussions/7887, https://github.com/ggerganov/llama.cpp/pull/2054 (RoPE (extending context size))
- https://sidshome.wordpress.com/2023/12/24/understanding-internals-of-llama-cpp/

### Roleplay

- https://github.com/Neph0s/awesome-llm-role-playing-with-persona

### Training

- https://www.kaggle.com/code/aisuko/fine-tuning-t5-small-with-lora
- https://www.philschmid.de/fine-tune-flan-t5-peft
- https://towardsdatascience.com/training-t5-for-paraphrase-generation-ab3b5be151a2
- https://unsloth.ai/blog/llama3-1, https://colab.research.google.com/drive/1Ys44kVvmeZtnICzWz0xgpRnrIOjZAuxp (fine-tune on Google Colab)

### Serving

- https://lmsys.org/blog/2024-07-25-sglang-llama3/

## Image Generation

To create a sprite from existing assets, use the following steps.

1. Img2Img an existing naked sprite:

- Model: T-ponyai3
- Crop & Resize
- No Soft Inpainting
- Denoising: 0.8

```
score_9, score_8_up, score_7_up, score_6_up, source_anime,
1girl, looking at viewer,
blue beautiful hair, blue eyes, small breasts, cat ears,
naked,
scenario assets, 3/4 body sprite, hips, anti aliased, white background,
standing,
rating_explicit
```

1. An alternative to existing assets is creating in a batch with the same seed, e.g.

```prompt-positive
score_9, score_8_up, score_7_up, score_6_up, source_anime, rating_explicit,
scenario assets, 3/4 body sprite, hips, anti aliased, bright green background,
1girl,
short black hair, red eyes, small breasts, slim body, cat ears,
naked, standing, looking at viewer,
{neutral|happy|smile|sad|angry|surprised|embarrassed|confused|fearful|determined|bored|anxious|excited|tired|annoyed|playful|curious|fanged smile|pout|ahegao|crying|shy|worried}
```

```prompt-negative
score_4,score_3,score_2,score_1, username, watermark, clothing
```

1152x1536 is a good size for a sprite.
Should explore the area of two inpainting the second sprite on the same image for character consistency.

Multiple poses approach ((1024x2)x1366):

```prompt-positive
score_9, score_8_up, score_7_up, score_6_up, source_anime,
scenario assets, 3/4 body sprite, character sheet, multiple poses, anti aliased, bright green background,
1girl,
aqua, konosuba,
standing, looking at viewer, white sleepwear, consistent outfit, same outfit
```

2. Send to inpainting

- Just resize
- Soft Inpainting
- Denoising: 0.7
- Use dynamic prompt & combinatorial generation

```
score_9, score_8_up, score_7_up, score_6_up, source_anime, rating_explicit,
scenario assets, 3/4 body sprite, hips, anti aliased, bright green background,
1girl,
short black hair, red eyes, small breasts, slim body, cat ears,
{pioneer neckerchief, pioneer movement soviet pioneer, skirt, blue skirt, bangs, shirt, school uniform, collarbone, white shirt, short sleeves, collared shirt, belt, neckerchief, eyelashes, red neckerchief, pocket, breast pocket|swim one piece suit|bikini|black lingerie|white lingerie|black sport suit|red evening dress|summer dress|tshirt, shorts|naked},
{smiling|shy|sad|crying|surprised|feared|ahegao}, standing, looking at viewer,
```

TIP: Can use ES lora to extract pioneer suit: `(white_shirt,red neckerchief,short sleeves,belt,skirt, blue skirt)`.
