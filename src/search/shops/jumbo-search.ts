import { getRandomUserAgent } from "../../http-client.js";
import { JUMBO_GRAPHQL_URL, resolveJumboStoreCode } from "../../shops/jumbo-shared.js";
import type { LiveSearchResultItem, ShopSearchOptions, ShopSearchResult } from "../types.js";

const SHOP_ID = 3;
const SHOP_NAME = "Jumbo";
const DEFAULT_LIMIT = 10;
const DEFAULT_TIMEOUT_MS = 6000;
const JUMBO_BASE_URL = "https://jumbo.com.do";

const JUMBO_SEARCH_QUERY = `query SearchJumboProducts($search: String!, $pageSize: Int!) {
  products(search: $search, pageSize: $pageSize) {
    items {
      sku
      name
      url_key
      url_suffix
      image {
        url
      }
      thumbnail {
        url
      }
      price_range {
        minimum_price {
          final_price {
            value
          }
          regular_price {
            value
          }
        }
      }
    }
  }
}`;

export async function searchJumbo(
  query: string,
  options: ShopSearchOptions = {}
): Promise<ShopSearchResult> {
  const start = Date.now();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 50));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const storeCode = resolveJumboStoreCode() || "jumbo";

    const response = await fetch(JUMBO_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        store: storeCode,
        "User-Agent": getRandomUserAgent(),
        Referer: `${JUMBO_BASE_URL}/`,
      },
      body: JSON.stringify({
        query: JUMBO_SEARCH_QUERY,
        variables: {
          search: query,
          pageSize: limit,
        },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      throw new Error(`Jumbo GraphQL responded with HTTP ${response.status}`);
    }

    const payload: any = await response.json();
    const rawItems: any[] = payload?.data?.products?.items ?? [];

    const items: LiveSearchResultItem[] = [];

    for (const item of rawItems) {
      const minPrice = item.price_range?.minimum_price;
      const currentPrice = Number(minPrice?.final_price?.value);
      if (!currentPrice || currentPrice <= 0) {
        continue;
      }

      const rawRegular = Number(minPrice?.regular_price?.value);
      const regularPrice = rawRegular && rawRegular > currentPrice ? rawRegular : undefined;

      const urlKey = item.url_key ? String(item.url_key).replace(/^\//, "") : "";
      const urlSuffix = item.url_suffix || "";
      const url = urlKey
        ? `${JUMBO_BASE_URL}/${urlKey}${urlSuffix}`
        : `${JUMBO_BASE_URL}/catalogsearch/result/?q=${encodeURIComponent(query)}`;

      const imageUrl = item.image?.url || item.thumbnail?.url || undefined;

      items.push({
        shopId: SHOP_ID,
        shopName: SHOP_NAME,
        productName: item.name || "Producto Jumbo",
        currentPrice,
        regularPrice,
        imageUrl,
        url,
        sku: item.sku ? String(item.sku) : undefined,
      });
    }

    return {
      shopId: SHOP_ID,
      shopName: SHOP_NAME,
      items,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      shopId: SHOP_ID,
      shopName: SHOP_NAME,
      items: [],
      error: errorMsg,
      durationMs: Date.now() - start,
    };
  }
}
