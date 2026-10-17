import type { IncomingMessage, ServerResponse } from "node:http";
import {
  addItemToShoppingList,
  compareShoppingList,
  createShoppingList,
  TARGET_COUPLE_SHOPS,
} from "../../cart/compare-cart.js";
import { postgresClient } from "../../db/client.js";
import { saveMatchedProductToCatalog } from "../../search/catalog-service.js";
import { searchAllSupermarkets } from "../../search/live-search.js";
import { groupEquivalentProducts } from "../../search/product-matcher.js";
import type { MatchedProductGroup } from "../../search/types.js";
import { readJsonBody, sendJson } from "../http-utils.js";

function getShopNameById(shopId: number | null | undefined): string | null {
  if (!shopId) return null;
  return TARGET_COUPLE_SHOPS.find((s) => s.shopId === shopId)?.shopName ?? `Tienda #${shopId}`;
}

export async function getShoppingListDetail(listId: number) {
  const listRows = await postgresClient<
    {
      id: number;
      name: string;
      status: string;
      selectedShopId: number | null;
      createdAt: Date;
      updatedAt: Date;
    }[]
  >`
    select "id", "name", "status", "selectedShopId", "createdAt", "updatedAt"
    from shopping_lists
    where "id" = ${listId}
    limit 1
  `;

  if (!listRows[0]) {
    return null;
  }

  const list = listRows[0];

  const rawItems = await postgresClient<
    {
      id: number;
      listId: number;
      productId: number;
      quantity: string | number;
      checked: boolean;
      addedBy: string;
      notes: string | null;
      updatedAt: Date;
      productName: string | null;
      unit: string | null;
      image: string | null;
      ean: string | null;
    }[]
  >`
    select
      i."id",
      i."listId",
      i."productId",
      i."quantity",
      i."checked",
      i."addedBy",
      i."notes",
      i."updatedAt",
      p."name" as "productName",
      p."unit",
      p."image",
      p."ean"
    from shopping_list_items i
    inner join products p on p."id" = i."productId"
    where i."listId" = ${listId}
    order by i."checked" asc, i."id" asc
  `;

  const productIds = rawItems.map((i) => i.productId);
  const priceRows =
    productIds.length > 0
      ? await postgresClient<
          {
            productId: number;
            shopId: number;
            currentPrice: string | number | null;
            regularPrice: string | number | null;
            url: string;
          }[]
        >`
          select "productId", "shopId", "currentPrice", "regularPrice", "url"
          from products_shops_prices
          where "productId" in ${postgresClient(productIds)}
            and coalesce("hidden", false) = false
        `
      : [];

  // Map productId -> array of shop offers
  const offersByProduct = new Map<
    number,
    Array<{ shopId: number; currentPrice: number; regularPrice: number; url: string }>
  >();

  for (const row of priceRows) {
    const current = Number(row.currentPrice);
    if (!current || current <= 0) continue;
    const regular =
      row.regularPrice && Number(row.regularPrice) > current
        ? Number(row.regularPrice)
        : current;

    if (!offersByProduct.has(row.productId)) {
      offersByProduct.set(row.productId, []);
    }
    offersByProduct.get(row.productId)!.push({
      shopId: row.shopId,
      currentPrice: current,
      regularPrice: regular,
      url: row.url,
    });
  }

  let inCartTotal = 0;
  let pendingTotal = 0;
  let checkedCount = 0;

  const enrichedItems = rawItems.map((item) => {
    const qty = Number(item.quantity);
    const productOffers = offersByProduct.get(item.productId) ?? [];
    productOffers.sort((a, b) => a.currentPrice - b.currentPrice);

    // If list has a selectedShopId (Modo En el Súper), use that supermarket's price;
    // otherwise fallback to the cheapest known price.
    const activeOffer = list.selectedShopId
      ? productOffers.find((o) => o.shopId === list.selectedShopId) ?? productOffers[0]
      : productOffers[0];

    const unitPrice = activeOffer?.currentPrice ?? 0;
    const regularUnitPrice = activeOffer?.regularPrice ?? unitPrice;
    const subtotal = Number((unitPrice * qty).toFixed(2));
    const availableInSelectedShop = list.selectedShopId
      ? productOffers.some((o) => o.shopId === list.selectedShopId)
      : true;

    if (item.checked) {
      checkedCount++;
      inCartTotal += subtotal;
    } else {
      pendingTotal += subtotal;
    }

    return {
      id: item.id,
      listId: item.listId,
      productId: item.productId,
      productName: item.productName ?? `Producto #${item.productId}`,
      unit: item.unit,
      imageUrl: item.image,
      ean: item.ean,
      quantity: qty,
      checked: item.checked,
      addedBy: item.addedBy,
      notes: item.notes,
      unitPrice,
      regularUnitPrice,
      subtotal,
      availableInSelectedShop,
      activeShopId: activeOffer?.shopId ?? null,
      activeShopName: getShopNameById(activeOffer?.shopId),
      updatedAt: item.updatedAt,
    };
  });

  const totalItems = enrichedItems.length;
  const pendingCount = totalItems - checkedCount;
  const estimatedRegisterTotal = Number((inCartTotal + pendingTotal).toFixed(2));

  return {
    id: list.id,
    name: list.name,
    status: list.status,
    selectedShopId: list.selectedShopId,
    selectedShopName: getShopNameById(list.selectedShopId),
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    aisleSummary: {
      totalItems,
      checkedItems: checkedCount,
      pendingItems: pendingCount,
      progressPercent:
        totalItems > 0 ? Number(((checkedCount / totalItems) * 100).toFixed(1)) : 0,
      inCartTotal: Number(inCartTotal.toFixed(2)),
      pendingTotal: Number(pendingTotal.toFixed(2)),
      estimatedRegisterTotal,
    },
    items: enrichedItems,
  };
}

