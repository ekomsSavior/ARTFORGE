// Prefer explicit AVC/AAC, rather than an MP4 container with an unknown codec.
export const MP4_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1.42001E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=avc1",
];
export const WEBM_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];
export function recordingFormats(supports) {
  return {
    mp4: MP4_TYPES.find(supports) || null,
    webm: WEBM_TYPES.find(supports) || null,
  };
}
