import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { findAllDependencies, parseImports } from "./dependencies.ts";
import { loadElmProject } from "./elm-json.ts";

describe("parseImports", () => {
  test("reads plain, aliased and exposing imports", () => {
    const src = `module Main exposing (main)

import Browser
import Html.Attributes as Attr
import Html.Events exposing (onClick)
import Page.Home.View
`;
    expect(parseImports(src)).toEqual(["Browser", "Html.Attributes", "Html.Events", "Page.Home.View"]);
  });

  test("ignores imports inside comments and indented text", () => {
    const src = `-- import Commented
{- import Block
   import Multi.Line -}
import Real
    import Indented
`;
    expect(parseImports(src)).toEqual(["Real"]);
  });
});

describe("findAllDependencies", () => {
  test("collects project-local modules transitively and skips packages", async () => {
    const entry = resolve(import.meta.dir, "../example/src/Main.elm");
    const project = await loadElmProject(entry);
    expect(project?.root).toBe(resolve(import.meta.dir, "../example"));
    const deps = await findAllDependencies(entry, project!);
    expect(deps).toEqual([resolve(import.meta.dir, "../example/src/View.elm")]);
  });
});
