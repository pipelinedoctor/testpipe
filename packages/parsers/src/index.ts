import { registerParser } from "@testpipe/core";
import { junitXmlParser } from "./junit-xml/index.js";
import { jestJsonParser } from "./jest-json/index.js";
import { vitestJsonParser } from "./vitest-json/index.js";
import { goTestJsonParser } from "./go-test-json/index.js";

registerParser(junitXmlParser);
registerParser(jestJsonParser);
registerParser(vitestJsonParser);
registerParser(goTestJsonParser);

export { junitXmlParser, jestJsonParser, vitestJsonParser, goTestJsonParser };
