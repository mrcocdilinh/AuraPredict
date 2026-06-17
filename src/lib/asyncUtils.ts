import { RPC_CALL_STAGGER_MS } from "../constants";
import { sleep } from "./errorUtils";

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
        if (RPC_CALL_STAGGER_MS > 0) {
          await sleep(RPC_CALL_STAGGER_MS);
        }
      }
    })
  );

  return results;
}
