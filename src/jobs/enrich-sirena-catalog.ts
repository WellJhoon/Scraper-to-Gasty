import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  categorySlug: string;
  price: number;
  unit: string;
  imageUrl: string;
  isStoreExclusive?: boolean;
}

const SEARCH_TERMS = [
  // Lácteos y Huevos (including Elle & Vire, Nestlé, Milex, Parmalat, Rica)
  "leche", "crema de leche", "crema", "queso", "mantequilla", "yogurt", "huevo", "huevos",
  "elle vire", "elle & vire", "parmalat", "milex", "carnation", "dos pinos", "anchor",
  "president", "alacta", "nan", "enfagrow", "pediasure",

  // Despensa y Granos
  "arroz", "habichuela", "aceite", "cafe", "azucar", "avena", "pasta", "salsa", "harina",
  "galleta", "sal", "vinagre", "sazon", "sopita", "maiz", "guandules", "atun", "sardina",
  "crisol", "la famosa", "goya", "victorina", "baldom", "campos", "maggi", "santome",
  "quaker", "pisa", "doritos", "lays", "pringles",

  // Carnes, Pescados, Embutidos
  "pollo", "res", "cerdo", "pescado", "camaron", "salami", "jamon", "salchicha", "tocineta",
  "induveca", "sosua", "caserio", "moca", "fud", "mallitas", "cheddar", "gouda",

  // Frutas, Vegetales y Víveres
  "platano", "yuca", "papa", "cebolla", "tomate", "aguacate", "limon", "guineo", "manzana",
  "zanahoria", "lechuga", "ajo", "repollo", "batata", "auyama", "chinola", "naranja",

  // Bebidas
  "agua", "jugo", "refresco", "coca cola", "pepsi", "cerveza", "ron", "vino", "malta",
  "presidente", "brugal", "barcelo", "dasani", "planeta azul", "country club", "red bull",

  // Higiene y Cuidado Personal
  "jabon", "shampoo", "champu", "papel higienico", "pasta dental", "desodorante", "toalla",
  "protex", "colgate", "dove", "pantene", "head shoulders", "gillette", "palmolive", "suave",

  // Limpieza y Desechables
  "cloro", "detergente", "suavizante", "desinfectante", "mistolin", "axion", "ariel",
  "ace", "downy", "fabuloso", "lavaplatos", "funda basura", "bicarbonato",

  // Marcas Exclusivas La Sirena
  "wala", "esentis", "zerca", "first class"
];

function categorizeProduct(name: string, brand?: string): { category: string; categorySlug: string } {
  const norm = `${brand || ""} ${name}`.toLowerCase();

  if (/\b(leche|crema\s+de\s+leche|crema\s+leche|yogurt|queso|mantequilla|huevo|huevos|lactea|lacteo|margarina|condensada|evaporada|reina|ricotta|parmesano|mozzarella|cheddar|gouda|danes)\b/i.test(norm)) {
    return { category: "lacteos", categorySlug: "lacteos-y-huevos" };
  }
  if (/\b(salami|jamon|jamón|salchicha|salchichon|chorizo|tocineta|mortadela|peperoni|pepperoni|longaniza)\b/i.test(norm)) {
    return { category: "embutidos", categorySlug: "quesos-y-embutidos" };
  }
  if (/\b(pollo|res|cerdo|pescado|camaron|camarones|atun|atún|salmon|salmón|chuleta|molida|filete|pechuga|muslo|alas|carne|tilapia|costilla|pavo)\b/i.test(norm)) {
    return { category: "carnes", categorySlug: "carnes-pescados-y-mariscos" };
  }
  if (/\b(platano|plátano|yuca|papa|cebolla|tomate|aguacate|limon|limón|guineo|banana|manzana|naranja|lechuga|zanahoria|ajo|repollo|pepino|chinola|mango|vegetal|fruta|fresa|uvas|batata|auyama)\b/i.test(norm)) {
    return { category: "viveres", categorySlug: "frutas-y-vegetales" };
  }
  if (/\b(agua|jugo|refresco|cerveza|ron|vino|malta|gaseosa|soda|coca\s+cola|pepsi|sprite|energizante|red\s+bull|monster|whisky|vodka|tequila)\b/i.test(norm)) {
    return { category: "bebidas", categorySlug: "bebidas" };
  }
  if (/\b(shampoo|champu|jabon|jabón|desodorante|pasta\s+dental|cepillo|papel\s+higienico|toalla\s+sanitaria|afeitadora|crema\s+facial|talco|enjuague|bloqueador|panal|pañal|toallitas)\b/i.test(norm)) {
    return { category: "higiene", categorySlug: "cuidado-personal" };
  }
  if (/\b(cloro|detergente|suavizante|desinfectante|limpiador|mistolin|axion|fabuloso|lavaplatos|esponja|fregador|fundas\s+basura|desengrasante|ambientador)\b/i.test(norm)) {
    return { category: "limpieza", categorySlug: "limpieza-y-desechables" };
  }
  return { category: "granos", categorySlug: "despensa" };
}

