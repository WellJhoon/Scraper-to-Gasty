import { searchAllSupermarkets } from "../search/live-search.js";

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
  if (args[0] && !args[0].startsWith("-")) {
    return args.join(" ");
  }
  return "ketchup heinz";
}

async function main() {
  const query = parseQueryArg();
  console.log(`\n🔍 [GAS-4] Buscando en simultáneo en los 5 Súpers: "${query}"...\n`);

  const result = await searchAllSupermarkets(query, { limit: 5 });

  console.log(`⏱️  Búsqueda completada en ${result.durationMs}ms — Total productos: ${result.totalItems}\n`);

  const shops = [
    { key: "sirena", name: "La Sirena (VTEX)", id: 1 },
    { key: "nacional", name: "Supermercados Nacional (Magento REST)", id: 2 },
    { key: "jumbo", name: "Jumbo (GraphQL CCN)", id: 3 },
    { key: "plazaLama", name: "Plaza Lama (Instaleap GraphQL)", id: 4 },
    { key: "bravo", name: "Supermercados Bravo (Mobile API)", id: 6 },
  ];

  for (const shop of shops) {
    const shopData = result.shops[shop.key];
    console.log(`====================================================`);
    console.log(`🛒 ${shop.name} [shopId: ${shop.id}]`);
    console.log(`====================================================`);

    if (!shopData) {
      console.log(`⚠️  Sin respuesta de la tienda.`);
      continue;
    }

    if (shopData.error) {
      console.log(`ℹ️  Aviso: ${shopData.error} (${shopData.durationMs}ms)`);
      continue;
    }

    console.log(`✅ ${shopData.items.length} productos en ${shopData.durationMs}ms`);

    if (shopData.items.length === 0) {
      console.log(`   (Sin resultados para "${query}")`);
    } else {
      shopData.items.slice(0, 3).forEach((item, index) => {
        const discount = item.regularPrice
          ? ` (Oferta! Normal: RD$ ${item.regularPrice.toFixed(2)})`
          : "";
        const code = item.ean ? ` | EAN: ${item.ean}` : item.sku ? ` | SKU: ${item.sku}` : "";
        console.log(`   ${index + 1}. ${item.productName}`);
        console.log(`      💰 RD$ ${item.currentPrice.toFixed(2)}${discount}${code}`);
        console.log(`      🔗 ${item.url}`);
        if (item.imageUrl) {
          console.log(`      🖼️  ${item.imageUrl}`);
        }
      });
    }
    console.log();
  }

  console.log(`====================================================`);
  console.log(`🏆 RESUMEN DE MEJORES PRECIOS ENCONTRADOS:`);
  console.log(`====================================================`);
  result.items.slice(0, 5).forEach((item, i) => {
    console.log(`  ${i + 1}. RD$ ${item.currentPrice.toFixed(2)} — [${item.shopName}] ${item.productName}`);
  });
  console.log(`\n🎉 [GAS-4] Prueba de 5 supermercados finalizada con éxito.`);
}

main().catch((err) => {
  console.error("Error fatal en test-live-search:", err);
  process.exit(1);
});
