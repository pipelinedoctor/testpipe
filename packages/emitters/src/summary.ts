import type { TestRun } from "@testpipe/core";

function pad(s: string, width: number, right = false): string {
  if (right) return s.padStart(width);
  return s.padEnd(width);
}

export function emitSummary(run: TestRun, filename?: string): void {
  const w = process.stdout.write.bind(process.stdout);
  const LINE = "─".repeat(54);
  const { summary, sourceFormat, sourceFramework } = run;
  const total = summary.total || 1; // avoid divide by zero

  w(`TestPipe Summary ${LINE.slice(0, 38)}\n`);
  w(` Source:  ${pad(sourceFormat, 14)} Framework: ${sourceFramework ?? "unknown"}\n`);
  if (filename) w(` File:    ${filename}\n`);
  w(`${LINE}\n`);
  w(` ✓  Passed  ${pad(String(summary.passed), 6, true)}    (${((summary.passed / total) * 100).toFixed(1)}%)\n`);
  w(` ✗  Failed  ${pad(String(summary.failed), 6, true)}    (${((summary.failed / total) * 100).toFixed(1)}%)\n`);
  w(` ○  Skipped ${pad(String(summary.skipped), 6, true)}    (${((summary.skipped / total) * 100).toFixed(1)}%)\n`);
  w(`${LINE}\n`);
  w(` Total: ${summary.total} tests   Duration: ${(summary.durationMs / 1000).toFixed(2)}s\n`);

  const failures = run.suites.flatMap(s =>
    s.cases.filter(c => c.status === "failed" || c.status === "errored")
  );

  if (failures.length > 0) {
    w(`\n Failures:\n`);
    failures.forEach((f, i) => {
      w(`   ${i + 1}. ${f.name}\n`);
      if (f.failure) {
        w(`      ${f.failure.message}\n`);
      }
    });
  }
  w(`${LINE}\n`);
}
