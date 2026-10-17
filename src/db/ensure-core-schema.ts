import { postgresClient } from "./client.js";
import { ensureSirenaCatalogSchema } from "./ensure-sirena-catalog-schema.js";
import { ensureNacionalCatalogSchema } from "./ensure-nacional-catalog-schema.js";
import { ensureRecoverySchema } from "./ensure-recovery-schema.js";

export async function ensureCoreSchema(): Promise<void> {
  // 1. Core Products Table
  await postgresClient`
    create table if not exists products (
      "id" serial primary key,
      "name" text,
      "ean" text,
      "image" text,
      "unit" text,
      "brandId" integer,
      "baseUnit" text,
      "baseUnitAmount" numeric,
      "deleted" boolean default false
    )
  `;

  await postgresClient`
    alter table products add column if not exists "ean" text
  `;

  await postgresClient`
    create index if not exists products_ean_idx on products ("ean")
  `;

  await postgresClient`
    create index if not exists products_name_idx on products ("name")
  `;

  // 2. Global IDs / Barcodes Map
  await postgresClient`
    create table if not exists products_global_ids (
      "id" serial primary key,
      "productId" integer not null,
      "sourceShopId" integer not null,
      "type" text not null,
      "value" text not null,
      "rawValue" text not null,
      "sourceRef" text,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    )
  `;

  await postgresClient`
    create index if not exists products_global_ids_productId_idx on products_global_ids ("productId")
  `;

  await postgresClient`
    create index if not exists products_global_ids_type_value_idx on products_global_ids ("type", "value")
  `;

  // 3. Products per Shop & Current Prices
  await postgresClient`
    create table if not exists products_shops_prices (
      "productId" integer not null,
      "shopId" integer not null,
      "url" text not null,
      "api" text,
      "locationId" integer,
      "currentPrice" numeric,
      "regularPrice" numeric,
      "updateAt" timestamptz not null default now(),
      "hidden" boolean default false,
      primary key ("productId", "shopId")
    )
  `;

  await postgresClient`
    create index if not exists products_shops_prices_shopId_productId_idx
    on products_shops_prices ("shopId", "productId")
  `;

  await postgresClient`
    create index if not exists products_shops_prices_updateAt_idx
    on products_shops_prices ("updateAt")
  `;

  // 4. Price History Table (Pruned every 21 days for <10 MB DB footprint)
  await postgresClient`
    create table if not exists products_prices_history (
      "id" serial primary key,
      "productId" integer not null,
      "shopId" integer not null,
      "price" numeric not null,
      "createdAt" timestamptz not null default now()
    )
  `;

  await postgresClient`
    create index if not exists products_prices_history_productId_shopId_idx
    on products_prices_history ("productId", "shopId", "createdAt" desc)
  `;

  await postgresClient`
    create index if not exists products_prices_history_createdAt_idx
    on products_prices_history ("createdAt")
  `;

  // 5. Product Images & Image Reports
  await postgresClient`
    create table if not exists product_images (
      "productId" integer not null,
      "imageUrl" text not null,
      "hidden" boolean not null default false,
      "primary" boolean not null default false,
      primary key ("productId", "imageUrl")
    )
  `;

  await postgresClient`
    create table if not exists product_broken_images (
      "id" serial primary key,
      "productId" integer not null,
      "imageUrl" text not null,
      "reportedAt" timestamptz not null default now(),
      "isFixed" boolean default false
    )
  `;

  await postgresClient`
    create table if not exists product_image_update_reports (
      "id" serial primary key,
      "productId" integer not null,
      "beforeImageUrl" text not null,
      "afterImageUrl" text not null,
      "createdAt" timestamptz not null default now()
    )
  `;

  // 6. Shopping Lists (Jhon & Sol)
  await postgresClient`
    create table if not exists shopping_lists (
      "id" serial primary key,
      "name" text not null,
      "status" text not null default 'planning',
      "selectedShopId" integer,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    )
  `;

  await postgresClient`
    create index if not exists shopping_lists_status_idx on shopping_lists ("status")
  `;

  // 7. Shopping List Items (Interactive in-store aisle checklist)
  await postgresClient`
    create table if not exists shopping_list_items (
      "id" serial primary key,
      "listId" integer not null,
      "productId" integer not null,
      "quantity" numeric not null default 1,
      "checked" boolean not null default false,
      "addedBy" text not null default 'Jhon',
      "notes" text,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    )
  `;

  await postgresClient`
    create index if not exists shopping_list_items_listId_idx on shopping_list_items ("listId")
  `;

  await postgresClient`
    create index if not exists shopping_list_items_productId_idx on shopping_list_items ("productId")
  `;

  // 8. Auxiliary Scraper State Tables
  await ensureSirenaCatalogSchema();
  await ensureNacionalCatalogSchema();
  await ensureRecoverySchema();
}

/**
 * Purgador automático de historial de precios anterior a N días (default: 21 días).
 * Mantiene el almacenamiento en Supabase siempre por debajo de 10 MB.
 */
export async function pruneOldHistory(days = 21): Promise<number> {
  const result = await postgresClient`
    delete from products_prices_history
    where "createdAt" < now() - (${days} || ' days')::interval
  `;

  return result.count ?? 0;
}
