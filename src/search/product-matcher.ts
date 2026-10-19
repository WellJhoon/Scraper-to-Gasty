import { formatUnit, parseUnit, type ParsedUnit } from "../unit-utils.js";
import type {
  LiveSearchResultItem,
  MatchConfidence,
  MatchedProductGroup,
} from "./types.js";

const PACKAGING_STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "con",
  "en",
  "para",
  "por",
  "al",
  "y",
  "o",
  "un",
  "una",
  "und",
  "unidad",
  "unidades",
  "paquete",
  "empaque",
  "envase",
  "botella",
  "frasco",
  "plastico",
  "vidrio",
  "dispensador",
  "regular",
  "original",
  "clasico",
  "clasica",
  "sabor",
  "tipo",
  // Exclusive supermarket private-label tokens so equivalent store brands match by generic product name
  "wala",
  "esentis",
  "zerca",
  "lider",
  "siremas",
  "sirena",
  "bravo",
  "carrefour",
  "garrido",
  "members",
  "member",
  "selection",
]);

const UNIT_WORDS = new Set([
  "oz",
  "onz",
  "onza",
  "onzas",
  "lb",
  "lbs",
  "libra",
  "libras",
  "gr",
  "grs",
  "g",
  "gramo",
  "gramos",
  "kg",
  "kilo",
  "kilos",
  "kilogramo",
  "kilogramos",
  "ml",
  "cc",
  "lt",
  "lts",
  "l",
  "litro",
  "litros",
  "gl",
  "galon",
  "galones",
]);

const VARIANT_RULES: Array<{ canonical: string; patterns: RegExp[] }> = [
  {
    canonical: "sin_azucar",
    patterns: [/\bsin\s+azucar\b/, /\breducido\s+en\s+azucar\b/, /\bzero\b/, /\bsugar\s+free\b/],
  },
  {
    canonical: "sin_sal",
    patterns: [/\bsin\s+sal\b/, /\bbajo\s+en\s+sodio\b/, /\bno\s+salt\b/],
  },
  {
    canonical: "organico",
    patterns: [/\borganic[oa]s?\b/],
  },
  {
    canonical: "deslactosada",
    patterns: [/\bdeslactosad[oa]s?\b/, /\bsin\s+lactosa\b/, /\blactose\s+free\b/],
  },
  {
    canonical: "sin_gluten",
    patterns: [/\bsin\s+gluten\b/, /\bgluten\s+free\b/],
  },
  {
    canonical: "light",
    patterns: [/\blight\b/, /\bdiet\b/, /\bbaj[oa]\s+en\s+grasa\b/],
  },
  {
    canonical: "integral",
    patterns: [/\bintegral\b/],
  },
  {
    canonical: "jalapeno",
    patterns: [/\bjalapen[oa]s?\b/, /\bpicante\b/, /\bspicy\b/, /\bhot\b/],
  },
  {
    canonical: "vainilla",
    patterns: [/\bvainilla\b/],
  },
  {
    canonical: "chocolate",
    patterns: [/\bchocolate\b/, /\bcacao\b/],
  },
  {
    canonical: "fresa",
    patterns: [/\bfresa\b/, /\bstrawberry\b/],
  },
  {
    canonical: "almendra",
    patterns: [/\balmendras?\b/, /\balmond\b/],
  },
  {
    canonical: "coco",
    patterns: [/\bcoco\b/, /\bcoconut\b/],
  },
  {
    canonical: "evaporada",
    patterns: [/\bevaporad[oa]\b/],
  },
  {
    canonical: "condensada",
    patterns: [/\bcondensad[oa]\b/],
  },
  {
    canonical: "crema",
    patterns: [/\bcrema\b/],
  },
  {
    canonical: "polvo",
    patterns: [/\bpolvo\b/],
  },
];

interface EnrichedSearchItem {
  raw: LiveSearchResultItem;
  normalizedText: string;
  coreTokens: string[];
  variants: Set<string>;
  parsedUnit: ParsedUnit | null;
  eans: Set<string>;
}

export function cleanText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractNormalizedUnit(productName: string): ParsedUnit | null {
  const cleaned = productName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Match patterns like "14 Oz", "14 Onz", "14 Onzas", "10 Libras", "310g", "1.5 Lt"
  const regex =
    /\b(\d+(?:\.\d+)?)\s*(oz|onz|onzas?|lbs?|libras?|grs?|gramos?|g|kg|kilos?|ml|cc|lts?|litros?|l|gl|galon(?:es)?)\b/gi;

  const matches = [...cleaned.matchAll(regex)];
  if (matches.length === 0) {
    return null;
  }

  // Prefer the last unit expression in the product title
  const lastMatch = matches[matches.length - 1];
  const rawAmount = lastMatch[1];
  let rawUnit = lastMatch[2].toUpperCase();

  if (rawUnit.startsWith("ONZ")) rawUnit = "OZ";
  else if (rawUnit.startsWith("LIBRA") || rawUnit === "LBS") rawUnit = "LB";
  else if (rawUnit.startsWith("GRAMO") || rawUnit === "GRS" || rawUnit === "G") rawUnit = "GR";
  else if (rawUnit.startsWith("KILO")) rawUnit = "KG";
  else if (rawUnit.startsWith("LITRO") || rawUnit === "LTS" || rawUnit === "L") rawUnit = "LT";
  else if (rawUnit.startsWith("GALON")) rawUnit = "GL";

  const formatted = formatUnit(`${rawAmount} ${rawUnit}`);
  return parseUnit(formatted);
}

