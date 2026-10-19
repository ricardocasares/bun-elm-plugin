// Production build: `NODE_ENV=production bun run build.ts`
import tailwind from "bun-plugin-tailwind";
import elm from "../src/index.ts";

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  minify: true,
  plugins: [tailwind, elm],
});

if (!result.success) {
  console.error(...result.logs);
  process.exit(1);
}

for (const o of result.outputs) console.log(o.path, o.size);
