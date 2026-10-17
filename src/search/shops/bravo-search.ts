import { BRAVO_AUTH_TOKEN } from "../../api-endpoints.js";
import { getBravoHeaders } from "../../http-client.js";
import type { LiveSearchResultItem, ShopSearchOptions, ShopSearchResult } from "../types.js";

const SHOP_ID = 6;
const SHOP_NAME = "Supermercados Bravo";
const DEFAULT_LIMIT = 10;
const DEFAULT_TIMEOUT_MS = 4000;
const BRAVO_API_BASE_URL = "https://bravova-api.superbravo.com.do";
const BRAVO_IMAGE_BASE_URL = "https://bravova-resources.superbravo.com.do/images/catalogo/big";

export async function searchBravo(
  query: string,
  options: ShopSearchOptions = {}
): Promise<ShopSearchResult> {
  const start = Date.now();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 50));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Bravo mobile API endpoint with query and branch Esperilla (1000)
    const url = new URL(`${BRAVO_API_BASE_URL}/articulos`);
    url.searchParams.set("query", query);
    url.searchParams.set("idTienda", "1000");
    url.searchParams.set("limit", String(limit));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        ...getBravoHeaders(),
        "X-Auth-Token": BRAVO_AUTH_TOKEN,
        "Bravova-Landing": "true",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      // Bravo mobile API often restricts open search to active user tokens
      return {
        shopId: SHOP_ID,
        shopName: SHOP_NAME,
        items: [],
        error: `Bravo mobile API returned HTTP ${response.status} (búsqueda protegida por sesión móvil)`,
        durationMs: Date.now() - start,
      };
    }

    const json: any = await response.json().catch(() => null);
    if (!json || !json.data) {
      return {
        shopId: SHOP_ID,
        shopName: SHOP_NAME,
        items: [],
        durationMs: Date.now() - start,
      };
    }

    const rawList = Array.isArray(json.data)
      ? json.data
      : Array.isArray(json.data.articulos)
      ? json.data.articulos
      : [json.data];

    const items: LiveSearchResultItem[] = [];

    for (const item of rawList) {
      const preferred = Array.isArray(item.associatedTienda)
        ? item.associatedTienda.find((s: any) => s.idTiendaArticuloTienda === 1000) ??
          item.associatedTienda[0]
        : null;

      const pvp = preferred?.pvpArticuloTienda ?? item.precioVenta ?? item.precio;
      const currentPrice = Number(pvp);
      if (!currentPrice || currentPrice <= 0) {
        continue;
      }

      const offerPrice = preferred?.associatedOferta?.[0]?.precioReferenciaArticuloTiendaOferta;
      const regularPrice = offerPrice ? Number(offerPrice) : undefined;

      const externalId = item.idexternoArticulo || item.idArticulo;
      const imageUrl = externalId
        ? `${BRAVO_IMAGE_BASE_URL}/${encodeURIComponent(externalId)}_1.png`
        : undefined;

      const name = item.nombreArticulo || item.descripcionArticulo || item.nombre || "Artículo Bravo";
      const id = item.idArticulo || externalId || "";

      items.push({
        shopId: SHOP_ID,
        shopName: SHOP_NAME,
        productName: name,
        currentPrice,
        regularPrice,
        imageUrl,
        url: `https://superbravo.com.do/articulos/${id}`,
        sku: id ? String(id) : undefined,
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
