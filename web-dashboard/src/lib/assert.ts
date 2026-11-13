/** NASA R5 precondition helpers: fail fast, with a message naming the bad input. */
export function assertId(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid ${name}: expected a non-empty string`);
  }
}
