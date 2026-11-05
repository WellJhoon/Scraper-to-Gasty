import { searchBravo } from "./shops/bravo-search.js";
import { searchGarrido } from "./shops/garrido-search.js";
import { searchJumbo } from "./shops/jumbo-search.js";
import { searchNacional } from "./shops/nacional-search.js";
import { searchPlazaLama } from "./shops/plaza-lama-search.js";
import { searchPriceSmart } from "./shops/pricesmart-search.js";
import { searchSirena } from "./shops/sirena-search.js";
import type {
  LiveSearchResultItem,
  MultiSearchResult,
  ShopSearchOptions,
  ShopSearchResult,
} from "./types.js";

const EXCLUSIVE_STORE_BRAND_REGEX =
  /\b(wala|esentis|zerca|first\s+class|siremas|sirem[aá]s|sirena|l[ií]der|great\s+value|member'?s\s+selection|bravo|plaza\s+lama|garrido)\b/gi;

/**
 * Strips supermarket-exclusive private label tokens from a search query so that
 * searching for e.g. "Jabón Wala 110g" or "Papel Higiénico Líder 4 Rollos"
 * searches by generic product concept ("Jabón 110g", "Papel Higiénico 4 Rollos")
 * across all supermarkets.
 */
export function extractGenericSearchQuery(rawQuery: string): string {
  const generic = rawQuery
    .replace(EXCLUSIVE_STORE_BRAND_REGEX, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return generic || rawQuery.trim();
}

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

  // Use generic product concept query across supermarkets so exclusive brands
  // (Wala, Esentis, Zerca, Líder, Member's Selection) don't block other stores
  const genericQuery = extractGenericSearchQuery(trimmed);

  // Execute all 7 supermarket connectors concurrently
  const [sirena, nacional, jumbo, plazaLama, pricesmart, bravo, garrido] =
    await Promise.allSettled([
      searchSirena(genericQuery, options),
      searchNacional(genericQuery, options),
      searchJumbo(genericQuery, options),
      searchPlazaLama(genericQuery, options),
      searchPriceSmart(genericQuery, options),
      searchBravo(genericQuery, options),
      searchGarrido(genericQuery, options),
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
        error:
          settled.reason instanceof Error
            ? settled.reason.message
            : String(settled.reason),
        durationMs: Date.now() - start,
      };
    }
  };

  handleResult("sirena", 1, "La Sirena", sirena);
  handleResult("nacional", 2, "Supermercados Nacional", nacional);
  handleResult("jumbo", 3, "Jumbo", jumbo);
  handleResult("plazaLama", 4, "Plaza Lama", plazaLama);
  handleResult("pricesmart", 5, "PriceSmart", pricesmart);
  handleResult("bravo", 6, "Supermercados Bravo", bravo);
  handleResult("garrido", 8, "Tiendas Garrido", garrido);

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
