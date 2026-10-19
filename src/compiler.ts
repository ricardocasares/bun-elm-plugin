import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { withLock } from "./mutex.ts";
import { parseReport, renderPlain, type ElmReport } from "./report.ts";

export interface CompileOptions {
  /** Directory containing elm.json; `elm make` runs here. */
  cwd: string;
  /** Path to the `elm` binary. Default: "elm" on PATH. */
  pathToElm?: string;
  debug?: boolean;
  optimize?: boolean;
}

export class ElmCompileError extends Error {
  override name = "ElmCompileError";
  constructor(
    message: string,
    /** Structured report when Elm produced one; absent for e.g. a missing binary. */
    public readonly report: ElmReport | undefined,
    /** Directory paths in the report are shown relative to. */
    public readonly root: string,
  ) {
    super(message);
  }
}

/** Compile one or more Elm entry modules into a single JS string (Elm's raw IIFE output). */
export const compile = (targets: string[], options: CompileOptions): Promise<string> =>
  withLock(async () => {
    const output = join(tmpdir(), `bun-elm-plugin-${process.pid}-${crypto.randomUUID()}.js`);
    const args = [options.pathToElm ?? "elm", "make", ...targets, `--output=${output}`, "--report=json"];
    if (options.debug) args.push("--debug");
    if (options.optimize) args.push("--optimize");

    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn(args, {
      cwd: options.cwd,
      stdout: "pipe",
      stderr: "pipe",
      });
    } catch (e) {
      throw new ElmCompileError(
        `could not run \`${args[0]}\`: ${(e as Error).message}. Install Elm or set the pathToElm option.`,
        undefined,
        options.cwd,
      );
    }
    const [stderr, exitCode] = await Promise.all([new Response(proc.stderr as ReadableStream).text(), proc.exited]);

    if (exitCode !== 0) {
      await unlink(output).catch(() => {});
      const report = parseReport(stderr);
      const message = report ? renderPlain(report, options.cwd) : stderr.trim() || `elm make exited with code ${exitCode}`;
      throw new ElmCompileError(message, report, options.cwd);
    }
    try {
      return await Bun.file(output).text();
    } finally {
      await unlink(output).catch(() => {});
    }
  });
