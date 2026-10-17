import { SIRENA_PRODUCTS_SEARCH_API_URL } from "../../api-endpoints.js";
import { getSirenaHeaders } from "../../http-client.js";
import type { LiveSearchResultItem, ShopSearchOptions, ShopSearchResult } from "../types.js";

const SHOP_ID = 1;
const SHOP_NAME = "La Sirena";
const DEFAULT_LIMIT = 10;
const DEFAULT_TIMEOUT_MS = 6000;

export async function searchSirena(
  query: string,
  options: ShopSearchOptions = {}
): Promise<ShopSearchResult> {
  const start = Date.now();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 50));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const searchUrl = `${SIRENA_PRODUCTS_SEARCH_API_URL}?ft=${encodeURIComponent(query)}&_from=0&_to=${limit - 1}&sc=1`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(searchUrl, {
      method: "GET",
      headers: getSirenaHeaders(),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok && response.status !== 206) {
      throw new Error(`Sirena search responded with HTTP ${response.status}`);
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      return {
        shopId: SHOP_ID,
        shopName: SHOP_NAME,
        items: [],
        durationMs: Date.now() - start,
      };
    }

    const items: LiveSearchResultItem[] = [];

    for (const item of data) {
      const firstItem = item.items?.[0];
      const offer = firstItem?.sellers?.[0]?.commertialOffer;
      const currentPrice = offer?.Price ? Number(offer.Price) : null;
      if (!currentPrice || currentPrice <= 0) {
        continue;
      }

      const listPrice = offer?.ListPrice ? Number(offer.ListPrice) : undefined;
      const regularPrice = listPrice && listPrice > currentPrice ? listPrice : undefined;

      let link = item.link;
      if (!link && item.linkText) {
        link = `https://www.sirena.do/${item.linkText}/p`;
      }

      const imageUrl = firstItem?.images?.[0]?.imageUrl || undefined;
      const ean = firstItem?.ean ? String(firstItem.ean) : undefined;
      const sku = firstItem?.itemId ? String(firstItem.itemId) : undefined;

      items.push({
        shopId: SHOP_ID,
        shopName: SHOP_NAME,
        productName: item.productName || item.brand || "Producto La Sirena",
        currentPrice,
        regularPrice,
        imageUrl,
        url: link || "https://www.sirena.do",
        ean,
        sku,
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
