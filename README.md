# bun-elm-plugin

A [Bun](https://bun.com) bundler plugin for [Elm](https://elm-lang.org) with hot module
replacement under `Bun.serve()`'s development server. Edit any `.elm` file and the running
program is swapped in place, keeping its model, like [vite-plugin-elm](https://github.com/hmsk/vite-plugin-elm)
and [elm-hot](https://github.com/klazuka/elm-hot).

Requires Bun 1.2+ and Elm 0.19.1 or later on your `PATH` (or pass `pathToElm`).

## Install

```sh
bun add -d bun-elm-plugin
```

## Usage

The default export is a ready-made plugin. Pass it to `Bun.build` as is:

```ts
import elm from "bun-elm-plugin";

await Bun.build({
  entrypoints: ["./main.ts"],
  outdir: "./dist",
  plugins: [elm],
});
```

It picks sensible settings from `NODE_ENV`: debug + HMR in development, `--optimize` in production.

### Dev server (`Bun.serve` + HTML imports)

Register the plugin in `bunfig.toml`:

```toml
[serve.static]
plugins = ["bun-elm-plugin"]
```

Import compiled Elm from your frontend code:

```ts
// main.ts
import { Elm } from "./src/Main.elm";

Elm.Main.init({ node: document.getElementById("app") });
```

```ts
// server.ts
import index from "./index.html";

Bun.serve({
  routes: { "/": index },
  development: { hmr: true, console: true },
});
```

Run `bun server.ts`, open the page, and edit `.elm` files. Changes to `Main.elm` or any module it
imports recompile and hot-swap the program without losing state.

Compile errors are rendered the way `elm make` prints them, with Elm's colours, both in the
terminal and in a full-screen overlay in the browser. The running program stays underneath; fix
the error and the next save removes the overlay and hot-swaps the fixed program with the model it
had. If the error happens on first load, the program starts as soon as it compiles.

For TypeScript, add the ambient module declaration to your `tsconfig.json`:

```json
{ "compilerOptions": { "types": ["bun", "bun-elm-plugin/client"] } }
```

### Options

The named export `elm(options)` builds a configured plugin. For the dev server, create a small
module that calls it and point `bunfig.toml` at that module:

```ts
// elm.plugin.ts
import { elm } from "bun-elm-plugin";

export default elm({ debug: true });
```

```toml
[serve.static]
plugins = ["./elm.plugin.ts"]
```

| Option      | Default                       | Description                                              |
| ----------- | ----------------------------- | -------------------------------------------------------- |
| `debug`     | `NODE_ENV !== "production"`   | Compile with `--debug` (Elm's time-travelling debugger). |
| `optimize`  | `NODE_ENV === "production"`   | Compile with `--optimize`.                               |
| `hmr`       | `NODE_ENV !== "production"`   | Append the hot-swap runtime to each compiled module.     |
| `pathToElm` | `"elm"`                       | Path to the Elm compiler.                                |
| `cwd`       | closest `elm.json`            | Directory to run `elm make` in.                          |

### Production builds (`Bun.build`)

With `NODE_ENV=production` the default export already compiles with `--optimize` and without HMR.
To force that regardless of the environment:

```ts
import { elm } from "bun-elm-plugin";

await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  minify: true,
  plugins: [elm({ optimize: true, hmr: false })],
});
```

Even with `hmr: true`, Bun strips the `if (import.meta.hot) { ... }` block from production bundles.

## How hot reloading works

- Each imported `.elm` file is compiled with `elm make`, converted from Elm's IIFE into an ES
  module exporting `Elm`, and gets a hot-swap runtime appended. The runtime wraps `Elm.*.init`,
  records each program's latest model, and on replacement re-inits the new program with the old
  model, reconnecting port subscriptions and preserving `Browser.Navigation.Key`.
- Bun's dev server only re-bundles the file that changed, never its importers, and plugins cannot
  register extra watch files. So the generated module also `import`s every project-local module the
  entry depends on (as empty self-accepting stubs) to get them watched. When one of those changes,
  the plugin rewrites the entry `.elm` file with its own unchanged contents, which is what nudges
  Bun into recompiling it. A content hash per file prevents re-bundles from looping.
- If the program's `init` result changed, a swap would be unsound, so the page reloads instead.
- On a compile error in dev, the plugin serves a small error module instead of failing the build.
  It draws the overlay, keeps the dependency imports so Bun keeps watching them, and exports a stub
  `Elm` that records `init` calls for the real module to replay once it compiles.

## Using with other plugins

Bun runs the plugins listed in `bunfig.toml` in order, and each file is handled by the first
plugin whose filter matches, so bun-elm-plugin composes with others. The example pairs it with
[bun-plugin-tailwind](https://github.com/bun-community/bun-plugin-tailwind):

```toml
[serve.static]
plugins = ["bun-plugin-tailwind", "bun-elm-plugin"]
```

Tailwind scans the project tree for class names, `.elm` files included, so adding a new utility
class in an Elm view regenerates the stylesheet in the same hot update that swaps the program.

## Development

```sh
bun install
bun test
bun check
bun run build            # bundle + declarations to dist/ (what gets published)
bun run example          # dev server with HMR + Tailwind at http://localhost:3000
bun run example:build    # production build to example/dist
```

## Credits

The hot-swap runtime is adapted from vite-plugin-elm (MIT, hmsk) and elm-hot (MIT, Keith
Lazuka). The IIFE-to-ESM rewrite follows elm-esm (MIT, ChristophP).

## License

MIT
