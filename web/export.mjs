// Prefer explicit AVC/AAC, rather than an MP4 container with an unknown codec.
export const MP4_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1.42001E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=avc1",
];
export const WEBM_TYPES = [
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm",
];
export function recordingFormats(supports) {
  return {
    mp4: MP4_TYPES.find(supports) || null,
    webm: WEBM_TYPES.find(supports) || null,
  };
}
export function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}
// The stop deadline is installed immediately, independently of audio/playback promises.
export function captureRecording(
  recorder,
  stream,
  {
    seconds,
    onTick = () => {},
    timers = globalThis,
    now = () => performance.now(),
  },
) {
  const chunks = [];
  let deadline,
    ticker,
    watchdog,
    settled = false,
    stopping = false,
    resolveDone,
    failure;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const finish = () => {
    if (settled) return;
    settled = true;
    timers.clearTimeout(deadline);
    timers.clearInterval(ticker);
    timers.clearTimeout(watchdog);
    stream.getTracks().forEach((track) => track.stop());
    resolveDone({
      blob: new Blob(chunks, { type: recorder.mimeType }),
      error: failure,
    });
  };
  const stop = () => {
    if (stopping || settled) return;
    stopping = true;
    onTick(0);
    watchdog = timers.setTimeout(() => {
      failure ||= new Error(
        chunks.length
          ? "The browser did not finish the recording. A partial file may be available."
          : "The browser encoder returned no video data. Nothing was recorded.",
      );
      finish();
    }, 10000);
    try {
      if (recorder.state === "recording") recorder.requestData?.();
    } catch {
      /* Some engines cannot flush separately; stop must still run. */
    }
    try {
      if (recorder.state !== "inactive") recorder.stop();
      else finish();
    } catch (error) {
      failure = error;
      finish();
    }
  };
  recorder.ondataavailable = (e) => {
    if (!settled && e.data.size) chunks.push(e.data);
  };
  recorder.onstop = finish;
  recorder.onerror = (e) => {
    failure = e.error || new Error("Recording failed.");
    stop();
  };
  const started = now();
  deadline = timers.setTimeout(
    stop,
    Math.max(0.1, Math.min(60, seconds)) * 1000,
  );
  ticker = timers.setInterval(
    () => onTick(Math.max(0, seconds - (now() - started) / 1000)),
    100,
  );
  try {
    recorder.start(250);
  } catch (error) {
    failure = error;
    finish();
    throw error;
  }
  return { done, stop };
}
