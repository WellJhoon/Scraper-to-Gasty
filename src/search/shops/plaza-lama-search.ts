import { PLAZA_LAMA_DPL_API_KEY, PLAZA_LAMA_GRAPHQL_URL } from "../../api-endpoints.js";
import { getRandomUserAgent } from "../../http-client.js";
import type { LiveSearchResultItem, ShopSearchOptions, ShopSearchResult } from "../types.js";

const SHOP_ID = 4;
const SHOP_NAME = "Plaza Lama";
const DEFAULT_LIMIT = 10;
const DEFAULT_TIMEOUT_MS = 6000;
const PLAZA_LAMA_BASE_URL = "https://plazalama.com.do";
const STORE_REFERENCE = "PL08-D"; // Churchill principal
const CLIENT_ID = "PLAZA_LAMA";

const PLAZA_LAMA_SEARCH_QUERY = `query SearchProducts($searchProductsInput: SearchProductsInput!) {
  searchProducts(searchProductsInput: $searchProductsInput) {
    products {
      name
      sku
      slug
      price
      photosUrl
      promotion {
        isActive
        conditions {
          price
        }
      }
    }
  }
}`;

export async function searchPlazaLama(
  query: string,
  options: ShopSearchOptions = {}
): Promise<ShopSearchResult> {
  const start = Date.now();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 50));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const payload = [
      {
        operationName: "SearchProducts",
        query: PLAZA_LAMA_SEARCH_QUERY,
        variables: {
          searchProductsInput: {
            clientId: CLIENT_ID,
            storeReference: STORE_REFERENCE,
            pageSize: limit,
            currentPage: 1,
            search: [{ query }],
          },
        },
      },
    ];

    const response = await fetch(PLAZA_LAMA_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "dpl-api-key": PLAZA_LAMA_DPL_API_KEY,
        "client-name": `e-commerce Moira Engine ${CLIENT_ID}`,
        "apollographql-client-name": `e-commerce Moira Engine client ${CLIENT_ID}`,
        "User-Agent": getRandomUserAgent(),
        Referer: `${PLAZA_LAMA_BASE_URL}/`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      throw new Error(`Plaza Lama GraphQL responded with HTTP ${response.status}`);
    }

    const jsonArray: any = await response.json();
    const rawProducts: any[] = jsonArray?.[0]?.data?.searchProducts?.products ?? [];

    const items: LiveSearchResultItem[] = [];

    for (const product of rawProducts) {
      const basePrice = Number(product.price);
      if (!basePrice || basePrice <= 0) {
        continue;
      }

      const promoCondition = product.promotion?.isActive !== false
        ? product.promotion?.conditions?.[0]
        : null;
      const promoPrice = promoCondition?.price ? Number(promoCondition.price) : null;

      let currentPrice = basePrice;
      let regularPrice: number | undefined;

      if (promoPrice && promoPrice > 0 && promoPrice < basePrice) {
        currentPrice = promoPrice;
        regularPrice = basePrice;
      }

      const slug = product.slug ? String(product.slug).replace(/^\//, "") : "";
      const url = slug
        ? `${PLAZA_LAMA_BASE_URL}/producto/${slug}`
        : `${PLAZA_LAMA_BASE_URL}/busqueda?q=${encodeURIComponent(query)}`;

      const imageUrl = Array.isArray(product.photosUrl) && product.photosUrl[0]
        ? String(product.photosUrl[0])
        : undefined;

      items.push({
        shopId: SHOP_ID,
        shopName: SHOP_NAME,
        productName: product.name || "Producto Plaza Lama",
        currentPrice,
        regularPrice,
        imageUrl,
        url,
        sku: product.sku ? String(product.sku) : undefined,
      });
    }

    return {
      shopId: SHOP_ID,
      shopName: SHOP_NAME,
      items,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      shopId: SHOP_ID,
      shopName: SHOP_NAME,
      items: [],
      error: errorMsg,
      durationMs: Date.now() - start,
    };
  }
}
