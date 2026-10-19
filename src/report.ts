/**
 * Elm's `--report=json` output, rendered for the terminal (ANSI) and the browser (HTML).
 * Layout mirrors what `elm make` prints itself: a cyan `-- TITLE ---- path` header per problem
 * followed by the message, with Elm's own colour hints for carets, types and suggestions.
 */
import { relative } from "node:path";

export interface StyledChunk {
  bold: boolean;
  underline: boolean;
  color: string | null;
  string: string;
}
export type MessageChunk = string | StyledChunk;

export interface Problem {
  title: string;
  region?: { start: { line: number; column: number }; end: { line: number; column: number } };
  message: MessageChunk[];
}

export interface ElmReport {
  /** One entry per file with problems. `path` may be null for project-level errors. */
  errors: { path: string | null; problems: Problem[] }[];
}

export const parseReport = (stderr: string): ElmReport | undefined => {
  let json: any;
  try {
    json = JSON.parse(stderr);
  } catch {
    return undefined;
  }
  if (json?.type === "compile-errors" && Array.isArray(json.errors)) {
    return {
      errors: json.errors.map((e: any) => ({ path: e.path ?? null, problems: e.problems ?? [] })),
    };
  }
  if (json?.type === "error") {
    return { errors: [{ path: json.path ?? null, problems: [{ title: json.title, message: json.message }] }] };
  }
  return undefined;
};

const HEADER_WIDTH = 80;

export const header = (title: string, path: string): string => {
  const dashes = Math.max(1, HEADER_WIDTH - title.length - path.length - 5);
  return `-- ${title} ${"-".repeat(dashes)} ${path}`.trimEnd();
};

const displayPath = (path: string | null, root: string): string => (path ? relative(root, path) : "");

/** Walk the report, emitting header and message chunks through the given formatters. */
const render = (
  report: ElmReport,
  root: string,
  fmt: {
    header: (text: string) => string;
    chunk: (chunk: StyledChunk) => string;
    text: (text: string) => string;
  },
): string => {
  const out: string[] = [];
  for (const file of report.errors) {
    for (const problem of file.problems) {
      out.push(fmt.header(header(problem.title, displayPath(file.path, root))));
      out.push("");
      out.push(
        problem.message
          .map((c) => (typeof c === "string" ? fmt.text(c) : fmt.chunk(c)))
          .join(""),
      );
      out.push("");
      out.push("");
    }
  }
  return out.join("\n").trimEnd() + "\n";
};

// ---- ANSI -------------------------------------------------------------------------------------

const ANSI_COLORS: Record<string, number> = {
  black: 30, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37,
  BLACK: 90, RED: 91, GREEN: 92, YELLOW: 93, BLUE: 94, MAGENTA: 95, CYAN: 96, WHITE: 97,
};

const ansiChunk = (c: StyledChunk): string => {
  const codes: number[] = [];
  if (c.bold) codes.push(1);
  if (c.underline) codes.push(4);
  if (c.color && ANSI_COLORS[c.color] !== undefined) codes.push(ANSI_COLORS[c.color]!);
  return codes.length ? `\x1b[${codes.join(";")}m${c.string}\x1b[0m` : c.string;
};

export const renderAnsi = (report: ElmReport, root: string): string =>
  render(report, root, {
    header: (t) => `\x1b[36m${t}\x1b[0m`,
    chunk: ansiChunk,
    text: (t) => t,
  });

// ---- plain text (Bun's overlay, Bun.build logs) -----------------------------------------------

export const renderPlain = (report: ElmReport, root: string): string =>
  render(report, root, { header: (t) => t, chunk: (c) => c.string, text: (t) => t });

// ---- HTML (our dev overlay) -------------------------------------------------------------------

const CSS_COLORS: Record<string, string> = {
  black: "#777", red: "#e06c75", green: "#98c379", yellow: "#e5c07b", blue: "#61afef",
  magenta: "#c678dd", cyan: "#56b6c2", white: "#eee",
  BLACK: "#999", RED: "#ff6b6b", GREEN: "#b5e86f", YELLOW: "#ffd866", BLUE: "#82c0ff",
  MAGENTA: "#e39cff", CYAN: "#7fe3ee", WHITE: "#fff",
};

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const htmlChunk = (c: StyledChunk): string => {
  const style: string[] = [];
  if (c.bold) style.push("font-weight:bold");
  if (c.underline) style.push("text-decoration:underline");
  if (c.color && CSS_COLORS[c.color]) style.push(`color:${CSS_COLORS[c.color]}`);
  return style.length ? `<span style="${style.join(";")}">${escapeHtml(c.string)}</span>` : escapeHtml(c.string);
};

export const renderHtml = (report: ElmReport, root: string): string =>
  render(report, root, {
    header: (t) => `<span style="color:${CSS_COLORS.cyan}">${escapeHtml(t)}</span>`,
    chunk: htmlChunk,
    text: escapeHtml,
  });

export const problemCount = (report: ElmReport): number =>
  report.errors.reduce((n, e) => n + e.problems.length, 0);
