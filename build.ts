// Builds the publishable package into dist/: one ESM bundle plus declaration files.
// Raw .ts sources can't be shipped: their `./x.ts` imports fail consumers' type checks.
import { $ } from "bun";
import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  packages: "external",
  sourcemap: "linked",
});
if (!result.success) {
  console.error(...result.logs);
  process.exit(1);
}

await $`tsc -p tsconfig.build.json`;

// tsc keeps the sources' `./x.ts` specifiers in the declarations; point them at the emitted files.
for await (const path of new Bun.Glob("dist/*.d.ts").scan()) {
  const text = await Bun.file(path).text();
  await Bun.write(path, text.replace(/(from\s+"\.[^"]*)\.ts"/g, '$1.js"'));
}

for (const o of result.outputs) console.log(o.path.replace(`${process.cwd()}/`, ""), o.size);
