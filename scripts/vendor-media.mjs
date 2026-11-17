import { mkdir, copyFile, cp, writeFile, readFile } from "node:fs/promises";
await mkdir("web/vendor/licenses", { recursive: true });
for (const [pkg, bundle, target] of [
  ["mediabunny", "mediabunny", "mediabunny"],
  ["@mediabunny/aac-encoder", "mediabunny-aac-encoder", "aac-encoder"],
]) {
  await copyFile(
    `node_modules/${pkg}/dist/bundles/${bundle}.min.mjs`,
    `web/vendor/${target}.mjs`,
  );
  if (target === "aac-encoder") {
    const file = `web/vendor/${target}.mjs`;
    const bundle = await readFile(file, "utf8");
    if (!bundle.includes('from"mediabunny"'))
      throw new Error("Review changed vendor imports before updating.");
    await writeFile(
      file,
      bundle.replaceAll('from"mediabunny"', 'from"./mediabunny.mjs"'),
    );
  }
  await copyFile(
    `node_modules/${pkg}/LICENSE`,
    `web/vendor/licenses/${target}.txt`,
  );
  await cp(`node_modules/${pkg}/src`, `web/vendor/source/${target}`, {
    recursive: true,
  });
}
await cp(
  "node_modules/@mediabunny/aac-encoder/licenses/ffmpeg",
  "web/vendor/licenses/ffmpeg",
  { recursive: true },
);
await copyFile(
  "node_modules/@mediabunny/aac-encoder/README.md",
  "web/vendor/source/aac-encoder/BUILD.md",
);
const versions = await Promise.all(
  ["mediabunny", "@mediabunny/aac-encoder"].map(async (p) => [
    p,
    JSON.parse(await readFile(`node_modules/${p}/package.json`, "utf8"))
      .version,
  ]),
);
await writeFile(
  "web/vendor/versions.json",
  JSON.stringify(Object.fromEntries(versions), null, 2) + "\n",
);
