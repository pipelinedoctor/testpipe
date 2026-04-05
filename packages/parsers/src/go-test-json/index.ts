import type { TestPipeParser, ParseOptions, TestRun } from "@testpipe/core";
import { reassembleGoTest } from "./reassemble.js";

export const goTestJsonParser: TestPipeParser = {
  id: "go-test-json",
  name: "Go Test JSON",
  fileExtensions: [".ndjson", ".jsonl"],

  detect(input: string, filename?: string): number {
    const firstLine = input.split("\n").find(l => l.trim() !== "")?.trim();
    if (!firstLine) return 0.0;
    let parsed: unknown;
    try {
      parsed = JSON.parse(firstLine);
    } catch {
      return 0.0;
    }
    if (typeof parsed !== "object" || parsed === null) return 0.0;
    const obj = parsed as Record<string, unknown>;
    if (!("Action" in obj) || !("Package" in obj)) return 0.0;
    const action = obj["Action"];
    if (action === "run" || action === "pass" || action === "fail") return 0.98;
    return 0.95;
  },

  parse(input: string, options?: ParseOptions): TestRun {
    return reassembleGoTest(input, options);
  }
};
