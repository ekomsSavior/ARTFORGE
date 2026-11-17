import { createH264MP4Encoder } from "./vendor/software-h264.mjs";

let encoder,
  frameCount = 0;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const { width, height, fps } = data;
      if (
        encoder ||
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 2 ||
        height < 2 ||
        width > 960 ||
        height > 960 ||
        width % 2 ||
        height % 2 ||
        fps !== 24
      )
        throw Error("Invalid video dimensions.");
      encoder = await createH264MP4Encoder();
      encoder.width = width;
      encoder.height = height;
      encoder.frameRate = fps;
      encoder.speed = 8;
      encoder.quantizationParameter = 22;
      encoder.groupOfPictures = fps * 2;
      encoder.initialize();
    } else if (data.type === "frame") {
      if (
        !encoder ||
        frameCount >= 1440 ||
        !(data.pixels instanceof ArrayBuffer) ||
        data.pixels.byteLength !== encoder.width * encoder.height * 4
      )
        throw Error("Invalid video frame.");
      encoder.addFrameRgba(new Uint8Array(data.pixels));
      frameCount++;
    } else if (data.type === "finish") {
      if (!encoder || !frameCount) throw Error("No frames were rendered.");
      encoder.finalize();
      const bytes = encoder.FS.readFile(encoder.outputFilename).slice();
      encoder.delete();
      encoder = null;
      self.postMessage({ bytes: bytes.buffer }, [bytes.buffer]);
      return;
    } else throw Error("Unknown encoder operation.");
    self.postMessage({ ok: true });
  } catch (error) {
    self.postMessage({ error: error.message || "Software encoding failed." });
  }
};
