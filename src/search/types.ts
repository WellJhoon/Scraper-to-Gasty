export interface LiveSearchResultItem {
  shopId: number;
  shopName: string;
  productName: string;
  currentPrice: number;
  regularPrice?: number;
  imageUrl?: string;
  url: string;
  ean?: string;
  sku?: string;
}

export interface ShopSearchOptions {
  limit?: number;
  timeoutMs?: number;
}

export interface ShopSearchResult {
  shopId: number;
  shopName: string;
  items: LiveSearchResultItem[];
  error?: string;
  durationMs: number;
}

export interface MultiSearchResult {
  query: string;
  totalItems: number;
  shops: Record<string, ShopSearchResult>;
  items: LiveSearchResultItem[];
  durationMs: number;
}
