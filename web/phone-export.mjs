import {
  Input,
  ALL_FORMATS,
  BlobSource,
  Output,
  BufferTarget,
  Mp4OutputFormat,
  Conversion,
  canEncodeAudio,
} from "./vendor/mediabunny.mjs";
import { registerAacEncoder } from "./vendor/aac-encoder.mjs";
let registered = false;
export async function phoneMp4(blob, onProgress = () => {}) {
  if (!registered) {
    if (!(await canEncodeAudio("aac"))) registerAacEncoder();
    registered = true;
  }
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  try {
    const conversion = await Conversion.init({
      input,
      output,
      video: { codec: "avc" },
      audio: { codec: "aac" },
    });
    if (!conversion.isValid || conversion.discardedTracks.length)
      throw new Error(
        "This browser could not convert every media track to H.264/AAC. Use the terminal convert command.",
      );
    conversion.onProgress = onProgress;
    await conversion.execute();
    return new Blob([output.target.buffer], { type: "video/mp4" });
  } finally {
    input.dispose();
  }
}
