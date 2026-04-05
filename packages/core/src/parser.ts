import type { TestRun } from "./schema.js";

export interface ParseOptions {
  /** Override detected framework name */
  framework?: string;
  /** Environment metadata to attach to the TestRun */
  environment?: Record<string, string>;
  /** If true, throw on parse errors instead of returning partial results */
  strict?: boolean;
}

export interface TestPipeParser {
  readonly id: string;
  readonly name: string;
  readonly fileExtensions: string[];
  detect(input: string, filename?: string): number;
  parse(input: string, options?: ParseOptions): TestRun;
}

const registry: TestPipeParser[] = [];

export function registerParser(parser: TestPipeParser): void {
  registry.push(parser);
}

export function getParser(id: string): TestPipeParser | undefined {
  return registry.find(p => p.id === id);
}

export function getAllParsers(): TestPipeParser[] {
  return [...registry];
}
