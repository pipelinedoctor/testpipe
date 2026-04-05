import { getAllParsers } from "./parser.js";
import type { TestPipeParser } from "./parser.js";

export function detectWithScores(
  input: string,
  filename?: string
): Array<{ parser: TestPipeParser; score: number }> {
  return getAllParsers()
    .map(parser => ({ parser, score: parser.detect(input, filename) }))
    .sort((a, b) => b.score - a.score);
}

export function detectParser(input: string, filename?: string): TestPipeParser | null {
  const scores = detectWithScores(input, filename);
  const above = scores.filter(s => s.score > 0.5);
  if (above.length === 0) return null;
  // Warn on ambiguous detection
  if (above.length >= 2 && above[0].score > 0.8 && above[1].score > 0.8) {
    process.stderr.write(
      `[testpipe] Warning: ambiguous detection — ${above[0].parser.id} (${above[0].score.toFixed(2)}) vs ${above[1].parser.id} (${above[1].score.toFixed(2)})\n`
    );
  }
  return above[0].parser;
}
