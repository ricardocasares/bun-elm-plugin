import type { BunPlugin } from "bun";
import { stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { compile, ElmCompileError } from "./compiler.ts";
import { findAllDependencies } from "./dependencies.ts";
import { loadElmProject } from "./elm-json.ts";
import { toESModule } from "./esm.ts";
import { injectHMR } from "./hmr.ts";
import { errorModule } from "./overlay.ts";
import { problemCount, renderAnsi, renderHtml } from "./report.ts";

export interface ElmPluginOptions {
  /** Compile with `--debug` (Elm's time-travelling debugger). Default: `NODE_ENV !== "production"`. */
  debug?: boolean;
  /** Compile with `--optimize`. Default: `NODE_ENV === "production"`. */
  optimize?: boolean;
  /** Inject the hot-swap runtime. Default: `NODE_ENV !== "production"`. */
  hmr?: boolean;
  /** Path to the `elm` executable. Default: "elm". */
  pathToElm?: string;
  /** Directory to run `elm make` in. Default: the closest `elm.json` to the imported file. */
  cwd?: string;
}

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * Bun bundler plugin that compiles `import { Elm } from "./Main.elm"` and hot-swaps running Elm
 * programs under `Bun.serve()`'s development server.
 */
export const elm = (options: ElmPluginOptions = {}): BunPlugin => ({
  name: "bun-elm-plugin",
  setup(build) {
    const hmr = options.hmr ?? !isProduction();
    const debug = options.debug ?? !isProduction();
    const optimize = options.optimize ?? (!debug && isProduction());

    /** entry .elm file -> project-local .elm files it (transitively) imports */
    const dependencyGraph = new Map<string, Set<string>>();
    /** .elm files imported from JS/TS (as opposed to pulled in as a dependency of one) */
    const entries = new Set<string>();
    /** content hash of every .elm file as of its last onLoad, to tell real edits from re-bundles */
    const seen = new Map<string, bigint>();

    const hasChanged = async (file: string): Promise<boolean> => {
      const hash = Bun.hash(await Bun.file(file).arrayBuffer()) as bigint;
      const changed = seen.has(file) && seen.get(file) !== hash;
      seen.set(file, hash);
      return changed;
    };

    // Bun re-bundles only the file that changed, never its importers. To learn that `Helper.elm`
    // changed, every entry's generated module `import`s its dependencies so Bun watches them. To
    // make the entry itself recompile we rewrite it with its own contents: Bun's watcher ignores a
    // bare mtime bump but reacts to a write, and identical bytes keep editors quiet.
    const entriesDependingOn = (file: string): string[] =>
      [...dependencyGraph].filter(([, deps]) => deps.has(file)).map(([entry]) => entry);

    const poke = async (file: string) => {
      try {
        const before = (await stat(file)).mtimeMs;
        const text = await Bun.file(file).text();
        // Don't clobber a save that landed while we were reading.
        if ((await stat(file)).mtimeMs !== before) return;
        await Bun.write(file, text);
      } catch {
        // file gone or unreadable: nothing to recompile
      }
    };

    build.onResolve({ filter: /\.elm$/ }, (args) => {
      // On hot reload Bun re-resolves the changed file itself with kind "entry-point-build" and no
      // importer; that must not promote a dependency to an entry.
      if (args.importer && !args.importer.endsWith(".elm")) {
        entries.add(isAbsolute(args.path) ? args.path : resolve(dirname(args.importer), args.path));
      }
      return undefined; // let Bun resolve the file normally
    });

    build.onLoad({ filter: /\.elm$/ }, async (args) => {
      const file = args.path;
      const project = await loadElmProject(file);
      if (!project) {
        throw new Error(`bun-elm-plugin: no elm.json found above ${file}`);
      }

      if (hmr) {
        // Bun also re-runs onLoad for a dependency whenever an entry that imports it is re-bundled,
        // so only a real content change may poke the entries (otherwise we'd loop forever).
        if (await hasChanged(file)) {
          await Promise.all(entriesDependingOn(file).map(poke));
        }
        if (!entries.has(file)) {
          // Not imported from JS: it's only here so Bun watches it. Self-accept to stop the
          // (stale) update bubbling to the entry; the poke above delivers the real one.
          return { contents: "export {};\nimport.meta.hot.accept();\n", loader: "js" };
        }
      }

      const dependencies = await findAllDependencies(file, project);
      dependencyGraph.set(file, new Set(dependencies));

      const header = hmr ? dependencies.map((dep) => `import ${JSON.stringify(dep)};`).join("\n") : "";

      let compiled: string;
      try {
        compiled = await compile([file], {
          cwd: options.cwd ?? project.root,
          pathToElm: options.pathToElm,
          debug,
          optimize,
        });
      } catch (e) {
        if (!(e instanceof ElmCompileError)) throw e;
        if (!hmr || !e.report) {
          // Production build, or no structured report: let Bun fail the build with the plain text.
          throw new Error(`\n${e.message}`);
        }
        // Dev server: print Elm's report with its colours, and swap in an overlay module instead of
        // failing the bundle, so the browser shows the formatted error and recovers on the next save.
        const n = problemCount(e.report);
        console.error(`\n\x1b[31m${n} Elm compile ${n === 1 ? "error" : "errors"}\x1b[0m\n\n${renderAnsi(e.report, e.root)}`);
        return { contents: errorModule(renderHtml(e.report, e.root), dependencies), loader: "js" };
      }

      const esm = toESModule(compiled);
      if (!hmr) return { contents: esm, loader: "js" };

      return { contents: `${header}\n${injectHMR(esm)}`, loader: "js" };
    });
  },
});

export default elm();
