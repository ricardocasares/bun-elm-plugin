import { describe, expect, test } from "bun:test";
import { header, parseReport, renderAnsi, renderHtml, renderPlain } from "./report.ts";

const stderr = JSON.stringify({
  type: "compile-errors",
  errors: [
    {
      path: "/proj/src/View.elm",
      name: "View",
      problems: [
        {
          title: "TYPE MISMATCH",
          region: { start: { line: 8, column: 24 }, end: { line: 8, column: 25 } },
          message: [
            "I thought I was appending ",
            { bold: false, underline: false, color: "yellow", string: "String" },
            " values:\n\n8|     text (\"a\" ++ n)\n                   ",
            { bold: false, underline: false, color: "RED", string: "^" },
            "\nTry <this>",
          ],
        },
      ],
    },
  ],
});

describe("parseReport", () => {
  test("compile-errors", () => {
    const r = parseReport(stderr)!;
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.problems[0]!.title).toBe("TYPE MISMATCH");
  });
  test("project-level error", () => {
    const r = parseReport(JSON.stringify({ type: "error", path: null, title: "NO elm.json FILE", message: ["x"] }))!;
    expect(r.errors[0]!.path).toBeNull();
    expect(r.errors[0]!.problems[0]!.title).toBe("NO elm.json FILE");
  });
  test("non-json", () => {
    expect(parseReport("elm: command not found")).toBeUndefined();
  });
});

describe("rendering", () => {
  test("header pads to 80 columns like elm", () => {
    const h = header("TYPE MISMATCH", "src/View.elm");
    expect(h).toHaveLength(80);
    expect(h.startsWith("-- TYPE MISMATCH ---")).toBe(true);
    expect(h.endsWith(" src/View.elm")).toBe(true);
  });
  test("plain keeps layout and relative path", () => {
    const out = renderPlain(parseReport(stderr)!, "/proj");
    expect(out).toContain("-- TYPE MISMATCH ");
    expect(out).toContain(" src/View.elm\n\nI thought I was appending String values:\n\n8|     text");
    expect(out).toContain("                   ^\nTry <this>");
  });
  test("ansi colours chunks and header", () => {
    const out = renderAnsi(parseReport(stderr)!, "/proj");
    expect(out).toContain("\x1b[36m-- TYPE MISMATCH");
    expect(out).toContain("\x1b[33mString\x1b[0m");
    expect(out).toContain("\x1b[91m^\x1b[0m");
  });
  test("html escapes and styles", () => {
    const out = renderHtml(parseReport(stderr)!, "/proj");
    expect(out).toContain("Try &lt;this&gt;");
    expect(out).toMatch(/<span style="color:#[0-9a-f]+">String<\/span>/);
  });
});
