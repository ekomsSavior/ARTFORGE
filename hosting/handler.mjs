// Static file host only. No upload endpoint, URL proxy, shell, or server-side decoder.
export const CSP =
  "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; media-src blob:; font-src 'self'; worker-src 'self' blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), display-capture=(), payment=(), usb=(), serial=(), hid=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
});
export function createHandler(assets) {
  return {
    async fetch(request) {
      const headers = new Headers(SECURITY_HEADERS);
      if (!["GET", "HEAD"].includes(request.method)) {
        headers.set("Allow", "GET, HEAD");
        return new Response("Method not allowed", { status: 405, headers });
      }
      const pathname = new URL(request.url).pathname;
      const key = pathname === "/" ? "/index.html" : pathname;
      if (!Object.hasOwn(assets, key))
        return new Response(request.method === "HEAD" ? null : "Not found", {
          status: 404,
          headers,
        });
      const asset = assets[key];
      headers.set("Content-Type", asset.type);
      headers.set("Cache-Control", "public, max-age=0, must-revalidate");
      headers.set("ETag", asset.etag);
      if (request.headers.get("If-None-Match") === asset.etag)
        return new Response(null, { status: 304, headers });
      const zipped = /\bgzip\b/.test(
        request.headers.get("Accept-Encoding") || "",
      );
      headers.set("Vary", "Accept-Encoding");
      if (zipped) headers.set("Content-Encoding", "gzip");
      if (request.method === "HEAD") return new Response(null, { headers });
      const bytes = Uint8Array.from(atob(asset.data), (c) => c.charCodeAt(0));
      const body = zipped
        ? bytes
        : new Blob([bytes])
            .stream()
            .pipeThrough(new DecompressionStream("gzip"));
      return new Response(body, { headers });
    },
  };
}
