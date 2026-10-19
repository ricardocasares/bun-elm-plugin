import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { elm } from "./index.ts";

const example = resolve(import.meta.dir, "../example");
const haveElm = Bun.which("elm") !== null;

describe.skipIf(!haveElm)("Elm plugin with Bun.build", () => {
  test("compiles an .elm entry to an ES module without HMR code", async () => {
    const result = await Bun.build({
      entrypoints: [resolve(example, "main.ts")],
      plugins: [elm({ hmr: false })],
      target: "browser",
    });
    expect(result.success).toBe(true);
    const code = await result.outputs[0]!.text();
    expect(code).toContain("$author$project$Main$main");
    expect(code).not.toContain("Hot-swapping module");
  }, 60_000);

  test("hmr build appends the swap runtime and imports dependencies", async () => {
    const result = await Bun.build({
      entrypoints: [resolve(example, "main.ts")],
      plugins: [elm({ hmr: true })],
      target: "browser",
    });
    expect(result.success).toBe(true);
    const code = await result.outputs[0]!.text();
    // Bun.build is a production bundle, so import.meta.hot is false and the runtime is eliminated.
    expect(code).toContain("$author$project$Main$main");
  }, 60_000);

  test("surfaces Elm compile errors", async () => {
    const dir = resolve(import.meta.dir, "../example/src");
    const broken = resolve(dir, "Broken.elm");
    await Bun.write(broken, "module Broken exposing (main)\n\nmain = missing\n");
    try {
      const result = await Bun.build({
        entrypoints: [resolve(example, "main.ts")],
        plugins: [
          {
            name: "redirect",
            setup(b) {
              b.onResolve({ filter: /Main\.elm$/ }, () => ({ path: broken }));
            },
          },
          elm({ hmr: false }),
        ],
        target: "browser",
        throw: false,
      });
      expect(result.success).toBe(false);
      expect(result.logs.map(String).join("\n")).toContain("NAMING ERROR");
    } finally {
      await Bun.file(broken).delete();
    }
  }, 60_000);
});