export function extractNormalizedEans(item: LiveSearchResultItem): Set<string> {
  const result = new Set<string>();

  const addCandidate = (raw: string | undefined) => {
    if (!raw) return;
    for (const part of raw.split(/[;,\s]+/)) {
      const digits = part.replace(/\D/g, "").replace(/^0+/, "");
      // Filter out dummy placeholder barcodes like 13000000000 (6+ trailing zeros)
      if (digits.length >= 8 && digits.length <= 14 && !/0{6,}$/.test(digits)) {
        result.add(digits);
      }
    }
  };

  addCandidate(item.ean);

  // Extract barcode from VTEX image filenames like /1-und-013000000758.jpg
  if (item.imageUrl) {
    const vtexMatch = item.imageUrl.match(/\/1-und-0*(\d{8,14})\.[a-zA-Z]+/i);
    if (vtexMatch?.[1]) {
      addCandidate(vtexMatch[1]);
    }
  }

  return result;
}

export function extractVariantModifiers(normalizedText: string): Set<string> {
  const variants = new Set<string>();
  for (const rule of VARIANT_RULES) {
    if (rule.patterns.some((p) => p.test(normalizedText))) {
      variants.add(rule.canonical);
    }
  }
  return variants;
}

export function extractCoreTokens(normalizedText: string): string[] {
  // Strip unit expressions first
  const withoutUnits = normalizedText.replace(
    /\b\d+(?:\.\d+)?\s*(oz|onz|onzas?|lbs?|libras?|grs?|gramos?|g|kg|kilos?|ml|cc|lts?|litros?|l|gl|galon(?:es)?)\b/gi,
    " "
  );

  const tokens = withoutUnits
    .split(/\s+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => {
      if (!t || t.length <= 1) return false;
      if (/^\d+(\.\d+)?$/.test(t)) return false;
      if (PACKAGING_STOPWORDS.has(t)) return false;
      if (UNIT_WORDS.has(t)) return false;
      return true;
    });

  return Array.from(new Set(tokens));
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const val of a) {
    if (!b.has(val)) return false;
  }
  return true;
}

function hasIntersection<T>(a: Set<T>, b: Set<T>): boolean {
  for (const val of a) {
    if (b.has(val)) return true;
  }
  return false;
}

function unitsAreCompatible(u1: ParsedUnit | null, u2: ParsedUnit | null): boolean {
  if (!u1 || !u2) {
    // Only allow matching without units if neither has a unit
    return u1 === null && u2 === null;
  }
  if (u1.measurement !== u2.measurement) {
    return false;
  }
  const diffRatio = Math.abs(u1.base - u2.base) / Math.max(u1.base, u2.base);
  return diffRatio <= 0.05;
}

function computeTokenSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;

  for (const t of setA) {
    if (setB.has(t)) {
      intersection++;
    }
  }

  // Dice coefficient: 2 * |A ∩ B| / (|A| + |B|)
  const dice = (2 * intersection) / (setA.size + setB.size);

  // If the smaller token set has >= 2 tokens and is 100% contained in the other, boost similarity
  const minSize = Math.min(setA.size, setB.size);
  if (minSize >= 2 && intersection === minSize) {
    return Math.max(dice, 0.9);
  }

  return dice;
}

function enrichItem(item: LiveSearchResultItem): EnrichedSearchItem {
  const normalizedText = cleanText(item.productName);
  return {
    raw: item,
    normalizedText,
    coreTokens: extractCoreTokens(normalizedText),
    variants: extractVariantModifiers(normalizedText),
    parsedUnit: extractNormalizedUnit(item.productName),
    eans: extractNormalizedEans(item),
  };
}

