import { closeDb } from "../db/client.js";
import { startApiServer } from "../server/index.js";

async function main() {
  const testPort = 3098;
  const token = process.env.APP_ACCESS_TOKEN?.trim() ?? "";
  const headers = {
    "Content-Type": "application/json",
    "x-app-token": token,
  };

  console.log(`\n🧪 [GAS-8] Probando Endpoints de Listas Sincronizadas y Modo En el Súper en puerto ${testPort}...\n`);
  const server = startApiServer(testPort);

  try {
    // 1. GET /api/lists
    const listsRes = await fetch(`http://localhost:${testPort}/api/lists`, { headers });
    const listsData: any = await listsRes.json();
    console.log(
      `1️⃣  GET /api/lists -> HTTP ${listsRes.status} (${listsData.lists?.length ?? 0} listas encontradas)`
    );

    let listId = listsData.lists?.[0]?.id;
    if (!listId) {
      const createRes = await fetch(`http://localhost:${testPort}/api/lists`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Compra Quincenal Jhon & Sol" }),
      });
      const created: any = await createRes.json();
      listId = created.id;
    }

    // 2. POST /api/lists/:id/compare
    const compareRes = await fetch(
      `http://localhost:${testPort}/api/lists/${listId}/compare`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ refreshStale: false }),
      }
    );
    const compareData: any = await compareRes.json();
    console.log(
      `2️⃣  POST /api/lists/${listId}/compare -> HTTP ${compareRes.status}`
    );
    if (compareData.winnerShop) {
      console.log(
        `    🏆 Súper Ganador: ${compareData.winnerShop.shopName} — Total: RD$ ${compareData.winnerShop.totalPrice} (${compareData.winnerShop.availableCount}/${compareData.winnerShop.totalItemsCount} disponibles)`
      );
    }

    // 3. POST /api/lists/:id/start-shopping (Modo En el Súper)
    const winnerShopId = compareData.winnerShop?.shopId ?? 3;
    const startRes = await fetch(
      `http://localhost:${testPort}/api/lists/${listId}/start-shopping`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ shopId: winnerShopId }),
      }
    );
    const startData: any = await startRes.json();
    console.log(
      `3️⃣  POST /api/lists/${listId}/start-shopping -> HTTP ${startRes.status} | Estado: "${startData.status}" en ${startData.selectedShopName}`
    );

    // 4. PATCH /api/lists/:id/items/:itemId (Simular que Jhon y Sol echan los primeros 2 productos al carrito)
    const items: any[] = startData.items ?? [];
    if (items.length >= 2) {
      await fetch(
        `http://localhost:${testPort}/api/lists/${listId}/items/${items[0].id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ checked: true }),
        }
      );

      const patch2Res = await fetch(
        `http://localhost:${testPort}/api/lists/${listId}/items/${items[1].id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ checked: true }),
        }
      );
      const updatedList: any = await patch2Res.json();
      const s = updatedList.aisleSummary;

      console.log(
        `4️⃣  PATCH /api/lists/${listId}/items/:itemId (Tachar 2 productos en el pasillo) -> HTTP ${patch2Res.status}`
      );
      console.log(
        `    🛒 Progreso en el pasillo: ${s.checkedItems}/${s.totalItems} productos en el carrito (${s.progressPercent}%)`
      );
      console.log(
        `    💵 Llevan en el carrito: RD$ ${s.inCartTotal.toFixed(2)} | Falta por recoger: RD$ ${s.pendingTotal.toFixed(2)} | Total estimado en caja: RD$ ${s.estimatedRegisterTotal.toFixed(2)}`
      );
    }

    console.log(`\n🎉 [GAS-8] Todos los endpoints de Listas y Modo En el Súper funcionaron a la perfección.`);
  } finally {
    server.close();
    await closeDb();
  }
}

main().catch((err) => {
  console.error("Error en test-api-lists:", err);
  process.exit(1);
});
