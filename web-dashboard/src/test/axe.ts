import { axe } from "vitest-axe";

/** Runs axe on a rendered container and returns the violation list. */
export async function axeViolations(container: Element) {
  const results = await axe(container);
  return results.violations;
}
