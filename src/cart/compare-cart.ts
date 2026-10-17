import { postgresClient } from "../db/client.js";
import { scrapePrice } from "../scrape-price.js";
import type { ShopId } from "../types.js";
import { isLessThan12HoursAgo, mapWithConcurrency } from "../utils.js";
import type {
  CartComparisonResult,
  CompareCartOptions,
  MissingCartItem,
  ShopCartItemDetail,
  ShopCartSummary,
  ShoppingListAuthor,
} from "./types.js";

export const TARGET_COUPLE_SHOPS: Array<{ shopId: ShopId; shopName: string }> = [
  { shopId: 1, shopName: "La Sirena" },
  { shopId: 2, shopName: "Supermercados Nacional" },
  { shopId: 3, shopName: "Jumbo" },
  { shopId: 4, shopName: "Plaza Lama" },
  { shopId: 6, shopName: "Supermercados Bravo" },
];

export async function createShoppingList(name: string): Promise<{ id: number; name: string }> {
  const rows = await postgresClient<{ id: number; name: string }[]>`
    insert into shopping_lists ("name", "status", "createdAt", "updatedAt")
    values (${name}, 'planning', now(), now())
    returning "id", "name"
  `;
  return rows[0];
}

export async function addItemToShoppingList(params: {
  listId: number;
  productId: number;
  quantity?: number;
  addedBy?: ShoppingListAuthor | string;
  notes?: string;
}): Promise<{ id: number }> {
  const qty = Math.max(0.1, Number(params.quantity ?? 1));
  const addedBy = params.addedBy ?? "Jhon";
  const notes = params.notes ?? null;

  // Check if product already exists in this list
  const existing = await postgresClient<{ id: number }[]>`
    select "id" from shopping_list_items
    where "listId" = ${params.listId}
      and "productId" = ${params.productId}
    limit 1
  `;

  if (existing[0]) {
    await postgresClient`
      update shopping_list_items
      set
        "quantity" = ${qty},
        "addedBy" = ${addedBy},
        "notes" = coalesce(${notes}, "notes"),
        "updatedAt" = now()
      where "id" = ${existing[0].id}
    `;
    return existing[0];
  }

  const inserted = await postgresClient<{ id: number }[]>`
    insert into shopping_list_items (
      "listId",
      "productId",
      "quantity",
      "checked",
      "addedBy",
      "notes",
      "createdAt",
      "updatedAt"
    )
    values (
      ${params.listId},
      ${params.productId},
      ${qty},
      false,
      ${addedBy},
      ${notes},
      now(),
      now()
    )
    returning "id"
  `;

  return inserted[0];
}

interface RawListItemRow {
  itemId: number;
  productId: number;
  quantity: string | number;
  checked: boolean;
  addedBy: string;
  notes: string | null;
  productName: string | null;
  unit: string | null;
  image: string | null;
}

interface RawPriceRow {
  productId: number;
  shopId: number;
  url: string;
  api: string | null;
  currentPrice: string | number | null;
  regularPrice: string | number | null;
  updateAt: Date | string | null;
  hidden: boolean | null;
}

async function refreshStalePricesIfNeeded(priceRows: RawPriceRow[]): Promise<number> {
  const staleRows = priceRows.filter((row) => {
    if (!row.updateAt) return true;
    const updatedDate = row.updateAt instanceof Date ? row.updateAt : new Date(row.updateAt);
    return !isLessThan12HoursAgo(updatedDate);
  });

  if (staleRows.length === 0) {
    return 0;
  }

  let refreshedCount = 0;

  await mapWithConcurrency(staleRows, 4, async (row) => {
    try {
      const res = await scrapePrice(
        {
          shopId: row.shopId as ShopId,
          url: row.url,
          api: row.api,
        },
        { maxRetries: 1, timeoutMs: 5000 }
      );

      if (res.status === "ok") {
        const newCurrent = Number(res.currentPrice);
        const newRegular = res.regularPrice ? Number(res.regularPrice) : newCurrent;

        if (newCurrent > 0) {
          await postgresClient`
            update products_shops_prices
            set
              "currentPrice" = ${newCurrent},
              "regularPrice" = ${newRegular},
              "updateAt" = now(),
              "hidden" = false
            where "productId" = ${row.productId}
              and "shopId" = ${row.shopId}
          `;

          await postgresClient`
            insert into products_prices_history ("productId", "shopId", "price", "createdAt")
            values (${row.productId}, ${row.shopId}, ${newCurrent}, now())
          `;

          row.currentPrice = newCurrent;
          row.regularPrice = newRegular;
          row.updateAt = new Date();
          refreshedCount++;
        }
      }
    } catch {
      // Ignore individual refresh errors so comparison proceeds smoothly
    }
  });

  return refreshedCount;
}

