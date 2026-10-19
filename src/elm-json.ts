import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";

export interface ElmProject {
  /** Directory containing elm.json */
  root: string;
  /** Absolute source directories */
  sourceDirectories: string[];
}

const cache = new Map<string, ElmProject | null>();

export const findElmJsonDir = (from: string): string | undefined => {
  let dir = dirname(from);
  while (true) {
    if (existsSync(join(dir, "elm.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

export const loadElmProject = async (filePath: string): Promise<ElmProject | undefined> => {
  const root = findElmJsonDir(filePath);
  if (!root) return undefined;
  // Re-read on every call so edits to elm.json are picked up; it's a tiny file.
  const json = (await Bun.file(join(root, "elm.json")).json()) as {
    type?: string;
    "source-directories"?: string[];
  };
  const dirs = json.type === "package" ? ["src"] : (json["source-directories"] ?? ["src"]);
  const project = { root, sourceDirectories: dirs.map((d) => resolve(root, d)) };
  cache.set(root, project);
  return project;
};
