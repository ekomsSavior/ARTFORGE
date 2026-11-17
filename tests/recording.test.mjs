import test from "node:test";
import assert from "node:assert/strict";
import { captureRecording, withTimeout } from "../web/export.mjs";
function setup({ brokenStop = false, startError = false } = {}) {
  let time = 0,
    id = 0,
    stoppedTracks = 0;
  const jobs = new Map();
  const timers = {
    setTimeout(fn, ms) {
      const key = ++id;
      jobs.set(key, { fn, at: time + ms });
      return key;
    },
    clearTimeout(key) {
      jobs.delete(key);
    },
    setInterval(fn, ms) {
      const key = ++id;
      jobs.set(key, { fn, at: time + ms, repeat: ms });
      return key;
    },
    clearInterval(key) {
      jobs.delete(key);
    },
  };
  function advance(ms) {
    const end = time + ms;
    for (;;) {
      const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      const [key, job] = next;
      time = job.at;
      jobs.delete(key);
      if (job.repeat) jobs.set(key, { ...job, at: time + job.repeat });
      job.fn();
    }
    time = end;
  }
  const recorder = {
    state: "inactive",
    mimeType: "video/webm",
    stopCount: 0,
    start() {
      if (startError) throw Error("start failed");
      this.state = "recording";
    },
    stop() {
      this.stopCount++;
      this.state = "inactive";
      if (!brokenStop) {
        this.ondataavailable({ data: new Blob(["frame"]) });
        this.onstop();
      }
    },
  };
  const stream = {
    getTracks: () => [
      {
        stop() {
          stoppedTracks++;
        },
      },
    ],
  };
  return {
    recorder,
    stream,
    timers,
    advance,
    now: () => time,
    stopped: () => stoppedTracks,
    pending: () => jobs.size,
  };
}
test("recording stops at deadline without depending on any playback/audio promise", async () => {
  const f = setup(),
    s = captureRecording(f.recorder, f.stream, {
      seconds: 4,
      timers: f.timers,
      now: f.now,
    });
  f.advance(4000);
  const result = await s.done;
  assert.equal(f.recorder.stopCount, 1);
  assert.equal(await result.blob.text(), "frame");
  assert.equal(f.stopped(), 1);
  assert.equal(f.pending(), 0);
});
test("manual stop is idempotent and saves the last emitted chunk", async () => {
  const f = setup(),
    s = captureRecording(f.recorder, f.stream, {
      seconds: 30,
      timers: f.timers,
      now: f.now,
    });
  s.stop();
  s.stop();
  f.advance(60000);
  assert.equal(f.recorder.stopCount, 1);
  assert.equal((await s.done).blob.size, 5);
  assert.equal(f.pending(), 0);
});
test("missing browser stop event recovers chunks and releases tracks after watchdog", async () => {
  const f = setup({ brokenStop: true }),
    s = captureRecording(f.recorder, f.stream, {
      seconds: 4,
      timers: f.timers,
      now: f.now,
    });
  f.recorder.ondataavailable({ data: new Blob(["partial"]) });
  f.advance(14000);
  const r = await s.done;
  assert.equal(await r.blob.text(), "partial");
  assert.match(r.error.message, /did not finish/);
  assert.equal(f.stopped(), 1);
});
test("recorder start failure cleans up timers and media tracks", () => {
  const f = setup({ startError: true });
  assert.throws(
    () =>
      captureRecording(f.recorder, f.stream, {
        seconds: 4,
        timers: f.timers,
        now: f.now,
      }),
    /start failed/,
  );
  assert.equal(f.stopped(), 1);
  assert.equal(f.pending(), 0);
});
test("unresolved browser audio/playback promises time out", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 5, "audio blocked"),
    /audio blocked/,
  );
});