function compareItems(
  a: EnrichedSearchItem,
  b: EnrichedSearchItem
): { matched: boolean; confidence: MatchConfidence; score: number } {
  // Never group two items from the exact same supermarket
  if (a.raw.shopId === b.raw.shopId) {
    return { matched: false, confidence: "single_shop", score: 0 };
  }

  // Level 1A: Exact Barcode / EAN match
  if (hasIntersection(a.eans, b.eans)) {
    return { matched: true, confidence: "exact_ean", score: 1.0 };
  }

  // Level 1B: Shared CCN SKU between Supermercados Nacional (2) and Jumbo (3)
  const isCcnPair =
    (a.raw.shopId === 2 && b.raw.shopId === 3) ||
    (a.raw.shopId === 3 && b.raw.shopId === 2);
  if (isCcnPair && a.raw.sku && b.raw.sku && a.raw.sku === b.raw.sku) {
    return { matched: true, confidence: "ccn_shared_sku", score: 1.0 };
  }

  // Level 2: Normalized Text + Unit + Variant Modifiers
  if (!unitsAreCompatible(a.parsedUnit, b.parsedUnit)) {
    return { matched: false, confidence: "single_shop", score: 0 };
  }

  if (!setsEqual(a.variants, b.variants)) {
    return { matched: false, confidence: "single_shop", score: 0 };
  }

  const score = computeTokenSimilarity(a.coreTokens, b.coreTokens);
  if (score >= 0.85) {
    return { matched: true, confidence: "high_similarity", score };
  }

  return { matched: false, confidence: "single_shop", score };
}

export function groupEquivalentProducts(
  items: LiveSearchResultItem[]
): MatchedProductGroup[] {
  const enriched = items.map(enrichItem);

  type InternalCluster = {
    members: EnrichedSearchItem[];
    confidence: MatchConfidence;
    bestScore: number;
  };

  const clusters: InternalCluster[] = [];

  for (const candidate of enriched) {
    let bestClusterIndex = -1;
    let bestMatch: { confidence: MatchConfidence; score: number } | null = null;

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      // Skip if this cluster already has an offer from this shopId
      if (cluster.members.some((m) => m.raw.shopId === candidate.raw.shopId)) {
        continue;
      }

      for (const member of cluster.members) {
        const res = compareItems(candidate, member);
        if (res.matched) {
          if (!bestMatch || res.score > bestMatch.score) {
            bestMatch = { confidence: res.confidence, score: res.score };
            bestClusterIndex = i;
          }
        }
      }
    }

    if (bestClusterIndex !== -1 && bestMatch) {
      const target = clusters[bestClusterIndex];
      target.members.push(candidate);
      if (
        bestMatch.confidence === "exact_ean" ||
        (bestMatch.confidence === "ccn_shared_sku" && target.confidence !== "exact_ean")
      ) {
        target.confidence = bestMatch.confidence;
      } else if (target.confidence === "single_shop") {
        target.confidence = bestMatch.confidence;
      }
      target.bestScore = Math.max(target.bestScore, bestMatch.score);
    } else {
      clusters.push({
        members: [candidate],
        confidence: "single_shop",
        bestScore: 1.0,
      });
    }
  }

  // Convert internal clusters into MatchedProductGroup
  const groups: MatchedProductGroup[] = clusters.map((cluster) => {
    const sortedOffers = [...cluster.members]
      .map((m) => m.raw)
      .sort((a, b) => a.currentPrice - b.currentPrice);

    const cheapest = sortedOffers[0];
    const mostExpensive = sortedOffers[sortedOffers.length - 1];

    // Pick canonical unit, ean, and image
    const parsedUnit = cluster.members.find((m) => m.parsedUnit)?.parsedUnit ?? null;
    const unitStr = parsedUnit
      ? `${parsedUnit.amount} ${parsedUnit.normalizedUnit}`
      : undefined;

    let canonicalEan: string | undefined;
    for (const m of cluster.members) {
      if (m.eans.size > 0) {
        canonicalEan = Array.from(m.eans)[0];
        break;
      }
    }

    const imageUrl = sortedOffers.find((o) => o.imageUrl)?.imageUrl;

    // Pick the shortest/cleanest product name as canonical name
    const canonicalName = [...cluster.members]
      .map((m) => m.raw.productName)
      .sort((a, b) => a.length - b.length)[0];

    const maxSavings = Number(
      Math.max(0, mostExpensive.currentPrice - cheapest.currentPrice).toFixed(2)
    );

    return {
      canonicalName,
      unit: unitStr,
      baseUnit: parsedUnit?.normalizedUnit,
      baseUnitAmount: parsedUnit?.amount,
      ean: canonicalEan,
      imageUrl,
      matchConfidence: cluster.members.length > 1 ? cluster.confidence : "single_shop",
      similarityScore: Number(cluster.bestScore.toFixed(2)),
      cheapestShopId: cheapest.shopId,
      cheapestShopName: cheapest.shopName,
      cheapestPrice: cheapest.currentPrice,
      mostExpensivePrice: mostExpensive.currentPrice,
      maxSavings,
      shopCount: sortedOffers.length,
      offers: sortedOffers,
    };
  });

  // Sort groups: multi-shop matches first (by shopCount desc, then cheapestPrice asc)
  return groups.sort((a, b) => {
    if (b.shopCount !== a.shopCount) {
      return b.shopCount - a.shopCount;
    }
    return a.cheapestPrice - b.cheapestPrice;
  });
}
