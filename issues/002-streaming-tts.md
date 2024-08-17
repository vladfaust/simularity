### TTS Streaming

`MediaSource` doesn't support `"audio/wav"` (see https://github.com/w3c/media-source/issues/55), so the naive approach of streaming TTS into a media source is not feasible.

```ts
const mediaSource = new MediaSource();
const audio = new Audio(URL.createObjectURL(mediaSource));

const sourceBufferDef = new Deferred<SourceBuffer>();
console.debug("Source buffer deferred");
mediaSource.addEventListener("sourceopen", () => {
  console.debug("Source open event");
  // Here it fails:
  sourceBufferDef.resolve(mediaSource.addSourceBuffer("audio/wav"));
  console.debug("Source buffer opened");
});
console.debug("Source buffer created");
const sourceBuffer = await sourceBufferDef.promise;

// for ...
sourceBuffer.appendBuffer(chunk);
// end for
```

- One option is to stream to a local file, and create an `<audio>` element with a src pointing to that file.
  Would need a `"stream"` protocol handler in Tauri, otherwise the file is incomplete.
  See https://github.com/tauri-apps/tauri/tree/dev/examples/streaming.

- Another option is make TTS return another format, e.g. `"audio/mp3"`.
  See https://stackoverflow.com/questions/74967370/what-is-the-most-efficient-way-to-convert-wav-audio-string-to-an-ogg-file-withou.
  This would allow to use `MediaSource` and stream the audio directly.
  Note that on Safari only `"audio/mp3"` and `"audio/aac"` are supported.

- Another option is the GET endpoint + `<audio>` approach, but there is seemingly no way to save the audio file after it's played.
  Should consider using Service Workers, as there is a way to intercept audio requests and cache them.
  This approach is independent from Tauri.
