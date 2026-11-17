import {
  Input,
  MP4,
  WEBM,
  BlobSource,
  Output,
  BufferTarget,
  Mp4OutputFormat,
  Conversion,
  canEncodeAudio,
} from "./vendor/mediabunny.mjs";
import { registerAacEncoder } from "./vendor/aac-encoder.mjs";
import {
  checkMediaFile,
  checkDimensions,
  MEDIA_LIMITS,
} from "./media-safety.mjs";
let registered = false;
export async function phoneMp4(blob, onProgress = () => {}, { signal } = {}) {
  if (signal?.aborted) throw new Error("MP4 export cancelled.");
  await checkMediaFile(blob);
  if (!registered) {
    if (!(await canEncodeAudio("aac"))) registerAacEncoder();
    registered = true;
  }
  const input = new Input({
    source: new BlobSource(blob),
    formats: [MP4, WEBM],
  });
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  let conversion, timer, cancel;
  const cancelled = new Promise((_, reject) => {
    cancel = () => {
      input.dispose();
      conversion?.cancel().catch(() => {});
      reject(
        new Error(
          signal?.aborted ? "MP4 export cancelled." : "MP4 export timed out.",
        ),
      );
    };
    timer = setTimeout(cancel, 120000);
    signal?.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([
      cancelled,
      (async () => {
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error("This file has no video track.");
        const width = await track.getDisplayWidth(),
          height = await track.getDisplayHeight();
        checkDimensions(width, height);
        const duration = await input.computeDuration();
        if (
          !Number.isFinite(duration) ||
          duration <= 0 ||
          duration > MEDIA_LIMITS.duration
        )
          throw new Error("Video must be at most one hour long.");
        const scale = Math.min(1, 1280 / Math.max(width, height));
        conversion = await Conversion.init({
          input,
          output,
          tags: {},
          video: {
            codec: "avc",
            width: Math.max(2, Math.floor((width * scale) / 2) * 2),
            height: Math.max(2, Math.floor((height * scale) / 2) * 2),
            fit: "contain",
          },
          audio: { codec: "aac", numberOfChannels: 2, sampleRate: 48000 },
        });
        if (!conversion.isValid || conversion.discardedTracks.length)
          throw new Error(
            "This browser could not convert every media track to H.264/AAC. Use the terminal convert command.",
          );
        conversion.onProgress = onProgress;
        await conversion.execute();
        return new Blob([output.target.buffer], { type: "video/mp4" });
      })(),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    input.dispose();
  }
}
