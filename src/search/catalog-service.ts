import { postgresClient } from "../db/client.js";
import { extractNormalizedEans } from "./product-matcher.js";
import type { LiveSearchResultItem, MatchedProductGroup } from "./types.js";

export interface SavedCatalogProductResult {
  productId: number;
  canonicalName: string;
  ean?: string;
  unit?: string;
  imageUrl?: string;
  createdNew: boolean;
  linkedShopsCount: number;
}

export async function linkShopToProduct(
  productId: number,
  offer: LiveSearchResultItem
): Promise<void> {
  const apiRef = offer.sku ?? offer.ean ?? null;
  const regPrice = offer.regularPrice ?? offer.currentPrice;

  await postgresClient`
    insert into products_shops_prices (
      "productId",
      "shopId",
      "url",
      "api",
      "currentPrice",
      "regularPrice",
      "updateAt",
      "hidden"
    )
    values (
      ${productId},
      ${offer.shopId},
      ${offer.url},
      ${apiRef},
      ${offer.currentPrice},
      ${regPrice},
      now(),
      false
    )
    on conflict ("productId", "shopId") do update
    set
      "url" = excluded."url",
      "api" = coalesce(excluded."api", products_shops_prices."api"),
      "currentPrice" = excluded."currentPrice",
      "regularPrice" = excluded."regularPrice",
      "updateAt" = now(),
      "hidden" = false
  `;

  await postgresClient`
    insert into products_prices_history (
      "productId",
      "shopId",
      "price",
      "createdAt"
    )
    values (
      ${productId},
      ${offer.shopId},
      ${offer.currentPrice},
      now()
    )
  `;

  const eans = extractNormalizedEans(offer);
  for (const ean of eans) {
    const existing = await postgresClient<{ id: number }[]>`
      select "id" from products_global_ids
      where "productId" = ${productId}
        and "type" = 'EAN'
        and "value" = ${ean}
      limit 1
    `;
    if (existing.length === 0) {
      await postgresClient`
        insert into products_global_ids (
          "productId",
          "sourceShopId",
          "type",
          "value",
          "rawValue",
          "sourceRef",
          "createdAt",
          "updatedAt"
        )
        values (
          ${productId},
          ${offer.shopId},
          'EAN',
          ${ean},
          ${offer.ean ?? ean},
          ${offer.url},
          now(),
          now()
        )
      `;
    }
  }
}

export async function saveMatchedProductToCatalog(
  group: MatchedProductGroup
): Promise<SavedCatalogProductResult> {
  let existingProductId: number | null = null;

  // 1. Check by EAN first
  if (group.ean) {
    const byEan = await postgresClient<{ id: number }[]>`
      select "id" from products
      where "ean" = ${group.ean}
        and coalesce("deleted", false) = false
      limit 1
    `;
    if (byEan[0]) {
      existingProductId = byEan[0].id;
    }
  }

  // 2. Check by any existing shop URL in products_shops_prices
  if (!existingProductId && group.offers.length > 0) {
    const urls = group.offers.map((o) => o.url).filter(Boolean);
    if (urls.length > 0) {
      const byUrl = await postgresClient<{ productId: number }[]>`
        select "productId" from products_shops_prices
        where "url" in ${postgresClient(urls)}
        limit 1
      `;
      if (byUrl[0]) {
        existingProductId = byUrl[0].productId;
      }
    }
  }

  // 3. Check by canonical name
  if (!existingProductId) {
    const byName = await postgresClient<{ id: number }[]>`
      select "id" from products
      where lower("name") = lower(${group.canonicalName})
        and coalesce("deleted", false) = false
      limit 1
    `;
    if (byName[0]) {
      existingProductId = byName[0].id;
    }
  }

  let productId: number;
  let createdNew = false;

  if (existingProductId) {
    productId = existingProductId;
    await postgresClient`
      update products
      set
        "name" = coalesce(${group.canonicalName}, "name"),
        "ean" = coalesce(${group.ean ?? null}, "ean"),
        "image" = coalesce(${group.imageUrl ?? null}, "image"),
        "unit" = coalesce(${group.unit ?? null}, "unit"),
        "baseUnit" = coalesce(${group.baseUnit ?? null}, "baseUnit"),
        "baseUnitAmount" = coalesce(${group.baseUnitAmount ?? null}, "baseUnitAmount")
      where "id" = ${productId}
    `;
  } else {
    createdNew = true;
    const inserted = await postgresClient<{ id: number }[]>`
      insert into products (
        "name",
        "ean",
        "image",
        "unit",
        "baseUnit",
        "baseUnitAmount",
        "deleted"
      )
      values (
        ${group.canonicalName},
        ${group.ean ?? null},
        ${group.imageUrl ?? null},
        ${group.unit ?? null},
        ${group.baseUnit ?? null},
        ${group.baseUnitAmount ?? null},
        false
      )
      returning "id"
    `;
    productId = inserted[0].id;
  }

  if (group.imageUrl) {
    await postgresClient`
      insert into product_images ("productId", "imageUrl", "hidden", "primary")
      values (${productId}, ${group.imageUrl}, false, true)
      on conflict ("productId", "imageUrl") do update
      set "primary" = true, "hidden" = false
    `;
  }

  for (const offer of group.offers) {
    await linkShopToProduct(productId, offer);
  }

  return {
    productId,
    canonicalName: group.canonicalName,
    ean: group.ean,
    unit: group.unit,
    imageUrl: group.imageUrl,
    createdNew,
    linkedShopsCount: group.offers.length,
  };
}

export async function getCatalogProductWithPrices(productId: number) {
  const productRows = await postgresClient`
    select "id", "name", "ean", "image", "unit", "baseUnit", "baseUnitAmount"
    from products
    where "id" = ${productId}
    limit 1
  `;

  if (!productRows[0]) {
    return null;
  }

  const priceRows = await postgresClient`
    select
      "productId",
      "shopId",
      "url",
      "api",
      "currentPrice",
      "regularPrice",
      "updateAt"
    from products_shops_prices
    where "productId" = ${productId}
      and coalesce("hidden", false) = false
    order by "currentPrice" asc
  `;

  return {
    product: productRows[0],
    prices: priceRows,
  };
}