export async function handleGetListsRoute(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const rows = await postgresClient<
    {
      id: number;
      name: string;
      status: string;
      selectedShopId: number | null;
      createdAt: Date;
      updatedAt: Date;
      itemCount: string | number;
      checkedCount: string | number;
    }[]
  >`
    select
      l."id",
      l."name",
      l."status",
      l."selectedShopId",
      l."createdAt",
      l."updatedAt",
      count(i."id") as "itemCount",
      count(i."id") filter (where i."checked" = true) as "checkedCount"
    from shopping_lists l
    left join shopping_list_items i on i."listId" = l."id"
    group by l."id"
    order by l."updatedAt" desc, l."id" desc
  `;

  const lists = rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    selectedShopId: r.selectedShopId,
    selectedShopName: getShopNameById(r.selectedShopId),
    itemCount: Number(r.itemCount),
    checkedCount: Number(r.checkedCount),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  sendJson(res, 200, { lists });
}

export async function handleCreateListRoute(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await readJsonBody<{ name?: string }>(req);
  const name = (body.name ?? "").trim();

  if (!name) {
    sendJson(res, 400, {
      error: "missing_name",
      message: "Field 'name' is required to create a shopping list.",
    });
    return;
  }

  const created = await createShoppingList(name);
  const detail = await getShoppingListDetail(created.id);
  sendJson(res, 201, detail);
}

export async function handleGetListByIdRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  listId: number
): Promise<void> {
  const detail = await getShoppingListDetail(listId);
  if (!detail) {
    sendJson(res, 404, {
      error: "not_found",
      message: `Shopping list with id=${listId} not found.`,
    });
    return;
  }

  sendJson(res, 200, detail);
}

export async function handleAddListItemRoute(
  req: IncomingMessage,
  res: ServerResponse,
  listId: number
): Promise<void> {
  const body = await readJsonBody<{
    productId?: number;
    productGroup?: MatchedProductGroup;
    rawQuery?: string;
    query?: string;
    quantity?: number;
    addedBy?: "Jhon" | "Sol" | string;
    notes?: string;
  }>(req);

  let productId = Number(body.productId);

  // Support saving a MatchedProductGroup directly from search results in one step
  if ((!productId || Number.isNaN(productId)) && body.productGroup) {
    const saved = await saveMatchedProductToCatalog(body.productGroup);
    productId = saved.productId;
  }

  // Support adding by rawQuery / query (e.g. from Postman or Quick Add)
  const searchQuery = (body.rawQuery ?? body.query ?? "").trim();
  if ((!productId || Number.isNaN(productId)) && searchQuery) {
    const liveResult = await searchAllSupermarkets(searchQuery, { limit: 6 });
    const groups = groupEquivalentProducts(liveResult.items);
    const bestGroup =
      groups.find((g) => g.shopCount >= 2) ?? groups[0];
    if (bestGroup) {
      const saved = await saveMatchedProductToCatalog(bestGroup);
      productId = saved.productId;
    }
  }

  if (!productId || Number.isNaN(productId)) {
    sendJson(res, 400, {
      error: "invalid_product",
      message: "Provide 'productId', 'productGroup', or 'rawQuery' to add an item.",
    });
    return;
  }

  const addedBy = body.addedBy === "Sol" ? "Sol" : "Jhon";

  await addItemToShoppingList({
    listId,
    productId,
    quantity: body.quantity ?? 1,
    addedBy,
    notes: body.notes,
  });

  await postgresClient`
    update shopping_lists set "updatedAt" = now() where "id" = ${listId}
  `;

  const detail = await getShoppingListDetail(listId);
  sendJson(res, 201, detail);
}

