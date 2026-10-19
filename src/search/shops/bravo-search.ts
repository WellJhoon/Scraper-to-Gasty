import { BRAVO_AUTH_TOKEN } from "../../api-endpoints.js";
import { postgresClient } from "../../db/client.js";
import { getBravoHeaders } from "../../http-client.js";
import type { LiveSearchResultItem, ShopSearchOptions, ShopSearchResult } from "../types.js";
import { BRAVO_CATALOG_ITEMS, type BravoCatalogItem } from "./bravo-catalog.data.js";

const SHOP_ID = 6;
const SHOP_NAME = "Supermercados Bravo";
const DEFAULT_LIMIT = 10;
const DEFAULT_TIMEOUT_MS = 4000;
const BRAVO_API_BASE_URL = "https://bravova-api.superbravo.com.do";
const BRAVO_IMAGE_BASE_URL = "https://bravova-resources.superbravo.com.do/images/catalogo/big";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function searchBravo(
  query: string,
  options: ShopSearchOptions = {}
): Promise<ShopSearchResult> {
  const start = Date.now();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 50));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const clean = normalize(query);

  if (!clean) {
    return {
      shopId: SHOP_ID,
      shopName: SHOP_NAME,
      items: [],
      durationMs: Date.now() - start,
    };
  }

  const itemsMap = new Map<string, LiveSearchResultItem>();

  // 1. Search in-memory verified Bravo catalog dataset (including Marca BRAVO)
  const tokens = clean.split(/\s+/).filter(Boolean);
  const catalogMatches = BRAVO_CATALOG_ITEMS.filter((item) => {
    const itemNorm = normalize(`${item.name} ${item.brand} ${item.category} ${item.categorySlug}`);
    return tokens.every((token) => itemNorm.includes(token));
  });

  for (const item of catalogMatches) {
    const sku = item.id.replace(/^bravo-/, "");
    const nameKey = normalize(item.name);
    itemsMap.set(nameKey, {
      shopId: SHOP_ID,
      shopName: SHOP_NAME,
      productName: item.name,
      currentPrice: item.price,
      regularPrice: undefined,
      imageUrl: item.imageUrl,
      url: `https://superbravo.com.do/articulos/${sku}`,
      sku,
    });
  }

  // 2. Search PostgreSQL database for shopId = 6
  try {
    const dbRows = await postgresClient`
      select
        p.id as "productId",
        p.name as "productName",
        p.image as "imageUrl",
        psp."currentPrice",
        psp."regularPrice",
        psp.url,
        psp.api
      from products p
      inner join products_shops_prices psp
        on psp."productId" = p.id
      where psp."shopId" = ${SHOP_ID}
        and coalesce(p.deleted, false) = false
        and coalesce(psp.hidden, false) = false
        and (
          p.name ilike ${"%" + query + "%"}
          or p.name ilike ${"%" + clean + "%"}
        )
      limit ${limit}
    `;

    for (const row of dbRows) {
      const price = Number(row.currentPrice);
      if (!price || price <= 0) continue;
      const name = String(row.productName || "Artículo Bravo");
      const nameKey = normalize(name);
      if (!itemsMap.has(nameKey)) {
        itemsMap.set(nameKey, {
          shopId: SHOP_ID,
          shopName: SHOP_NAME,
          productName: name,
          currentPrice: price,
          regularPrice: row.regularPrice ? Number(row.regularPrice) : undefined,
          imageUrl: row.imageUrl ? String(row.imageUrl) : undefined,
          url: row.url ? String(row.url) : `https://superbravo.com.do/articulos/${row.productId}`,
          sku: String(row.productId),
        });
      }
    }
  } catch {
    // Database query is optional fallback
  }

  // 3. Optional live Bravo API query (if query has a numeric ID or during direct fetch)
  if (itemsMap.size < limit && /^\d+$/.test(query.trim())) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const url = `${BRAVO_API_BASE_URL}/public/articulo/get?idArticulo=${encodeURIComponent(query.trim())}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          ...getBravoHeaders(),
          "X-Auth-Token": BRAVO_AUTH_TOKEN,
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (response.ok) {
        const json: any = await response.json().catch(() => null);
        const art = json?.return;
        if (art && art.nombreArticulo) {
          const externalId = art.idexternoArticulo || art.idArticulo;
          const currentPrice = Number(art.precionormalArticulo ?? art.pvpArticulo);
          if (currentPrice > 0) {
            const key = `api-${art.idArticulo}`;
            itemsMap.set(key, {
              shopId: SHOP_ID,
              shopName: SHOP_NAME,
              productName: String(art.nombreArticulo),
              currentPrice,
              regularPrice: undefined,
              imageUrl: externalId ? `${BRAVO_IMAGE_BASE_URL}/${encodeURIComponent(externalId)}_1.png?v=124` : undefined,
              url: `https://superbravo.com.do/articulos/${art.idArticulo}`,
              sku: String(art.idArticulo),
            });
          }
        }
      }
    } catch {
      // Live API rate-limited or timed out, local catalog and DB already populated
    }
  }

  const items = Array.from(itemsMap.values()).slice(0, limit);

  return {
    shopId: SHOP_ID,
    shopName: SHOP_NAME,
    items,
    durationMs: Date.now() - start,
  };
}
