import { randomUUID } from "crypto";
import type { TestRun, TestSuite, TestCase, FailureInfo } from "@testpipe/core";
import { computeSummary } from "@testpipe/core";
import type { ParseOptions } from "@testpipe/core";

// Minimal XML node types
interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}
type XmlNode = XmlElement | string;

function isElement(node: XmlNode): node is XmlElement {
  return typeof node === "object";
}

// Strip invalid XML characters
function sanitizeXml(input: string): string {
  // Remove invalid XML 1.0 characters
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

// Minimal recursive-descent XML parser
function parseXml(input: string): XmlElement {
  const sanitized = sanitizeXml(input);
  let pos = 0;

  function skipWhitespace() {
    while (pos < sanitized.length && /\s/.test(sanitized[pos])) pos++;
  }

  function parseString(quote: string): string {
    let result = "";
    while (pos < sanitized.length && sanitized[pos] !== quote) {
      if (sanitized[pos] === "&") {
        if (sanitized.startsWith("&amp;", pos)) { result += "&"; pos += 5; }
        else if (sanitized.startsWith("&lt;", pos)) { result += "<"; pos += 4; }
        else if (sanitized.startsWith("&gt;", pos)) { result += ">"; pos += 4; }
        else if (sanitized.startsWith("&apos;", pos)) { result += "'"; pos += 6; }
        else if (sanitized.startsWith("&quot;", pos)) { result += '"'; pos += 6; }
        else { result += sanitized[pos++]; }
      } else {
        result += sanitized[pos++];
      }
    }
    pos++; // skip closing quote
    return result;
  }

  function parseAttrs(): Record<string, string> {
    const attrs: Record<string, string> = {};
    skipWhitespace();
    while (pos < sanitized.length && sanitized[pos] !== ">" && sanitized[pos] !== "/") {
      // Read attr name
      let name = "";
      while (pos < sanitized.length && !/[\s=/>]/.test(sanitized[pos])) {
        name += sanitized[pos++];
      }
      skipWhitespace();
      if (sanitized[pos] === "=") {
        pos++; // skip =
        skipWhitespace();
        const quote = sanitized[pos++];
        attrs[name] = parseString(quote);
      }
      skipWhitespace();
    }
    return attrs;
  }

  function parseElement(): XmlElement {
    // We are at '<'
    pos++; // skip <
    // Handle XML declaration and comments and CDATA
    if (sanitized[pos] === "?") {
      // XML declaration or processing instruction
      while (pos < sanitized.length && !(sanitized[pos - 1] === "?" && sanitized[pos] === ">")) pos++;
      pos++; // skip >
      skipWhitespace();
      return parseElement();
    }
    if (sanitized.startsWith("!--", pos)) {
      // Comment
      pos += 3;
      while (pos < sanitized.length && !sanitized.startsWith("-->", pos)) pos++;
      pos += 3;
      skipWhitespace();
      if (pos < sanitized.length && sanitized[pos] === "<") return parseElement();
      throw new Error("Expected element after comment");
    }
    if (sanitized.startsWith("![CDATA[", pos)) {
      // CDATA - shouldn't be root
      throw new Error("CDATA at root level");
    }

    // Read tag name
    let tag = "";
    while (pos < sanitized.length && !/[\s>\/]/.test(sanitized[pos])) {
      tag += sanitized[pos++];
    }
    const attrs = parseAttrs();
    skipWhitespace();

    const element: XmlElement = { tag, attrs, children: [], text: "" };

    if (sanitized[pos] === "/") {
      pos += 2; // skip />
      return element;
    }
    pos++; // skip >

    // Parse children
    while (pos < sanitized.length) {
      if (sanitized[pos] === "<") {
        if (sanitized.startsWith("</", pos)) {
          // Closing tag
          pos += 2;
          while (pos < sanitized.length && sanitized[pos] !== ">") pos++;
          pos++; // skip >
          break;
        } else if (sanitized.startsWith("!--", pos + 1)) {
          // Comment - skip it
          pos++;
          pos += 3;
          while (pos < sanitized.length && !sanitized.startsWith("-->", pos)) pos++;
          pos += 3;
        } else if (sanitized.startsWith("![CDATA[", pos + 1)) {
          pos += 9; // skip <![CDATA[
          let cdata = "";
          while (pos < sanitized.length && !sanitized.startsWith("]]>", pos)) {
            cdata += sanitized[pos++];
          }
          pos += 3; // skip ]]>
          element.text += cdata;
          element.children.push(cdata);
        } else {
          const child = parseElement();
          element.children.push(child);
        }
      } else {
        // Text content
        let text = "";
        while (pos < sanitized.length && sanitized[pos] !== "<") {
          if (sanitized[pos] === "&") {
            if (sanitized.startsWith("&amp;", pos)) { text += "&"; pos += 5; }
            else if (sanitized.startsWith("&lt;", pos)) { text += "<"; pos += 4; }
            else if (sanitized.startsWith("&gt;", pos)) { text += ">"; pos += 4; }
            else if (sanitized.startsWith("&apos;", pos)) { text += "'"; pos += 6; }
            else if (sanitized.startsWith("&quot;", pos)) { text += '"'; pos += 6; }
            else { text += sanitized[pos++]; }
          } else {
            text += sanitized[pos++];
          }
        }
        element.text += text;
        if (text.trim()) element.children.push(text);
      }
    }

    return element;
  }

  skipWhitespace();
  return parseElement();
}

function getChildren(el: XmlElement, tag: string): XmlElement[] {
  return el.children.filter((c): c is XmlElement => isElement(c) && c.tag === tag);
}

function getText(el: XmlElement): string {
  return el.children
    .filter((c): c is string => typeof c === "string")
    .join("")
    .trim();
}

function getChildText(el: XmlElement, tag: string): string | null {
  const child = getChildren(el, tag)[0];
  if (!child) return null;
  return getText(child) || null;
}

function parseDuration(val: string | undefined): number {
  if (!val || val === "" || val === "N/A") return 0;
  const n = parseFloat(val);
  if (isNaN(n)) return 0;
  return Math.round(n * 1000);
}

function parseProperties(el: XmlElement): Record<string, string> {
  const props: Record<string, string> = {};
  const propsEl = getChildren(el, "properties")[0];
  if (!propsEl) return props;
  for (const prop of getChildren(propsEl, "property")) {
    const name = prop.attrs["name"];
    const value = prop.attrs["value"] ?? getText(prop);
    if (name) props[name] = value ?? "";
  }
  return props;
}

function normalizeTestCase(tc: XmlElement): TestCase {
  const failures = getChildren(tc, "failure");
  const errors = getChildren(tc, "error");
  const skipped = getChildren(tc, "skipped");

  let status: TestCase["status"] = "passed";
  let failure: FailureInfo | null = null;

  if (skipped.length > 0) {
    status = "skipped";
  } else if (failures.length > 0) {
    status = "failed";
    const messages = failures.map(f => f.attrs["message"] ?? getText(f));
    const bodies = failures.map(f => getText(f));
    failure = {
      type: "assertion_failure",
      message: messages.join("\n---\n"),
      body: bodies.join("\n---\n") || null,
      sourceType: "failure",
    };
  } else if (errors.length > 0) {
    status = "errored";
    const messages = errors.map(e => e.attrs["message"] ?? getText(e));
    const bodies = errors.map(e => getText(e));
    failure = {
      type: "error",
      message: messages.join("\n---\n"),
      body: bodies.join("\n---\n") || null,
      sourceType: "error",
    };
  }

  return {
    name: tc.attrs["name"] ?? "",
    classname: tc.attrs["classname"] ?? null,
    status,
    durationMs: parseDuration(tc.attrs["time"]),
    failure,
    properties: parseProperties(tc),
    attachments: [],
    systemOut: getChildText(tc, "system-out"),
    systemErr: getChildText(tc, "system-err"),
    retries: 0,
  };
}

function flattenSuites(root: XmlElement): XmlElement[] {
  if (root.tag === "testsuite") {
    return [root];
  }
  // testsuites root
  const result: XmlElement[] = [];
  for (const child of getChildren(root, "testsuite")) {
    result.push(...flattenSuites(child));
  }
  return result;
}

function normalizeSuite(suite: XmlElement): TestSuite {
  const cases = getChildren(suite, "testcase").map(normalizeTestCase);
  return {
    name: suite.attrs["name"] ?? "unnamed",
    timestamp: suite.attrs["timestamp"] ?? null,
    durationMs: parseDuration(suite.attrs["time"]),
    properties: parseProperties(suite),
    cases,
    systemOut: getChildText(suite, "system-out"),
    systemErr: getChildText(suite, "system-err"),
  };
}

function detectFramework(input: string): string | null {
  if (input.includes("python_class") || input.includes("python_file") || input.includes("python_function")) {
    return "pytest";
  }
  if (input.includes('junit_family="xunit1"') || input.includes("junit_family=xunit1")) {
    return "pytest-xunit1";
  }
  return null;
}

export function normalizeJunit(input: string, options?: ParseOptions): TestRun {
  const parseErrors: string[] = [];
  let root: XmlElement;
  try {
    root = parseXml(input);
  } catch (e) {
    if (options?.strict) throw e;
    parseErrors.push(`XML parse error: ${e instanceof Error ? e.message : String(e)}`);
    return {
      id: randomUUID(),
      sourceFormat: "junit_xml",
      sourceFramework: options?.framework ?? null,
      timestamp: null,
      durationMs: 0,
      environment: options?.environment ?? null,
      metadata: { parseErrors },
      suites: [],
      summary: { total: 0, passed: 0, failed: 0, errored: 0, skipped: 0, durationMs: 0 },
    };
  }

  const suiteElements = flattenSuites(root);
  const suites = suiteElements.map(normalizeSuite);
  const framework = options?.framework ?? detectFramework(input);

  return {
    id: randomUUID(),
    sourceFormat: framework === "pytest" || framework === "pytest-xunit1" ? "pytest_xml" : "junit_xml",
    sourceFramework: framework,
    timestamp: root.attrs["timestamp"] ?? suites[0]?.timestamp ?? null,
    durationMs: suites.reduce((sum, s) => sum + s.durationMs, 0),
    environment: options?.environment ?? null,
    metadata: { parseErrors },
    suites,
    summary: computeSummary(suites),
  };
}
