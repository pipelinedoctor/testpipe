import type { TestRun } from "@testpipe/core";

export function emitJson(run: TestRun): string {
  return JSON.stringify(run, null, 2);
}
