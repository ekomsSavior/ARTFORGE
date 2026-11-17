// Encode one frame at a time. Backpressure bounds memory and gives slow machines
// the same output timeline as fast ones; there is no canvas capture stream.
export async function encodeFrameSequence({
  seconds,
  fps = 24,
  start = 0,
  loopEnd,
  renderFrame,
  addFrame,
  onProgress = () => {},
  signal,
}) {
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    seconds > 60 ||
    fps !== 24 ||
    !Number.isFinite(start) ||
    !Number.isFinite(loopEnd) ||
    loopEnd <= start
  )
    throw Error("Invalid loop duration.");
  const frames = Math.ceil(seconds * fps);
  for (let i = 0; i < frames; i++) {
    signal?.throwIfAborted();
    const time = start + ((i / fps) % (loopEnd - start));
    const pixels = await renderFrame(time, i);
    signal?.throwIfAborted();
    await addFrame(pixels);
    onProgress((i + 1) / frames);
  }
  return frames;
}

export async function softwareMp4({
  canvas,
  seconds,
  start,
  loopEnd,
  renderFrame,
  onProgress,
  signal,
}) {
  signal?.throwIfAborted();
  const worker = new Worker(
    new URL("./software-video-worker.mjs", import.meta.url),
    { type: "module" },
  );
  let pending, watchdog;
  const cancel = () => pending?.reject(new Error("MP4 export cancelled."));
  signal?.addEventListener("abort", cancel, { once: true });
  worker.onmessage = ({ data }) => {
    if (!pending) return;
    clearTimeout(watchdog);
    const current = pending;
    pending = null;
    if (data.error) current.reject(new Error(data.error));
    else current.resolve(data);
  };
  worker.onerror = () =>
    pending?.reject(new Error("The software encoder could not start."));
  const request = (data, transfer = []) => {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      watchdog = setTimeout(
        () => reject(new Error("The video encoder stopped responding.")),
        20000,
      );
      worker.postMessage(data, transfer);
    });
  };
  try {
    await request({
      type: "init",
      width: canvas.width,
      height: canvas.height,
      fps: 24,
    });
    const context = canvas.getContext("2d");
    await encodeFrameSequence({
      seconds,
      start,
      loopEnd,
      signal,
      onProgress,
      renderFrame: async (time, index) => {
        await renderFrame(time, index);
        return context.getImageData(0, 0, canvas.width, canvas.height).data
          .buffer;
      },
      addFrame: (pixels) => request({ type: "frame", pixels }, [pixels]),
    });
    const result = await request({ type: "finish" });
    return new Blob([result.bytes], { type: "video/mp4" });
  } finally {
    clearTimeout(watchdog);
    signal?.removeEventListener("abort", cancel);
    worker.terminate();
  }
}