export async function compareShoppingList(
  listId: number,
  options: CompareCartOptions = {}
): Promise<CartComparisonResult> {
  const refreshStale = options.refreshStale ?? true;

  const listRows = await postgresClient<
    { id: number; name: string; status: string; selectedShopId: number | null }[]
  >`
    select "id", "name", "status", "selectedShopId"
    from shopping_lists
    where "id" = ${listId}
    limit 1
  `;

  if (!listRows[0]) {
    throw new Error(`Lista de compras con id=${listId} no existe.`);
  }

  const listInfo = listRows[0];

  const items = await postgresClient<RawListItemRow[]>`
    select
      i."id" as "itemId",
      i."productId",
      i."quantity",
      i."checked",
      i."addedBy",
      i."notes",
      p."name" as "productName",
      p."unit",
      p."image"
    from shopping_list_items i
    inner join products p on p."id" = i."productId"
    where i."listId" = ${listId}
    order by i."id" asc
  `;

  if (items.length === 0) {
    return {
      listId: listInfo.id,
      listName: listInfo.name,
      status: listInfo.status,
      selectedShopId: listInfo.selectedShopId,
      totalDistinctProducts: 0,
      totalUnits: 0,
      refreshedStalePricesCount: 0,
      winnerShop: null,
      maxPotentialSavings: 0,
      ranking: [],
    };
  }

  const productIds = items.map((item) => item.productId);
  const targetShopIds = TARGET_COUPLE_SHOPS.map((s) => s.shopId);

  const priceRows = await postgresClient<RawPriceRow[]>`
    select
      "productId",
      "shopId",
      "url",
      "api",
      "currentPrice",
      "regularPrice",
      "updateAt",
      "hidden"
    from products_shops_prices
    where "productId" in ${postgresClient(productIds)}
      and "shopId" in ${postgresClient(targetShopIds)}
      and coalesce("hidden", false) = false
  `;

  const refreshedStalePricesCount = refreshStale
    ? await refreshStalePricesIfNeeded(priceRows)
    : 0;

  // Map: productId -> (shopId -> RawPriceRow)
  const priceMap = new Map<number, Map<number, RawPriceRow>>();
  for (const row of priceRows) {
    const price = Number(row.currentPrice);
    if (!price || price <= 0) continue;

    if (!priceMap.has(row.productId)) {
      priceMap.set(row.productId, new Map());
    }
    priceMap.get(row.productId)!.set(row.shopId, row);
  }

  // Compute average market price per product for fair imputation when a store is missing an item
  const marketAvgByProduct = new Map<number, number>();
  for (const item of items) {
    const shopPrices = priceMap.get(item.productId);
    if (!shopPrices || shopPrices.size === 0) {
      marketAvgByProduct.set(item.productId, 0);
      continue;
    }
    const values = Array.from(shopPrices.values()).map((r) => Number(r.currentPrice));
    const avg = values.reduce((acc, v) => acc + v, 0) / values.length;
    marketAvgByProduct.set(item.productId, Number(avg.toFixed(2)));
  }

  const totalItemsCount = items.length;
  const totalUnits = items.reduce((acc, item) => acc + Number(item.quantity), 0);

  const rawSummaries: ShopCartSummary[] = [];

  for (const shop of TARGET_COUPLE_SHOPS) {
    const availableItems: ShopCartItemDetail[] = [];
    const missingItems: MissingCartItem[] = [];

    let totalPrice = 0;
    let totalSavings = 0;
    let missingEstimatedTotal = 0;

    for (const item of items) {
      const qty = Number(item.quantity);
      const productName = item.productName ?? `Producto #${item.productId}`;
      const shopOffer = priceMap.get(item.productId)?.get(shop.shopId);

      if (shopOffer && Number(shopOffer.currentPrice) > 0) {
        const unitPrice = Number(shopOffer.currentPrice);
        const regularUnitPrice =
          shopOffer.regularPrice && Number(shopOffer.regularPrice) > unitPrice
            ? Number(shopOffer.regularPrice)
            : unitPrice;

        const subtotal = Number((unitPrice * qty).toFixed(2));
        const savings = Number(((regularUnitPrice - unitPrice) * qty).toFixed(2));

        totalPrice += subtotal;
        totalSavings += savings;

        availableItems.push({
          itemId: item.itemId,
          productId: item.productId,
          productName,
          unit: item.unit ?? undefined,
          imageUrl: item.image ?? undefined,
          quantity: qty,
          checked: item.checked,
          addedBy: item.addedBy,
          notes: item.notes ?? undefined,
          unitPrice,
          regularUnitPrice,
          subtotal,
          savings,
          url: shopOffer.url,
        });
      } else {
        const estimatedUnitPrice = marketAvgByProduct.get(item.productId) ?? 0;
        const estimatedSubtotal = Number((estimatedUnitPrice * qty).toFixed(2));
        missingEstimatedTotal += estimatedSubtotal;

        missingItems.push({
          itemId: item.itemId,
          productId: item.productId,
          productName,
          unit: item.unit ?? undefined,
          imageUrl: item.image ?? undefined,
          quantity: qty,
          addedBy: item.addedBy,
          estimatedUnitPrice,
          estimatedSubtotal,
        });
      }
    }

    const availableCount = availableItems.length;
    const missingCount = missingItems.length;
    const coveragePercent = Number(
      ((availableCount / Math.max(1, totalItemsCount)) * 100).toFixed(1)
    );
    const isCompleteCart = availableCount === totalItemsCount;
    const roundedTotal = Number(totalPrice.toFixed(2));
    const estimatedFullCartPrice = Number((totalPrice + missingEstimatedTotal).toFixed(2));
    const roundedSavings = Number(totalSavings.toFixed(2));

    rawSummaries.push({
      rank: 0,
      shopId: shop.shopId,
      shopName: shop.shopName,
      availableCount,
      missingCount,
      totalItemsCount,
      coveragePercent,
      isCompleteCart,
      totalPrice: roundedTotal,
      estimatedFullCartPrice,
      totalSavings: roundedSavings,
      differenceFromWinner: 0,
      availableItems,
      missingItems,
    });
  }

  // Filter stores that have at least 1 item (or keep all if none have items)
  const activeStores = rawSummaries.filter((s) => s.availableCount > 0);
  const candidates = activeStores.length > 0 ? activeStores : rawSummaries;

  // Sort by highest availability first, then lowest estimatedFullCartPrice
  candidates.sort((a, b) => {
    if (b.availableCount !== a.availableCount) {
      return b.availableCount - a.availableCount;
    }
    return a.estimatedFullCartPrice - b.estimatedFullCartPrice;
  });

  const winner = candidates[0] ?? null;

  candidates.forEach((summary, idx) => {
    summary.rank = idx + 1;
    if (winner) {
      summary.differenceFromWinner = Number(
        Math.max(0, summary.estimatedFullCartPrice - winner.estimatedFullCartPrice).toFixed(2)
      );
    }
  });

  const mostExpensiveComparable =
    candidates.length > 1 ? candidates[candidates.length - 1] : winner;
  const maxPotentialSavings =
    winner && mostExpensiveComparable
      ? Number(
          Math.max(
            0,
            mostExpensiveComparable.estimatedFullCartPrice - winner.estimatedFullCartPrice
          ).toFixed(2)
        )
      : 0;

  return {
    listId: listInfo.id,
    listName: listInfo.name,
    status: listInfo.status,
    selectedShopId: listInfo.selectedShopId,
    totalDistinctProducts: totalItemsCount,
    totalUnits,
    refreshedStalePricesCount,
    winnerShop: winner,
    maxPotentialSavings,
    ranking: candidates,
  };
}
