import { PLAZA_LAMA_GRAPHQL_URL } from "../../api-endpoints.js";
import { getGarridoHeaders } from "../../http-client.js";
import type { LiveSearchResultItem, ShopSearchOptions, ShopSearchResult } from "../types.js";

const SHOP_ID = 8;
const SHOP_NAME = "Tiendas Garrido";
const DEFAULT_LIMIT = 10;
const DEFAULT_TIMEOUT_MS = 6000;
const GARRIDO_BASE_URL = "https://www.garrido.com.do";
const STORE_REFERENCE = "GAD";
const CLIENT_ID = "TIENDAS_GARRIDO";

const GARRIDO_SEARCH_QUERY = `query SearchProducts($searchProductsInput: SearchProductsInput!) {
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

export async function searchGarrido(
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
        query: GARRIDO_SEARCH_QUERY,
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
      headers: getGarridoHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      throw new Error(`Garrido GraphQL responded with HTTP ${response.status}`);
    }

    const jsonArray: any = await response.json();
    const rawProducts = jsonArray?.[0]?.data?.searchProducts?.products ?? [];
    const items: LiveSearchResultItem[] = [];

    for (const product of rawProducts) {
      const basePrice = Number(product.price);
      if (!basePrice || basePrice <= 0) {
        continue;
      }

      const promoCondition =
        product.promotion?.isActive !== false
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
      const sku = product.sku ? String(product.sku) : undefined;
      const url = slug
        ? `${GARRIDO_BASE_URL}/p/${slug}`
        : sku
        ? `${GARRIDO_BASE_URL}/p/${sku}`
        : `${GARRIDO_BASE_URL}/busqueda?q=${encodeURIComponent(query)}`;

      const imageUrl =
        Array.isArray(product.photosUrl) && product.photosUrl[0]
          ? String(product.photosUrl[0])
          : undefined;

      items.push({
        shopId: SHOP_ID,
        shopName: SHOP_NAME,
        productName: product.name || "Producto Garrido",
        currentPrice,
        regularPrice,
        imageUrl,
        url,
        sku,
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
