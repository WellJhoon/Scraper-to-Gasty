import {
  addItemToShoppingList,
  compareShoppingList,
  createShoppingList,
} from "../cart/compare-cart.js";
import { closeDb, postgresClient } from "../db/client.js";
import { saveMatchedProductToCatalog } from "../search/catalog-service.js";
import { searchAllSupermarkets } from "../search/live-search.js";
import { groupEquivalentProducts } from "../search/product-matcher.js";

const SAMPLE_BASKET_ITEMS: Array<{
  query: string;
  quantity: number;
  addedBy: "Jhon" | "Sol";
  notes: string;
}> = [
  {
    query: "ketchup heinz 14",
    quantity: 2,
    addedBy: "Jhon",
    notes: "Para las hamburguesas del finde",
  },
  {
    query: "leche evaporada carnation 310",
    quantity: 3,
    addedBy: "Sol",
    notes: "Para las pastas y postres",
  },
  {
    query: "arroz campos 10 lb",
    quantity: 1,
    addedBy: "Jhon",
    notes: "Funda grande de 10 libras",
  },
  {
    query: "aceite crisol",
    quantity: 1,
    addedBy: "Sol",
    notes: "Aceite para cocinar",
  },
  {
    query: "avena quaker",
    quantity: 2,
    addedBy: "Sol",
    notes: "Para el desayuno",
  },
];

async function ensureSampleShoppingList(): Promise<number> {
  const listName = "Compra Quincenal Jhon & Sol";

  const existingLists = await postgresClient<{ id: number }[]>`
    select "id" from shopping_lists
    where "name" = ${listName}
    order by "id" desc
    limit 1
  `;

  let listId: number;
  if (existingLists[0]) {
    listId = existingLists[0].id;
    // Clear previous test items to keep the 5-item simulation deterministic
    await postgresClient`
      delete from shopping_list_items where "listId" = ${listId}
    `;
  } else {
    const created = await createShoppingList(listName);
    listId = created.id;
  }

  console.log(`\n📝 Preparando lista "${listName}" (listId=${listId}) con 5 artículos reales...\n`);

  for (const basketItem of SAMPLE_BASKET_ITEMS) {
    process.stdout.write(`   🔎 Buscando y agrupando "${basketItem.query}"... `);
    const searchRes = await searchAllSupermarkets(basketItem.query, { limit: 6 });
    const groups = groupEquivalentProducts(searchRes.items);
    const bestGroup = groups.find((g) => g.shopCount > 1) ?? groups[0];

    if (!bestGroup) {
      console.log(`⚠️ Sin resultados.`);
      continue;
    }

    const saved = await saveMatchedProductToCatalog(bestGroup);
    await addItemToShoppingList({
      listId,
      productId: saved.productId,
      quantity: basketItem.quantity,
      addedBy: basketItem.addedBy,
      notes: basketItem.notes,
    });

    console.log(
      `✅ "${saved.canonicalName}" (x${basketItem.quantity}, pedido por ${basketItem.addedBy}) -> ${saved.linkedShopsCount} súpers vinculados.`
    );
  }

  return listId;
}

async function main() {
  const listId = await ensureSampleShoppingList();

  console.log(`\n🧮 [GAS-6] Ejecutando Motor Comparador de Canasta Total para listId=${listId}...\n`);
  const comparison = await compareShoppingList(listId, { refreshStale: true });

  console.log(`========================================================================`);
  console.log(`🛒 LISTA: ${comparison.listName} (ID: ${comparison.listId})`);
  console.log(
    `📦 Artículos distintos: ${comparison.totalDistinctProducts} | Total unidades a comprar: ${comparison.totalUnits}`
  );
  console.log(`========================================================================\n`);

  if (comparison.winnerShop) {
    const w = comparison.winnerShop;
    console.log(`🏆 ¿DÓNDE COMPRAMOS HOY? -> 🥇 ${w.shopName.toUpperCase()}`);
    console.log(
      `   💵 Total a pagar en caja: RD$ ${w.totalPrice.toFixed(2)} (${w.availableCount}/${w.totalItemsCount} productos disponibles — ${w.coveragePercent}%)`
    );
    if (w.missingCount > 0) {
      console.log(
        `   📊 Costo estimado completando faltantes: RD$ ${w.estimatedFullCartPrice.toFixed(2)}`
      );
    }
    if (w.totalSavings > 0) {
      console.log(`   🏷️  Ahorro en ofertas dentro de la tienda: RD$ ${w.totalSavings.toFixed(2)}`);
    }
    if (comparison.maxPotentialSavings > 0) {
      console.log(
        `   💰 Ahorro frente al súper más caro: ¡Te ahorras RD$ ${comparison.maxPotentialSavings.toFixed(2)}!`
      );
    }
    console.log();
  }

  console.log(`📊 RANKING DETALLADO POR SUPERMERCADO:`);
  console.log(`------------------------------------------------------------------------`);

  for (const shop of comparison.ranking) {
    const medal =
      shop.rank === 1 ? "🥇 #1" : shop.rank === 2 ? "🥈 #2" : shop.rank === 3 ? "🥉 #3" : `   #${shop.rank}`;
    const diffText =
      shop.rank === 1
        ? "(¡OPCIÓN MÁS CONVENIENTE!)"
        : `(+RD$ ${shop.differenceFromWinner.toFixed(2)} más caro)`;

    console.log(
      `${medal} ${shop.shopName} — Disponibilidad: ${shop.availableCount}/${shop.totalItemsCount} (${shop.coveragePercent}%) ${diffText}`
    );
    console.log(
      `   💳 Total en caja: RD$ ${shop.totalPrice.toFixed(2)} | Canasta completa estimada: RD$ ${shop.estimatedFullCartPrice.toFixed(2)}`
    );

    for (const item of shop.availableItems) {
      console.log(
        `      ✅ x${item.quantity} ${item.productName} [${item.addedBy}] -> RD$ ${item.unitPrice.toFixed(2)} c/u = RD$ ${item.subtotal.toFixed(2)}`
      );
    }

    for (const missing of shop.missingItems) {
      console.log(
        `      ⚠️  FALTA: x${missing.quantity} ${missing.productName} [${missing.addedBy}] (Imputado prom: RD$ ${missing.estimatedSubtotal.toFixed(2)})`
      );
    }
    console.log();
  }

  console.log(`🎉 [GAS-6] Motor Comparador de Canasta Total verificado con éxito.`);
}

main()
  .catch((err) => {
    console.error("Error en test-compare-cart:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