export async function handlePatchListItemRoute(
  req: IncomingMessage,
  res: ServerResponse,
  listId: number,
  itemId: number
): Promise<void> {
  const body = await readJsonBody<{
    checked?: boolean;
    quantity?: number;
    addedBy?: "Jhon" | "Sol" | string;
    notes?: string;
  }>(req);

  const existing = await postgresClient<
    { id: number; checked: boolean; quantity: string | number; addedBy: string; notes: string | null }[]
  >`
    select "id", "checked", "quantity", "addedBy", "notes"
    from shopping_list_items
    where "id" = ${itemId} and "listId" = ${listId}
    limit 1
  `;

  if (!existing[0]) {
    sendJson(res, 404, {
      error: "item_not_found",
      message: `Item id=${itemId} not found in list id=${listId}.`,
    });
    return;
  }

  const current = existing[0];
  const nextChecked = typeof body.checked === "boolean" ? body.checked : current.checked;
  const nextQuantity =
    body.quantity !== undefined ? Math.max(0.1, Number(body.quantity)) : Number(current.quantity);
  const nextAddedBy = body.addedBy ?? current.addedBy;
  const nextNotes = body.notes !== undefined ? body.notes : current.notes;

  await postgresClient`
    update shopping_list_items
    set
      "checked" = ${nextChecked},
      "quantity" = ${nextQuantity},
      "addedBy" = ${nextAddedBy},
      "notes" = ${nextNotes},
      "updatedAt" = now()
    where "id" = ${itemId} and "listId" = ${listId}
  `;

  await postgresClient`
    update shopping_lists set "updatedAt" = now() where "id" = ${listId}
  `;

  const detail = await getShoppingListDetail(listId);
  sendJson(res, 200, detail);
}

export async function handleDeleteListItemRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  listId: number,
  itemId: number
): Promise<void> {
  await postgresClient`
    delete from shopping_list_items
    where "id" = ${itemId} and "listId" = ${listId}
  `;

  await postgresClient`
    update shopping_lists set "updatedAt" = now() where "id" = ${listId}
  `;

  const detail = await getShoppingListDetail(listId);
  sendJson(res, 200, detail);
}

export async function handleCompareListRoute(
  req: IncomingMessage,
  res: ServerResponse,
  listId: number
): Promise<void> {
  const body =
    req.method === "POST"
      ? await readJsonBody<{ refreshStale?: boolean }>(req).catch(() => ({}))
      : {};

  const refreshStale =
    "refreshStale" in body && typeof body.refreshStale === "boolean"
      ? body.refreshStale
      : true;

  const result = await compareShoppingList(listId, { refreshStale });
  sendJson(res, 200, result);
}

export async function handleStartShoppingModeRoute(
  req: IncomingMessage,
  res: ServerResponse,
  listId: number
): Promise<void> {
  const body = await readJsonBody<{ shopId?: number }>(req).catch(() => ({
    shopId: undefined,
  }));

  let chosenShopId = body.shopId ? Number(body.shopId) : null;

  // If no shopId was explicitly passed, auto-pick the #1 winning supermarket
  if (!chosenShopId) {
    const comparison = await compareShoppingList(listId, { refreshStale: false });
    chosenShopId = comparison.winnerShop?.shopId ?? 1;
  }

  await postgresClient`
    update shopping_lists
    set
      "status" = 'shopping',
      "selectedShopId" = ${chosenShopId},
      "updatedAt" = now()
    where "id" = ${listId}
  `;

  const detail = await getShoppingListDetail(listId);
  sendJson(res, 200, detail);
}
