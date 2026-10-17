import { closeDb } from "../db/client.js";
import {
  getCatalogProductWithPrices,
  saveMatchedProductToCatalog,
} from "../search/catalog-service.js";
import { searchAllSupermarkets } from "../search/live-search.js";
import { groupEquivalentProducts } from "../search/product-matcher.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let query = "ketchup heinz";
  let saveToDb = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--query" && args[i + 1]) {
      query = args[i + 1];
      i++;
    } else if (args[i].startsWith("--query=")) {
      query = args[i].slice("--query=".length);
    } else if (args[i] === "--no-save") {
      saveToDb = false;
    } else if (!args[i].startsWith("-")) {
      query = args.slice(i).join(" ");
      break;
    }
  }

  return { query, saveToDb };
}

async function main() {
  const { query, saveToDb } = parseArgs();

  console.log(`\n🧠 [GAS-5] Probando Matcher Inteligente de Productos para: "${query}"...\n`);

  const searchResult = await searchAllSupermarkets(query, { limit: 6 });
  console.log(
    `📡 Búsqueda en vivo completada en ${searchResult.durationMs}ms (${searchResult.totalItems} resultados crudos).`
  );

  const groups = groupEquivalentProducts(searchResult.items);
  const multiShopGroups = groups.filter((g) => g.shopCount > 1);

  console.log(
    `🔗 Agrupación completada: ${searchResult.totalItems} ítems crudos -> ${groups.length} productos únicos (${multiShopGroups.length} presentes en múltiples súpers).\n`
  );

  groups.slice(0, 6).forEach((group, idx) => {
    const badge =
      group.shopCount > 1
        ? `🔥 COMPARABLE EN ${group.shopCount} SÚPERS (${group.matchConfidence}, score: ${group.similarityScore})`
        : `📦 1 Súper`;

    console.log(`================================================================`);
    console.log(`#${idx + 1} ${group.canonicalName} [${group.unit ?? "S/U"}] — ${badge}`);
    if (group.ean) {
      console.log(`   🏷️  EAN Canónico: ${group.ean}`);
    }
    if (group.imageUrl) {
      console.log(`   🖼️  Foto: ${group.imageUrl}`);
    }
    if (group.shopCount > 1) {
      console.log(
        `   🏆 Más barato en: ${group.cheapestShopName} (RD$ ${group.cheapestPrice.toFixed(2)}) | Ahorro máx: RD$ ${group.maxSavings.toFixed(2)}`
      );
    }
    console.log(`   ------------------------------------------------------------`);
    for (const offer of group.offers) {
      const promo = offer.regularPrice
        ? ` (Oferta! Regular: RD$ ${offer.regularPrice.toFixed(2)})`
        : "";
      console.log(
        `   • [${offer.shopName.padEnd(22)}] RD$ ${offer.currentPrice.toFixed(2).padStart(7)}${promo} — "${offer.productName}"`
      );
    }
    console.log();
  });

  if (saveToDb && groups.length > 0) {
    const targetGroup = multiShopGroups[0] ?? groups[0];
    console.log(`💾 Guardando en Catálogo Personal de Supabase: "${targetGroup.canonicalName}"...`);

    const saved = await saveMatchedProductToCatalog(targetGroup);
    console.log(
      `✅ Producto guardado en tabla 'products' con ID=${saved.productId} (nuevo=${saved.createdNew}, tiendas vinculadas=${saved.linkedShopsCount}).`
    );

    const verified = await getCatalogProductWithPrices(saved.productId);
    console.log(
      `🔍 Verificación en Supabase -> Precios registrados para productId=${saved.productId}:`
    );
    for (const row of verified?.prices ?? []) {
      console.log(
        `   - shopId=${row.shopId}: RD$ ${Number(row.currentPrice).toFixed(2)} | url=${row.url}`
      );
    }
  }

  console.log(`\n🎉 [GAS-5] Prueba de Matcher y Catálogo finalizada con éxito.`);
}

main()
  .catch((err) => {
    console.error("Error en test-matcher:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
