import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Register all parsers first
import "./index.js";
import { detectParser } from "@testpipe/core";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(__dirname, "../../../");

function fixture(rel: string): string {
  return readFileSync(resolve(root, "fixtures", rel), "utf-8");
}

describe("Auto-detection", () => {
  it("pytest-xunit2.xml → selects junit-xml (pytest) parser with highest score", () => {
    const input = fixture("junit-xml/pytest-xunit2.xml");
    const parser = detectParser(input, "pytest-xunit2.xml");
    assert.ok(parser, "Expected a parser to be detected");
    assert.equal(parser.id, "junit-xml");
  });

  it("jest-basic.json → selects jest-json parser", () => {
    const input = fixture("jest-json/jest-basic.json");
    const parser = detectParser(input, "jest-basic.json");
    assert.ok(parser, "Expected a parser to be detected");
    assert.equal(parser.id, "jest-json");
  });

  it("go-subtests.ndjson → selects go-test-json parser", () => {
    const input = fixture("go-test-json/go-subtests.ndjson");
    const parser = detectParser(input, "go-subtests.ndjson");
    assert.ok(parser, "Expected a parser to be detected");
    assert.equal(parser.id, "go-test-json");
  });

  it("random text file → returns null (no parser above 0.5)", () => {
    const input = "This is just a plain text file with no test results whatsoever.";
    const parser = detectParser(input, "notes.txt");
    assert.equal(parser, null);
  });
});
