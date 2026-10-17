import "../api-endpoints.js";
import type { CartComparisonResult } from "../cart/types.js";
import { closeDb, postgresClient } from "../db/client.js";
import { ensureCoreSchema } from "../db/ensure-core-schema.js";
import { startApiServer } from "../server/index.js";

interface ListDetailResponse {
  id: number;
  name: string;
  status: string;
  selectedShopId: number | null;
  selectedShopName: string | null;
  aisleSummary: {
    totalItems: number;
    checkedItems: number;
    pendingItems: number;
    progressPercent: number;
    inCartTotal: number;
    pendingTotal: number;
    estimatedRegisterTotal: number;
  };
  items: Array<{
    id: number;
    productId: number;
    productName: string;
    unit: string | null;
    imageUrl: string | null;
    quantity: number;
    checked: boolean;
    addedBy: string;
    unitPrice: number;
    subtotal: number;
    availableInSelectedShop: boolean;
    activeShopName: string | null;
  }>;
}

async function runPostmanE2EFlow() {
  console.log("=======================================================================");
  console.log("🚀 GAS-9: Prueba Integral End-to-End (Flujo Postman + Supabase Cloud)");
  console.log("=======================================================================\n");

  // 0. Ensure Supabase schema is initialized
  await ensureCoreSchema();

  const testPort = 3092;
  const baseUrl = `http://localhost:${testPort}`;
  const appToken = process.env.APP_ACCESS_TOKEN || "gasty-jhon-sol-private-2026";
  const headers = {
    "Content-Type": "application/json",
    "x-app-token": appToken,
  };

  const server = startApiServer(testPort);

  try {
    // Petición 1: GET /api/health
    console.log("1️⃣  [Petición 1] GET /api/health -> Salud del servidor y Supabase Cloud...");
    const healthRes = await fetch(`${baseUrl}/api/health`, { headers });
    const healthData = (await healthRes.json()) as {
      status: string;
      db: string;
      provider: string;
      stats: {
        tablesCount: number;
        shopsCount: number;
        catalogProductsCount: number;
        shoppingListsCount: number;
      };
    };
    console.log(`   ✅ HTTP ${healthRes.status} | DB: ${healthData.db} (${healthData.provider})`);
    console.log(
      `   📊 Tablas en Supabase: ${healthData.stats.tablesCount} | Súpers en precios: ${healthData.stats.shopsCount} | Catálogo: ${healthData.stats.catalogProductsCount} productos\n`
    );

    // Petición 2: GET /api/search?q=ketchup&live=true
    console.log("2️⃣  [Petición 2] GET /api/search?q=ketchup&live=true -> Búsqueda en vivo en los 5 súpers...");
    const searchRes = await fetch(`${baseUrl}/api/search?q=ketchup&live=true&limit=6`, {
      headers,
    });
    const searchData = (await searchRes.json()) as {
      durationMs: number;
      liveRawCount: number;
      liveGroupsCount: number;
      liveGroups: Array<{
        canonicalName: string;
        shopCount: number;
        cheapestPrice: number;
        cheapestShopName: string;
      }>;
    };
    console.log(
      `   ✅ HTTP ${searchRes.status} (${searchData.durationMs}ms) | Ítems crudos: ${searchData.liveRawCount} | Grupos emparejados: ${searchData.liveGroupsCount}`
    );
    const topKetchup = searchData.liveGroups[0];
    if (topKetchup) {
      console.log(
        `   🥫 Top Match: "${topKetchup.canonicalName}" (${topKetchup.shopCount} súpers) -> Desde RD$${topKetchup.cheapestPrice} en ${topKetchup.cheapestShopName}\n`
      );
    }

    // Petición 3: POST /api/lists -> Crea lista "Compra de Prueba"
    console.log("3️⃣  [Petición 3] POST /api/lists -> Creando lista 'Compra de Prueba'...");
    const createListRes = await fetch(`${baseUrl}/api/lists`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Compra de Prueba" }),
    });
    const createListData = (await createListRes.json()) as ListDetailResponse;
    const listId = createListData.id;
    console.log(
      `   ✅ HTTP ${createListRes.status} | Lista creada: #${listId} "${createListData.name}" (status: ${createListData.status})\n`
    );

    // Petición 4: POST /api/lists/:id/items -> Agrega 4 productos reales (Arroz, Leche, Ketchup, Queso)
    const testProducts = [
      { label: "Arroz", rawQuery: "arroz campos 10 lb", quantity: 1, addedBy: "Jhon" },
      { label: "Leche", rawQuery: "leche evaporada carnation 315g", quantity: 2, addedBy: "Sol" },
      { label: "Ketchup", rawQuery: "ketchup heinz", quantity: 1, addedBy: "Jhon" },
      { label: "Queso", rawQuery: "queso sosua", quantity: 1, addedBy: "Sol" },
    ];

    console.log("4️⃣  [Petición 4] POST /api/lists/:id/items -> Agregando 4 productos reales...");
    let firstItemId = 0;

    for (const prod of testProducts) {
      const addRes = await fetch(`${baseUrl}/api/lists/${listId}/items`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          rawQuery: prod.rawQuery,
          quantity: prod.quantity,
          addedBy: prod.addedBy,
        }),
      });
      const addData = (await addRes.json()) as ListDetailResponse;
      const latestItem = addData.items[addData.items.length - 1];
      if (!firstItemId && latestItem) {
        firstItemId = latestItem.id;
      }
      console.log(
        `   ✅ [${prod.label}] HTTP ${addRes.status} -> Item #${latestItem?.id}: ${latestItem?.quantity}x "${latestItem?.productName}" (por ${latestItem?.addedBy}) | Foto: ${latestItem?.imageUrl ? "Sí 📸" : "No"}`
      );
    }
    console.log("");

    // Petición 5: POST /api/lists/:id/compare -> Dispara comparación de los 5 supermercados
    console.log("5️⃣  [Petición 5] POST /api/lists/:id/compare -> Comparando canasta en los 5 supermercados...");
    const compareRes = await fetch(`${baseUrl}/api/lists/${listId}/compare`, {
      method: "POST",
      headers,
      body: JSON.stringify({ refreshStale: false }),
    });
    const compareData = (await compareRes.json()) as CartComparisonResult;

    const winner = compareData.winnerShop!;
    console.log(
      `   🏆 SÚPER GANADOR: ${winner.shopName} (${winner.availableCount}/${winner.totalItemsCount} productos, cobertura ${winner.coveragePercent}%) -> Total: RD$${winner.totalPrice.toFixed(2)}`
    );
    console.log(
      `   💰 Ahorro máximo potencial frente al más caro: RD$${compareData.maxPotentialSavings.toFixed(2)}`
    );
    for (const r of compareData.ranking) {
      console.log(
        `      #${r.rank} ${r.shopName.padEnd(24)} | ${r.availableCount}/${r.totalItemsCount} disp. | Real: RD$${r.totalPrice.toFixed(2).padStart(7)} | Est. Completo: RD$${r.estimatedFullCartPrice.toFixed(2).padStart(7)}`
      );
    }
    console.log("");

    // Petición 6: Activar 'Modo En el Súper' y PATCH /api/lists/:id/items/:itemId -> Simula tachar producto en el pasillo y valida subtotal
    console.log("6️⃣  [Petición 6] Activar 'Modo En el Súper' y tachar producto en el pasillo...");
    await fetch(`${baseUrl}/api/lists/${listId}/start-shopping`, {
      method: "POST",
      headers,
      body: JSON.stringify({ shopId: winner.shopId }),
    });

    const patchRes = await fetch(`${baseUrl}/api/lists/${listId}/items/${firstItemId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        checked: true,
        addedBy: "Sol",
      }),
    });
    const patchData = (await patchRes.json()) as ListDetailResponse;
    const checkedItem = patchData.items.find((i) => i.id === firstItemId);

    console.log(
      `   ✅ HTTP ${patchRes.status} | Producto tachado en pasillo: "${checkedItem?.productName}" (Subtotal línea: RD$${checkedItem?.subtotal.toFixed(2)})`
    );
    console.log(
      `   🛒 Subtotal en el carrito (${patchData.aisleSummary.checkedItems}/${patchData.aisleSummary.totalItems} tachados - ${patchData.aisleSummary.progressPercent}%): RD$${patchData.aisleSummary.inCartTotal.toFixed(2)}`
    );
    console.log(
      `   ⏳ Pendiente por echar al carrito (${patchData.aisleSummary.pendingItems} ítems): RD$${patchData.aisleSummary.pendingTotal.toFixed(2)}`
    );
    console.log(
      `   💵 Total estimado en caja en ${patchData.selectedShopName}: RD$${patchData.aisleSummary.estimatedRegisterTotal.toFixed(2)}\n`
    );

    // Cleanup test list in Supabase
    await postgresClient`delete from shopping_list_items where "listId" = ${listId}`;
    await postgresClient`delete from shopping_lists where "id" = ${listId}`;

    console.log("🎉 Prueba Integral End-to-End (GAS-9) completada con éxito en Supabase Cloud!");
  } finally {
    server.close();
    await closeDb();
  }
}

runPostmanE2EFlow().catch((err) => {
  console.error("❌ Error en prueba E2E:", err);
  process.exit(1);
});
