#!/usr/bin/env node

import { closeDb, postgresClient } from "../db/client.js";
import { BRAVO_CATALOG_ITEMS } from "../search/shops/bravo-catalog.data.js";

const SHOP_ID = 6;

async function syncBravoCatalog() {
  console.log(`[SYNC-BRAVO] Starting sync of ${BRAVO_CATALOG_ITEMS.length} Bravo catalog items...`);
  let insertedProducts = 0;
  let updatedPrices = 0;

  for (const item of BRAVO_CATALOG_ITEMS) {
    const sku = item.id.replace(/^bravo-/, "");
    const url = `https://superbravo.com.do/articulos/${sku}`;
    const api = `https://bravova-api.superbravo.com.do/public/articulo/get?idArticulo=${sku}`;

    // 1. Check if product already exists by exact name or matching image/url
    const existing = await postgresClient`
      select p.id
      from products p
      left join products_shops_prices psp on psp."productId" = p.id and psp."shopId" = ${SHOP_ID}
      where p.name = ${item.name} or psp.url = ${url}
      limit 1
    `;

    let productId: number;

    if (existing.length > 0 && existing[0].id) {
      productId = existing[0].id;
      // Update image if needed
      await postgresClient`
        update products
        set image = coalesce(image, ${item.imageUrl}),
            unit = coalesce(unit, ${item.unit})
        where id = ${productId}
      `;
    } else {
      const inserted = await postgresClient`
        insert into products (name, image, unit, deleted)
        values (${item.name}, ${item.imageUrl}, ${item.unit}, false)
        returning id
      `;
      productId = inserted[0].id;
      insertedProducts += 1;
    }

    // 2. Upsert products_shops_prices for Bravo (shopId = 6)
    await postgresClient`
      insert into products_shops_prices (
        "productId",
        "shopId",
        url,
        api,
        "currentPrice",
        "regularPrice",
        "updateAt",
        hidden
      )
      values (
        ${productId},
        ${SHOP_ID},
        ${url},
        ${api},
        ${item.price},
        null,
        now(),
        false
      )
      on conflict ("productId", "shopId")
      do update set
        url = excluded.url,
        api = excluded.api,
        "currentPrice" = excluded."currentPrice",
        "updateAt" = now(),
        hidden = false
    `;
    updatedPrices += 1;

    // 3. Upsert product_images
    if (item.imageUrl) {
      await postgresClient`
        insert into product_images ("productId", "imageUrl", hidden, "primary")
        values (${productId}, ${item.imageUrl}, false, true)
        on conflict ("productId", "imageUrl")
        do update set hidden = false
      `;
    }
  }

  console.log(`[SYNC-BRAVO] Finished! Inserted ${insertedProducts} new products, synced ${updatedPrices} Bravo shop price entries.`);
}

syncBravoCatalog()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[SYNC-BRAVO] Failed with error:", err);
    await closeDb();
    process.exit(1);
  });
