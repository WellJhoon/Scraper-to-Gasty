import { NACIONAL_REST_API_URL } from "../../api-endpoints.js";
import { getRandomUserAgent } from "../../http-client.js";
import type { LiveSearchResultItem, ShopSearchOptions, ShopSearchResult } from "../types.js";

const SHOP_ID = 2;
const SHOP_NAME = "Nacional";
const DEFAULT_LIMIT = 10;
const DEFAULT_TIMEOUT_MS = 6000;
const NACIONAL_BASE_URL = "https://supermercadosnacional.com";
const NACIONAL_MEDIA_BASE_URL = "https://supermercadosnacional.com/media/catalog/product";

export async function searchNacional(
  query: string,
  options: ShopSearchOptions = {}
): Promise<ShopSearchResult> {
  const start = Date.now();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 50));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const url = new URL(NACIONAL_REST_API_URL);
    url.searchParams.set("searchCriteria[filter_groups][0][filters][0][field]", "name");
    url.searchParams.set("searchCriteria[filter_groups][0][filters][0][value]", `%${query}%`);
    url.searchParams.set("searchCriteria[filter_groups][0][filters][0][condition_type]", "like");
    url.searchParams.set("searchCriteria[pageSize]", String(limit));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": getRandomUserAgent(),
        Referer: `${NACIONAL_BASE_URL}/`,
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      throw new Error(`Nacional search responded with HTTP ${response.status}`);
    }

    const data: any = await response.json();
    const rawItems: any[] = Array.isArray(data?.items) ? data.items : [];

    const items: LiveSearchResultItem[] = [];

    for (const item of rawItems) {
      const price = Number(item.price);
      if (!price || price <= 0) {
        continue;
      }

      const customAttrs: Array<{ attribute_code: string; value: any }> =
        item.custom_attributes ?? [];

      const findAttr = (code: string) =>
        customAttrs.find((a) => a.attribute_code === code)?.value;

      const urlPath = findAttr("url_path") || findAttr("url_key");
      const url = urlPath
        ? `${NACIONAL_BASE_URL}/${String(urlPath).replace(/^\//, "").replace(/\.html?$/i, "")}`
        : `${NACIONAL_BASE_URL}/catalogsearch/result/?q=${encodeURIComponent(query)}`;

      const rawImage = findAttr("image") || findAttr("small_image") || findAttr("thumbnail");
      let imageUrl: string | undefined;
      if (typeof rawImage === "string" && rawImage.trim() && rawImage !== "no_selection") {
        imageUrl = rawImage.startsWith("http")
          ? rawImage
          : `${NACIONAL_MEDIA_BASE_URL}${rawImage.startsWith("/") ? "" : "/"}${rawImage}`;
      }

      const ean = findAttr("eans") || findAttr("ean");
      const specialPrice = Number(findAttr("special_price"));
      let currentPrice = price;
      let regularPrice: number | undefined;

      if (specialPrice && specialPrice > 0 && specialPrice < price) {
        currentPrice = specialPrice;
        regularPrice = price;
      }

      items.push({
        shopId: SHOP_ID,
        shopName: SHOP_NAME,
        productName: item.name || "Producto Nacional",
        currentPrice,
        regularPrice,
        imageUrl,
        url,
        ean: ean ? String(ean) : undefined,
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
