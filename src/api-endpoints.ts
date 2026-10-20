import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && (!process.env[key] || process.env[key].trim() === "")) {
      process.env[key] = value.replace(/^['"]|['"]$/g, "");
    }
  }
}

loadDotEnv();

function resolveApiEndpoint(name: string, fallback = ""): string {
  const value = process.env[name]?.trim() || fallback;
  return value.replace(/\/+$/, "");
}

export const SIRENA_PRODUCT_API_URL_TEMPLATE = resolveApiEndpoint(
  "SIRENA_PRODUCT_API_URL_TEMPLATE",
  "https://www.sirena.do/api/catalog_system/pub/products/search/{slug}/p"
);
export const SIRENA_PRODUCTS_SEARCH_API_URL = resolveApiEndpoint(
  "SIRENA_PRODUCTS_SEARCH_API_URL",
  "https://www.sirena.do/api/catalog_system/pub/products/search"
);
export const SIRENA_CATEGORY_TREE_API_URL_TEMPLATE = resolveApiEndpoint(
  "SIRENA_CATEGORY_TREE_API_URL_TEMPLATE",
  "https://www.sirena.do/api/catalog_system/pub/category/tree/{depth}"
);
export const NACIONAL_REST_API_URL = resolveApiEndpoint(
  "NACIONAL_REST_API_URL",
  "https://supermercadosnacional.com/rest/V1/products"
);
export const PLAZA_LAMA_GRAPHQL_URL = resolveApiEndpoint(
  "PLAZA_LAMA_GRAPHQL_URL",
  "https://nextgentheadless.instaleap.io/api/v3"
);
export const PLAZA_LAMA_DPL_API_KEY = resolveApiEndpoint(
  "PLAZA_LAMA_DPL_API_KEY",
  "8136e75b-67ca-4aba-9e9a-85b729d725a0"
);
export const PRICESMART_PRODUCT_API_URL = resolveApiEndpoint(
  "PRICESMART_PRODUCT_API_URL",
  "https://www.pricesmart.com/api/ct/getProduct"
);
export const PRICESMART_DISCOVERY_API_URL = resolveApiEndpoint(
  "PRICESMART_DISCOVERY_API_URL",
  "https://core.dxpapi.com/api/v1/core/"
);
export const BRAVO_AUTH_TOKEN =
  process.env.BRAVO_AUTH_TOKEN?.trim() ||
  "dDfy25KA4AbcAIbTGrWHimB1eaiJnCAHqBO1cQlb113QtVsKOHlobtCzUh0FTdOPkLTSEl7Wn17TW0K2jIvoMybcp4zp7beQqdX1zxKqKb6yfZnKlF3hTDaIVZbi1OIB";
export const PRICESMART_AUTH_KEY =
  process.env.PRICESMART_AUTH_KEY?.trim() || "ev7libhybjg5h1d1";
