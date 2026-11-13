import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import * as axeMatchers from "vitest-axe/matchers";

expect.extend(jestDomMatchers);
expect.extend(axeMatchers);

afterEach(() => {
  cleanup();
});
