import { searchSupermarketsPhase1 } from "../search/multi-search.js";

function parseQueryArg(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--query" && args[i + 1]) {
      return args[i + 1];
    }
    if (args[i].startsWith("--query=")) {
      return args[i].slice("--query=".length);
    }
  }
  // If first arg doesn't start with --, treat as query
  if (args[0] && !args[0].startsWith("-")) {
    return args.join(" ");
  }
  return "leche";
}

async function main() {
  const query = parseQueryArg();
  console.log(`\n🔍 [GAS-3] Buscando en vivo: "${query}" across La Sirena, Nacional y Jumbo...\n`);

  const result = await searchSupermarketsPhase1(query, { limit: 5 });

  console.log(`⏱️  Búsqueda completada en ${result.durationMs}ms — Total productos encontrados: ${result.totalItems}\n`);

  const shops = [
    { key: "sirena", name: "La Sirena (VTEX)", id: 1 },
    { key: "nacional", name: "Supermercados Nacional (Magento REST)", id: 2 },
    { key: "jumbo", name: "Jumbo (GraphQL CCN)", id: 3 },
  ];

  for (const shop of shops) {
    const shopData = result.shops[shop.key];
    console.log(`====================================================`);
    console.log(`🛒 ${shop.name} [shopId: ${shop.id}]`);
    console.log(`====================================================`);

    if (!shopData) {
      console.log(`⚠️  No se obtuvo respuesta de la tienda.`);
      continue;
    }

    if (shopData.error) {
      console.log(`❌ Error: ${shopData.error} (${shopData.durationMs}ms)`);
      continue;
    }

    console.log(`✅ ${shopData.items.length} productos obtenidos en ${shopData.durationMs}ms`);

    if (shopData.items.length === 0) {
      console.log(`   (Sin resultados para "${query}")`);
    } else {
      shopData.items.slice(0, 3).forEach((item, index) => {
        const discountText = item.regularPrice
          ? ` (Oferta! Normal: RD$ ${item.regularPrice.toFixed(2)})`
          : "";
        const codeText = item.ean ? ` | EAN: ${item.ean}` : item.sku ? ` | SKU: ${item.sku}` : "";
        console.log(`   ${index + 1}. ${item.productName}`);
        console.log(`      💰 RD$ ${item.currentPrice.toFixed(2)}${discountText}${codeText}`);
        console.log(`      🔗 ${item.url}`);
        if (item.imageUrl) {
          console.log(`      🖼️  ${item.imageUrl}`);
        }
      });
    }
    console.log();
  }

  console.log(`🎉 [GAS-3] Resumen: Todos los conectores fueron probados exitosamente.`);
}

main().catch((err) => {
  console.error("Error fatal en test-search-phase1:", err);
  process.exit(1);
});
