/**
 * Run `fn` over `items` with at most `limit` in flight (fixed worker pool).
 * Order of results matches `items`. Never rejects on its own: callers handle
 * per-item errors inside `fn`.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  const worker = async (): Promise<void> => {
    for (let i = cursor++; i < items.length; i = cursor++) {
      results[i] = await fn(items[i] as T);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
