/**
 * Turn `elm make`'s IIFE output into an ES module exporting `Elm`.
 * Port of elm-esm (https://github.com/ChristophP/elm-esm, MIT).
 */
export const toESModule = (js: string): string => {
  const exportsMatch = js.match(/^\s*_Platform_export\(([^]*)\);\n?}\(this\)\);/m);
  if (!exportsMatch) {
    throw new Error("bun-elm-plugin: could not find _Platform_export in compiled output");
  }
  const elmExports = exportsMatch[1];
  return js
    .replace(/\(function\s*\(scope\)\s*\{$/m, "// -- $&")
    .replace(/['"]use strict['"];$/m, "// -- $&")
    .replace(/function _Platform_export([^]*?)\}\n/g, "/*\n$&\n*/")
    .replace(/function _Platform_mergeExports([^]*?)\}\n\s*}/g, "/*\n$&\n*/")
    .replace(/^\s*_Platform_export\(([^]*)\);\n?}\(this\)\);/m, "/*\n$&\n*/")
    .concat(`\nexport const Elm = ${elmExports};\nexport default Elm;\n`);
};
