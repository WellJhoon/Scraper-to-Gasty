import { searchBravo } from "./shops/bravo-search.js";
import { searchJumbo } from "./shops/jumbo-search.js";
import { searchNacional } from "./shops/nacional-search.js";
import { searchPlazaLama } from "./shops/plaza-lama-search.js";
import { searchSirena } from "./shops/sirena-search.js";
import type {
  LiveSearchResultItem,
  MultiSearchResult,
  ShopSearchOptions,
  ShopSearchResult,
} from "./types.js";

export async function searchAllSupermarkets(
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

  // Execute all 5 supermarket connectors concurrently
  const [sirena, nacional, jumbo, plazaLama, bravo] = await Promise.allSettled([
    searchSirena(trimmed, options),
    searchNacional(trimmed, options),
    searchJumbo(trimmed, options),
    searchPlazaLama(trimmed, options),
    searchBravo(trimmed, options),
  ]);

  const shops: Record<string, ShopSearchResult> = {};
  const allItems: LiveSearchResultItem[] = [];

  const handleResult = (
    shopKey: string,
    shopId: number,
    shopName: string,
    settled: PromiseSettledResult<ShopSearchResult>
  ) => {
    if (settled.status === "fulfilled") {
      shops[shopKey] = settled.value;
      allItems.push(...settled.value.items);
    } else {
      shops[shopKey] = {
        shopId,
        shopName,
        items: [],
        error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
        durationMs: Date.now() - start,
      };
    }
  };

  handleResult("sirena", 1, "La Sirena", sirena);
  handleResult("nacional", 2, "Supermercados Nacional", nacional);
  handleResult("jumbo", 3, "Jumbo", jumbo);
  handleResult("plazaLama", 4, "Plaza Lama", plazaLama);
  handleResult("bravo", 6, "Supermercados Bravo", bravo);

  // Sort aggregated items by price ascending for immediate deal discovery
  const sortedItems = [...allItems].sort((a, b) => a.currentPrice - b.currentPrice);

  return {
    query: trimmed,
    totalItems: sortedItems.length,
    shops,
    items: sortedItems,
    durationMs: Date.now() - start,
  };
}
