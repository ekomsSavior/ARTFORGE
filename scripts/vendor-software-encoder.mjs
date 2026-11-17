import { readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = "node_modules/h264-mp4-encoder";
const original = await readFile(
  `${root}/embuild/dist/h264-mp4-encoder.web.js`,
  "utf8",
);
let source = original;
// Pinned Emscripten glue: replace dynamically named wrappers with ordinary
// closures. Never relax the studio's CSP to permit JavaScript code generation.
function replaceOnce(pattern, replacement) {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1)
    throw Error("Encoder glue changed; review before vendoring.");
  source = source.replace(pattern, replacement);
}
replaceOnce(
  /function PA\(A,B\)\{.*?\}function \$A/g,
  "function PA(A,B){return function(){return B.apply(this,arguments)}}function $$A",
);
replaceOnce(
  /function HB\(A,Q\)\{.*?\}var GB/g,
  'function HB(A,Q){var signature=WA(A),call=B["dynCall_"+signature];if(typeof call!=="function")BB("Unknown function pointer");return function(){return call.apply(null,[Q].concat(Array.prototype.slice.call(arguments)))}}var GB',
);
replaceOnce(
  /IB\(\[\],t,\(function\(g\)\{var C=I,t=A,o=E,s=g.length;.*?void 0===e\[B\].N\?/g,
  `IB([],t,(function(g){
    var types=g,hasThis=types[1]!==null&&A!==null,needsDestructors=types.slice(1).some(function(type){return type!==null&&type.O===undefined});
    g=function(){
      if(arguments.length!==types.length-2)BB('Invalid argument count for '+I);
      var destructors=needsDestructors?[]:null,wired=[i],cleanups=[],result;
      try {
        if(hasThis){var receiver=types[1].toWireType(destructors,this);wired.push(receiver);cleanups.push([types[1],receiver]);}
        for(var index=0;index<arguments.length;index++){var type=types[index+2],value=type.toWireType(destructors,arguments[index]);wired.push(value);cleanups.push([type,value]);}
        result=E.apply(null,wired);
      } finally {
        if(needsDestructors)pB(destructors);
        else cleanups.forEach(function(entry){if(entry[0].O)entry[0].O(entry[1]);});
      }
      if(types[0].name!=='void')return types[0].fromWireType(result);
    };
    return void 0===e[B].N?`,
);
source = source.replace('new Function("return this")()', "globalThis");
source = source.replace(
  'A=new Function(""+A)',
  'A=(()=>{throw new TypeError("Callback must be a function")})()',
);
source = source.replace(
  "return eval(this.code)",
  'throw new Error("Dynamic script execution is disabled")',
);
source = source.replace(/\/\/# sourceMappingURL=.*$/, "");
if (/new Function|\beval\(|=Function;/.test(source))
  throw Error("Unexpected dynamic JavaScript in encoder.");
source += "\nexport const createH264MP4Encoder = HME.createH264MP4Encoder;\n";
await writeFile("web/vendor/software-h264.mjs", source);
await copyFile(`${root}/LICENSE.md`, "web/vendor/licenses/software-h264.txt");
await writeFile(
  "web/vendor/software-h264.json",
  JSON.stringify(
    {
      package: "h264-mp4-encoder",
      version: "1.0.12",
      upstream: "https://github.com/TrevorSundberg/h264-mp4-encoder",
      upstreamBundleSha256: createHash("sha256").update(original).digest("hex"),
      changes:
        "ES module export; static Emscripten closures; dynamic script shims disabled. Reproduce with scripts/vendor-software-encoder.mjs.",
    },
    null,
    2,
  ) + "\n",
);
