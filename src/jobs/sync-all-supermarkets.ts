#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDb, postgresClient } from "../db/client.js";
import { BRAVO_CATALOG_ITEMS } from "../search/shops/bravo-catalog.data.js";

interface RawProductInput {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  categorySlug?: string;
  price: number;
  unit?: string;
  imageUrl?: string;
  isStoreExclusive?: boolean;
}

const STORE_SHOP_IDS: Record<string, number> = {
  sirena: 1,
  nacional: 2,
  jumbo: 3,
  plazaLama: 4,
  pricesmart: 5,
  bravo: 6,
  garrido: 8,
};

function normalizeTokens(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EXCLUSIVE_BRAND_REGEX = /\b(wala|esentis|zerca|lider|líder|bravo|member'?s\s+selection|members\s+selection)\b/i;

function isExclusiveBrand(name: string, brand?: string): boolean {
  return EXCLUSIVE_BRAND_REGEX.test(`${brand || ""} ${name}`);
}

function getGenericMatchingKey(name: string, brand?: string): string {
  const norm = normalizeTokens(`${name} ${brand || ""}`);
  const stripped = norm
    .replace(/\b(wala|esentis|zerca|lider|bravo|member|members|selection|sirena|nacional|jumbo|plaza\s+lama|garrido)\b/g, "")
    .replace(/\b(de|del|la|el|los|las|con|en|para|por|al|y|o|un|una|und|unidad|unidades|paquete|empaque|envase|botella|frasco|regular|original|clasico|clasica|sabor|tipo)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped;
}

export async function syncAllSupermarketCatalogs(): Promise<{
  totalSynced: number;
  byShop: Record<number, number>;
  newProductsCount: number;
}> {
  console.log("\n=======================================================");
  console.log("🚀 [SYNC-ALL] INICIANDO SINCRONIZACIÓN DIARIA DE CATÁLOGOS");
  console.log(`⏰ Fecha: ${new Date().toISOString()}`);
  console.log("=======================================================\n");

  const movilCatalogsPath = resolve(
    process.cwd(),
    "../movil-app-gasty/src/features/basket/data/storeCatalogs.data.ts"
  );
  const movilSirenaPath = resolve(
    process.cwd(),
    "../movil-app-gasty/src/features/basket/data/sirenaCatalog.data.ts"
  );

  let realStoreCatalogs: Record<string, RawProductInput[]> = {};
  let sirenaCurated: RawProductInput[] = [];

  try {
    const content = readFileSync(movilCatalogsPath, "utf8");
    const match = content.match(/export const REAL_STORE_CATALOGS:\s*Record<string,\s*CatalogProduct\[\]>\s*=\s*(\{[\s\S]*\});\s*$/);
    if (match) {
      realStoreCatalogs = JSON.parse(match[1]);
    }
  } catch (err) {
    console.warn("[SYNC-ALL] Warning: Could not read storeCatalogs.data.ts directly, using fallback.", err);
  }

  try {
    const sirenaContent = readFileSync(movilSirenaPath, "utf8");
    const match = sirenaContent.match(/export const CURATED_SIRENA_PRODUCTS:\s*CatalogProduct\[\]\s*=\s*(\[[\s\S]*\]);\s*$/);
    if (match) {
      sirenaCurated = JSON.parse(match[1]);
    }
  } catch (err) {
    console.warn("[SYNC-ALL] Warning: Could not read sirenaCatalog.data.ts directly.", err);
  }

  // Inject Bravo catalog items directly
  realStoreCatalogs.bravo = BRAVO_CATALOG_ITEMS;
  if (sirenaCurated.length > 0) {
    realStoreCatalogs.sirena = sirenaCurated;
  }

  // Pre-load all existing products into memory for 0ms lookups
  console.log("⚡ [SYNC-ALL] Pre-cargando mapa de productos existentes en memoria...");
  const existingProductRows = await postgresClient<{ id: number; name: string }[]>`
    select id, name from products where deleted = false or deleted is null
  `;
  const productNameToId = new Map<string, number>();
  for (const r of existingProductRows) {
    if (r.name) {
      productNameToId.set(r.name.trim().toLowerCase(), r.id);
    }
  }

  const existingExclusiveRows = await postgresClient<{ id: number; name: string; shopId: number }[]>`
    select p.id, p.name, psp."shopId"
    from products p
    inner join products_shops_prices psp on psp."productId" = p.id
  `;
  const exclusiveMap = new Map<string, number>();
  for (const r of existingExclusiveRows) {
    if (r.name && r.shopId) {
      exclusiveMap.set(`${r.shopId}:${r.name.trim().toLowerCase()}`, r.id);
    }
  }

  console.log(`⚡ [SYNC-ALL] Memoria lista: ${productNameToId.size} productos generales, ${exclusiveMap.size} enlaces comercio-producto.`);

  const byShop: Record<number, number> = {};
  let newProductsCount = 0;
  let totalSynced = 0;

  for (const [storeKey, shopId] of Object.entries(STORE_SHOP_IDS)) {
    const products = realStoreCatalogs[storeKey] || [];
    console.log(`\n📦 [Sincronizando ${storeKey.toUpperCase()} (shopId=${shopId})] — ${products.length} productos...`);
    let shopSuccessCount = 0;

    // 1. Asegurar existencia de productos en tabla `products`
    for (const item of products) {
      const price = Number(item.price);
      if (!price || price <= 0) continue;

      const cleanName = item.name.trim();
      const isExclusive = item.isStoreExclusive || isExclusiveBrand(cleanName, item.brand);
      const exKey = `${shopId}:${cleanName.toLowerCase()}`;
      const genKey = cleanName.toLowerCase();

      const existingId = isExclusive ? exclusiveMap.get(exKey) : productNameToId.get(genKey);

      if (!existingId) {
        try {
          const inserted = await postgresClient<{ id: number }[]>`
            insert into products (name, image, unit, deleted)
            values (${cleanName}, ${item.imageUrl || null}, ${item.unit || "1 un"}, false)
            returning id
          `;
          const newId = inserted[0].id;
          newProductsCount++;
          if (isExclusive) {
            exclusiveMap.set(exKey, newId);
          } else {
            productNameToId.set(genKey, newId);
          }
        } catch {
          // Si hubo conflicto concurrente, re-consultar
        }
      }
    }

    // 2. Upsert concurrente en lotes de 15 para máxima velocidad hacia Supabase
    const CHUNK_SIZE = 15;
    for (let i = 0; i < products.length; i += CHUNK_SIZE) {
      const chunk = products.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (item) => {
          const price = Number(item.price);
          if (!price || price <= 0) return;

          const cleanName = item.name.trim();
          const sku = item.id.replace(new RegExp(`^${storeKey}-`), "");
          const isExclusive = item.isStoreExclusive || isExclusiveBrand(cleanName, item.brand);
          const exKey = `${shopId}:${cleanName.toLowerCase()}`;
          const genKey = cleanName.toLowerCase();

          const productId = isExclusive ? exclusiveMap.get(exKey) : productNameToId.get(genKey);
          if (!productId) return;

          let url = "";
          let api = "";

          if (shopId === 1) {
            url = `https://www.sirena.do/articulos/${sku}`;
            api = `https://www.sirena.do/api/catalog_system/pub/products/search?fq=productId:${sku}`;
          } else if (shopId === 2) {
            url = `https://supermercadosnacional.com/articulos/${sku}`;
            api = `https://supermercadosnacional.com/rest/V1/products/${sku}`;
          } else if (shopId === 3) {
            url = `https://jumbo.com.do/articulos/${sku}`;
          } else if (shopId === 4) {
            url = `https://plazalama.com.do/articulos/${sku}`;
          } else if (shopId === 5) {
            url = `https://www.pricesmart.com/site/do/es/pagina-producto/${sku}`;
          } else if (shopId === 6) {
            url = `https://superbravo.com.do/articulos/${sku}`;
            api = `https://bravova-api.superbravo.com.do/public/articulo/get?idArticulo=${sku}`;
          } else if (shopId === 8) {
            url = `https://www.garrido.com.do/articulos/${sku}`;
          }

          // Upsert price
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
              ${shopId},
              ${url},
              ${api || null},
              ${price},
              null,
              now(),
              false
            )
            on conflict ("productId", "shopId")
            do update set
              url = excluded.url,
              api = coalesce(excluded.api, products_shops_prices.api),
              "currentPrice" = excluded."currentPrice",
              "updateAt" = now(),
              hidden = false
          `;

          // Upsert primary product image
          if (item.imageUrl) {
            await postgresClient`
              insert into product_images ("productId", "imageUrl", hidden, "primary")
              values (${productId}, ${item.imageUrl}, false, true)
              on conflict ("productId", "imageUrl")
              do update set hidden = false
            `;
          }

          if (isExclusive) {
            exclusiveMap.set(exKey, productId);
          }

          shopSuccessCount++;
          totalSynced++;
        })
      );
    }

    byShop[shopId] = shopSuccessCount;
    console.log(`✅ [${storeKey.toUpperCase()}] Sincronizados ${shopSuccessCount} precios en BD.`);
  }

  console.log("\n=======================================================");
  console.log("🎉 [SYNC-ALL] RESUMEN DE SINCRONIZACIÓN DIARIA:");
  console.log(`   • Total precios sincronizados: ${totalSynced}`);
  console.log(`   • Nuevos productos insertados: ${newProductsCount}`);
  for (const [storeKey, sId] of Object.entries(STORE_SHOP_IDS)) {
    console.log(`   • ${storeKey.toUpperCase()} (shopId=${sId}): ${byShop[sId] ?? 0} artículos`);
  }
  console.log("=======================================================\n");

  return { totalSynced, byShop, newProductsCount };
}

// If invoked directly from CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  syncAllSupermarketCatalogs()
    .then(async () => {
      await closeDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[SYNC-ALL] Falló la sincronización:", err);
      await closeDb();
      process.exit(1);
    });
}
