import { readFileSync } from "fs";
import { detectParser, getParser } from "@testpipe/core";
import type { ParseOptions } from "@testpipe/core";
import { emitHttp } from "@testpipe/emitters/http";

export async function runPushCommand(
  file: string,
  url: string,
  token: string,
  format?: string,
  strict?: boolean
): Promise<void> {
  let input: string;
  try {
    input = readFileSync(file, "utf-8");
  } catch {
    process.stderr.write(`Error: File not found: ${file}\n`);
    process.exit(1);
  }

  const parser = format ? getParser(format) : detectParser(input, file);
  if (!parser) {
    process.stderr.write("Error: Could not detect test result format.\n");
    process.exit(1);
  }

  const parseOptions: ParseOptions = { strict };
  const run = parser.parse(input, parseOptions);

  try {
    await emitHttp(run, url, token);
    process.stdout.write(`Pushed run ${run.id} to ${url}\n`);
  } catch (e) {
    process.stderr.write(`Error: Push failed: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
}
