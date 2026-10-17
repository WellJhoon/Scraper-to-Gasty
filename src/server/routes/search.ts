import type { IncomingMessage, ServerResponse } from "node:http";
import { postgresClient } from "../../db/client.js";
import {
  getCatalogProductWithPrices,
  saveMatchedProductToCatalog,
} from "../../search/catalog-service.js";
import { searchAllSupermarkets } from "../../search/live-search.js";
import { groupEquivalentProducts } from "../../search/product-matcher.js";
import type { MatchedProductGroup } from "../../search/types.js";
import { readJsonBody, sendJson } from "../http-utils.js";

export async function handleHealthRoute(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const [stats] = await postgresClient<
      {
        tables_count: number;
        products_count: number;
        shops_count: number;
        lists_count: number;
      }[]
    >`
      select
        (select count(*)::int from information_schema.tables where table_schema = 'public') as tables_count,
        (select count(*)::int from public.products) as products_count,
        (select count(distinct "shopId")::int from public.products_shops_prices) as shops_count,
        (select count(*)::int from public.shopping_lists) as lists_count
    `;

    sendJson(res, 200, {
      status: "ok",
      db: "connected",
      provider: "supabase-postgresql",
      stats: {
        tablesCount: stats?.tables_count ?? 0,
        shopsCount: stats?.shops_count ?? 0,
        catalogProductsCount: stats?.products_count ?? 0,
        shoppingListsCount: stats?.lists_count ?? 0,
      },
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    sendJson(res, 503, {
      status: "degraded",
      db: "disconnected",
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
}

export async function handleSearchRoute(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<void> {
  const start = Date.now();
  const query = (parsedUrl.searchParams.get("q") ?? parsedUrl.searchParams.get("query") ?? "").trim();
  const liveParam = parsedUrl.searchParams.get("live");
  const isLive = liveParam === null || liveParam === "true" || liveParam === "1";
  const limit = Math.max(1, Math.min(Number(parsedUrl.searchParams.get("limit") ?? 6), 25));

  if (!query) {
    sendJson(res, 400, {
      error: "missing_query",
      message: "Query parameter 'q' is required (e.g. /api/search?q=arroz).",
    });
    return;
  }

  // 1. Search saved personal catalog in Supabase
  const pattern = `%${query}%`;
  const catalogRows = await postgresClient<
    {
      id: number;
      name: string | null;
      ean: string | null;
      image: string | null;
      unit: string | null;
    }[]
  >`
    select "id", "name", "ean", "image", "unit"
    from products
    where coalesce("deleted", false) = false
      and ("name" ilike ${pattern} or "ean" = ${query})
    order by "id" desc
    limit 10
  `;

  const catalogMatches = await Promise.all(
    catalogRows.map(async (prod) => {
      const full = await getCatalogProductWithPrices(prod.id);
      return full;
    })
  );

  // 2. Optionally run live 5-supermarket search + smart matcher
  let liveGroups: MatchedProductGroup[] = [];
  let liveRawCount = 0;

  if (isLive) {
    const liveResult = await searchAllSupermarkets(query, { limit });
    liveRawCount = liveResult.totalItems;
    liveGroups = groupEquivalentProducts(liveResult.items);
  }

  sendJson(res, 200, {
    query,
    live: isLive,
    catalogCount: catalogMatches.filter(Boolean).length,
    catalogMatches: catalogMatches.filter(Boolean),
    liveGroupsCount: liveGroups.length,
    liveRawCount,
    liveGroups,
    durationMs: Date.now() - start,
  });
}

export async function handleCreateProductRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await readJsonBody<Partial<MatchedProductGroup>>(req);

  if (!body.canonicalName || !Array.isArray(body.offers) || body.offers.length === 0) {
    sendJson(res, 400, {
      error: "invalid_payload",
      message: "'canonicalName' and non-empty 'offers' array are required.",
    });
    return;
  }

  const group: MatchedProductGroup = {
    canonicalName: body.canonicalName,
    unit: body.unit,
    baseUnit: body.baseUnit,
    baseUnitAmount: body.baseUnitAmount,
    ean: body.ean,
    imageUrl: body.imageUrl,
    matchConfidence: body.matchConfidence ?? "high_similarity",
    similarityScore: body.similarityScore ?? 1,
    cheapestShopId: body.cheapestShopId ?? body.offers[0].shopId,
    cheapestShopName: body.cheapestShopName ?? body.offers[0].shopName,
    cheapestPrice: body.cheapestPrice ?? body.offers[0].currentPrice,
    mostExpensivePrice: body.mostExpensivePrice ?? body.offers[0].currentPrice,
    maxSavings: body.maxSavings ?? 0,
    shopCount: body.offers.length,
    offers: body.offers,
  };

  const saved = await saveMatchedProductToCatalog(group);
  const fullProduct = await getCatalogProductWithPrices(saved.productId);

  sendJson(res, saved.createdNew ? 201 : 200, {
    saved,
    product: fullProduct?.product,
    prices: fullProduct?.prices ?? [],
  });
}

export async function handleGetProductByIdRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  productId: number
): Promise<void> {
  const data = await getCatalogProductWithPrices(productId);
  if (!data) {
    sendJson(res, 404, {
      error: "not_found",
      message: `Product with id=${productId} not found.`,
    });
    return;
  }

  sendJson(res, 200, data);
}
