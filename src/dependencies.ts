import { join } from "node:path";
import type { ElmProject } from "./elm-json.ts";

const stripComments = (source: string): string =>
  source.replace(/\{-[\s\S]*?-\}/g, "").replace(/--[^\n]*/g, "");

/** Module names imported by an Elm source file (`import Foo.Bar as B exposing (..)`). */
export const parseImports = (source: string): string[] => {
  const names: string[] = [];
  const re = /^import\s+([A-Z][\w]*(?:\.[A-Z][\w]*)*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripComments(source))) !== null) names.push(m[1]!);
  return names;
};

const moduleToFile = async (name: string, project: ElmProject): Promise<string | undefined> => {
  const rel = name.split(".").join("/") + ".elm";
  for (const dir of project.sourceDirectories) {
    const candidate = join(dir, rel);
    if (await Bun.file(candidate).exists()) return candidate;
  }
  return undefined; // a package module (elm/core etc.), not ours to watch
};

/**
 * Every project-local .elm file transitively imported by `entry` (excluding `entry` itself).
 * Package modules are skipped: they can't change under us.
 */
export const findAllDependencies = async (entry: string, project: ElmProject): Promise<string[]> => {
  const visited = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    let source: string;
    try {
      source = await Bun.file(file).text();
    } catch {
      continue;
    }
    for (const name of parseImports(source)) {
      const resolved = await moduleToFile(name, project);
      if (resolved && !visited.has(resolved)) {
        visited.add(resolved);
        queue.push(resolved);
      }
    }
  }
  visited.delete(entry);
  return [...visited];
};
