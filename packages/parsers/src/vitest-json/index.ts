import type { TestPipeParser, ParseOptions, TestRun } from "@testpipe/core";
import { normalizeVitest } from "./normalize.js";

export const vitestJsonParser: TestPipeParser = {
  id: "vitest-json",
  name: "Vitest JSON",
  fileExtensions: [".json"],

  detect(input: string, filename?: string): number {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      return 0.0;
    }
    if (typeof parsed !== "object" || parsed === null) return 0.0;
    const obj = parsed as Record<string, unknown>;
    const hasNumTotal = typeof obj["numTotalTests"] === "number";
    const hasTestResults = Array.isArray(obj["testResults"]);
    const hasConfig = typeof obj["config"] === "object" && obj["config"] !== null;
    const hasSnapshot = "snapshot" in obj;

    if (hasNumTotal && hasTestResults && hasConfig) return 0.95;
    if (hasNumTotal && hasTestResults && !hasSnapshot) return 0.75;
    return 0.0;
  },

  parse(input: string, options?: ParseOptions): TestRun {
    return normalizeVitest(input, options);
  }
};