function extractUnit(name: string): string {
  const match = name.match(/(\d+(?:\.\d+)?\s*(?:lb|oz|kg|g|gr|ml|l|lt|un|pack|paquete|rollo|und))/i);
  return match ? match[0] : "1 un";
}

const SIRENA_EXCLUSIVE_REGEX = /\b(wala|esentis|zerca|first\s+class|siremas|sirem[aá]s|sirena|grupo\s+ramos)\b/i;

async function enrichSirenaCatalog() {
  console.log("🚀 [ENRICH-SIRENA] Iniciando enriquecimiento total del catálogo La Sirena...");

  const movilSirenaPath = resolve(
    process.cwd(),
    "../movil-app-gasty/src/features/basket/data/sirenaCatalog.data.ts"
  );

  const productsMap = new Map<string, CatalogProduct>();

  // 1. Cargar productos existentes
  try {
    const content = readFileSync(movilSirenaPath, "utf8");
    const match = content.match(/export const CURATED_SIRENA_PRODUCTS:\s*CatalogProduct\[\]\s*=\s*(\[[\s\S]*\]);\s*$/);
    if (match) {
      const existing: CatalogProduct[] = JSON.parse(match[1]);
      for (const p of existing) {
        productsMap.set(p.id, p);
      }
      console.log(`📦 [ENRICH-SIRENA] Cargados ${existing.length} productos base existentes.`);
    }
  } catch (err) {
    console.warn("⚠️ No se pudo leer el archivo existente, creando nuevo mapa.");
  }

  // 2. Extraer productos en vivo de VTEX Sirena para cada término de búsqueda
  for (let i = 0; i < SEARCH_TERMS.length; i++) {
    const term = SEARCH_TERMS[i];
    try {
      const url = `https://www.sirena.do/api/catalog_system/pub/products/search?ft=${encodeURIComponent(term)}&_from=0&_to=49`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok && res.status !== 206) continue;
      const data = (await res.json()) as any[];
      if (!Array.isArray(data)) continue;

      let addedForTerm = 0;
      for (const p of data) {
        if (!p.productId || !p.productName) continue;
        const name = (p.productName as string).trim();
        if (name.toLowerCase().includes("libro loqueleo")) continue;

        const price = Number(p.items?.[0]?.sellers?.[0]?.commertialOffer?.Price);
        const imageUrl = (p.items?.[0]?.images?.[0]?.imageUrl as string || "").replace(/^http:/, "https:");
        if (!price || price <= 0 || !imageUrl) continue;

        const brand = ((p.brand as string) || "Genérico").trim().toUpperCase();
        const id = `sirena-${p.productId}`;
        const { category, categorySlug } = categorizeProduct(name, brand);
        const unit = extractUnit(name);
        const isStoreExclusive = SIRENA_EXCLUSIVE_REGEX.test(`${brand} ${name}`);

        const item: CatalogProduct = {
          id,
          name,
          brand,
          category,
          categorySlug,
          price: Math.round(price),
          unit,
          imageUrl,
          isStoreExclusive,
        };

        if (!productsMap.has(id)) {
          addedForTerm++;
        }
        productsMap.set(id, item);
      }

      console.log(`   [${i + 1}/${SEARCH_TERMS.length}] "${term}": +${addedForTerm} nuevos (Total: ${productsMap.size})`);
    } catch {
      // Ignorar timeouts transitorios
    }
  }

  const allProducts = Array.from(productsMap.values());
  console.log(`\n🎉 [ENRICH-SIRENA] Catálogo enriquecido a ${allProducts.length} productos reales de La Sirena!`);

  // Verificar Elle & Vire específicamente
  const elleVire = allProducts.filter((p) => p.name.toLowerCase().includes("elle & vire") || p.brand.includes("ELLE"));
  console.log(`🥛 [ENRICH-SIRENA] Productos Elle & Vire integrados: ${elleVire.length}`);
  for (const ev of elleVire) {
    console.log(`   • ${ev.name} — RD$ ${ev.price} (${ev.categorySlug})`);
  }

  // 3. Escribir a sirenaCatalog.data.ts
  const outputCode = `import type { CatalogProduct } from '@/features/basket/types/basket.types';\n\n// ${allProducts.length} productos reales de La Sirena RD con fotos oficiales VTEX CDN, marcas y precios en RD$\nexport const CURATED_SIRENA_PRODUCTS: CatalogProduct[] = ${JSON.stringify(allProducts, null, 4)};\n`;

  writeFileSync(movilSirenaPath, outputCode, "utf8");
  console.log(`💾 [ENRICH-SIRENA] Guardado exitosamente en: ${movilSirenaPath}\n`);
}

enrichSirenaCatalog()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Falló enriquecimiento:", err);
    process.exit(1);
  });
