import type { TestPipeParser, ParseOptions, TestRun } from "@testpipe/core";
import { normalizeJest } from "./normalize.js";

export const jestJsonParser: TestPipeParser = {
  id: "jest-json",
  name: "Jest JSON",
  fileExtensions: [".json"],

  detect(input: string, filename?: string): number {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      return 0.0;
    }
    if (typeof parsed !== "object" || parsed === null) return 0.05;
    const obj = parsed as Record<string, unknown>;
    const hasNumTotal = typeof obj["numTotalTests"] === "number";
    const hasTestResults = Array.isArray(obj["testResults"]);
    const hasSnapshot = "snapshot" in obj;
    if (hasNumTotal && hasTestResults && hasSnapshot) return 0.90;
    if (hasNumTotal && hasTestResults) return 0.70;
    if (filename?.endsWith(".json")) return 0.05;
    return 0.05;
  },

  parse(input: string, options?: ParseOptions): TestRun {
    return normalizeJest(input, options);
  }
};
