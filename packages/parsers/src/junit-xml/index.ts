import type { TestPipeParser, ParseOptions } from "@testpipe/core";
import type { TestRun } from "@testpipe/core";
import { normalizeJunit } from "./normalize.js";

function hasPytestProperties(input: string): boolean {
  return input.includes("python_class") || input.includes("python_file") || input.includes("python_function");
}

export const junitXmlParser: TestPipeParser = {
  id: "junit-xml",
  name: "JUnit XML",
  fileExtensions: [".xml"],

  detect(input: string, filename?: string): number {
    const trimmed = input.trimStart();
    if (!trimmed.startsWith("<") && !trimmed.startsWith("<?xml")) {
      return 0.0;
    }
    const hasTestsuites = /<testsuites[\s>]/.test(input) || /<testsuite[\s>]/.test(input);
    const hasTestcase = /<testcase[\s>]/.test(input);
    if (hasTestsuites && hasTestcase) {
      if (hasPytestProperties(input)) {
        return 0.98;
      }
      return 0.90;
    }
    if (filename?.endsWith(".xml")) return 0.10;
    return 0.0;
  },

  parse(input: string, options?: ParseOptions): TestRun {
    return normalizeJunit(input, options);
  }
};
