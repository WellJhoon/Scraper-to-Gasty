import { PRICESMART_AUTH_KEY, PRICESMART_DISCOVERY_API_URL } from "../../api-endpoints.js";
import { getRandomUserAgent } from "../../http-client.js";
import { scrapePricesmartPrice } from "../../shops/pricesmart.js";
import type { LiveSearchResultItem, ShopSearchOptions, ShopSearchResult } from "../types.js";

const SHOP_ID = 5;
const SHOP_NAME = "PriceSmart";
const DEFAULT_LIMIT = 6;
const DEFAULT_TIMEOUT_MS = 6000;
const PRICESMART_BASE_URL = "https://www.pricesmart.com/es-do";

export async function searchPriceSmart(
  query: string,
  options: ShopSearchOptions = {}
): Promise<ShopSearchResult> {
  const start = Date.now();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 20));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const authKey = PRICESMART_AUTH_KEY || "ev7libhybjg5h1d1";
    const rawBase =
      PRICESMART_DISCOVERY_API_URL || "https://core.dxpapi.com/api/v1/core/";
    const baseUrl = `${rawBase.replace(/\/+$/, "")}/`;

    const url = new URL(baseUrl);
    url.searchParams.set("url", PRICESMART_BASE_URL);
    url.searchParams.set("start", "0");
    url.searchParams.set("q", query);
    url.searchParams.set("search_type", "keyword");
    url.searchParams.set("rows", String(limit));
    url.searchParams.set("account_id", "7024");
    url.searchParams.set("auth_key", authKey);
    url.searchParams.set("request_id", String(Date.now()));
    url.searchParams.set("domain_key", "pricesmart_bloomreach_io_es");
    url.searchParams.set(
      "fl",
      "pid,title,price,thumb_image,brand,slug,skuid,currency,fractionDigits,master_sku"
    );
    url.searchParams.set("view_id", "DO");
    url.searchParams.set("request_type", "search");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": getRandomUserAgent(),
        Referer: `${PRICESMART_BASE_URL}/`,
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      throw new Error(`PriceSmart API responded with HTTP ${response.status}`);
    }

    const json: any = await response.json();
    const docs = (json?.response?.docs ?? []).slice(0, limit);

    const enriched = await Promise.all(
      docs.map(async (doc: any): Promise<LiveSearchResultItem | null> => {
        const pid = String(doc.pid || doc.skuid || doc.master_sku || "").trim();
        if (!pid || !doc.title) return null;

        const slug = doc.slug ? String(doc.slug).replace(/^\//, "") : "producto";
        const urlStr = `${PRICESMART_BASE_URL}/producto/${slug}/${pid}`;

        let currentPrice = Number(doc.price);
        let regularPrice: number | undefined;

        if (!currentPrice || currentPrice <= 0) {
          const scraped = await scrapePricesmartPrice({
            shopId: SHOP_ID,
            api: pid,
            url: urlStr,
          }).catch(() => null);

          if (scraped && scraped.status === "ok") {
            currentPrice = Number(scraped.currentPrice);
            if (scraped.regularPrice) {
              regularPrice = Number(scraped.regularPrice);
            }
          }
        }

        if (!currentPrice || currentPrice <= 0) {
          return null;
        }

        const imageUrl = doc.thumb_image ? String(doc.thumb_image) : undefined;

        return {
          shopId: SHOP_ID,
          shopName: SHOP_NAME,
          productName: String(doc.title).trim(),
          currentPrice,
          regularPrice,
          imageUrl,
          url: urlStr,
          sku: pid,
        };
      })
    );

    const items = enriched.filter((item): item is LiveSearchResultItem => item !== null);

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
