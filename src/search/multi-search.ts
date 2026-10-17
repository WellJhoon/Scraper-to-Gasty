import { searchJumbo } from "./shops/jumbo-search.js";
import { searchNacional } from "./shops/nacional-search.js";
import { searchSirena } from "./shops/sirena-search.js";
import type {
  LiveSearchResultItem,
  MultiSearchResult,
  ShopSearchOptions,
  ShopSearchResult,
} from "./types.js";

export async function searchSupermarketsPhase1(
  query: string,
  options: ShopSearchOptions = {}
): Promise<MultiSearchResult> {
  const start = Date.now();
  const trimmed = query.trim();

  if (!trimmed) {
    return {
      query: "",
      totalItems: 0,
      shops: {},
      items: [],
      durationMs: 0,
    };
  }

  // Execute all 3 supermarket connectors concurrently
  const [sirenaResult, nacionalResult, jumboResult] = await Promise.allSettled([
    searchSirena(trimmed, options),
    searchNacional(trimmed, options),
    searchJumbo(trimmed, options),
  ]);

  const shops: Record<string, ShopSearchResult> = {};
  const allItems: LiveSearchResultItem[] = [];

  const handleResult = (
    shopName: string,
    shopId: number,
    settled: PromiseSettledResult<ShopSearchResult>
  ) => {
    if (settled.status === "fulfilled") {
      shops[shopName] = settled.value;
      allItems.push(...settled.value.items);
    } else {
      shops[shopName] = {
        shopId,
        shopName,
        items: [],
        error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
        durationMs: Date.now() - start,
      };
    }
  };

  handleResult("sirena", 1, sirenaResult);
  handleResult("nacional", 2, nacionalResult);
  handleResult("jumbo", 3, jumboResult);

  // Sort aggregated items by price ascending so user immediately sees the best deals
  const sortedItems = [...allItems].sort((a, b) => a.currentPrice - b.currentPrice);

  return {
    query: trimmed,
    totalItems: sortedItems.length,
    shops,
    items: sortedItems,
    durationMs: Date.now() - start,
  };
}
