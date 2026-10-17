export type ShoppingListAuthor = "Jhon" | "Sol";

export interface ShopCartItemDetail {
  itemId: number;
  productId: number;
  productName: string;
  unit?: string;
  imageUrl?: string;
  quantity: number;
  checked: boolean;
  addedBy: string;
  notes?: string;
  unitPrice: number;
  regularUnitPrice: number;
  subtotal: number;
  savings: number;
  url: string;
}

export interface MissingCartItem {
  itemId: number;
  productId: number;
  productName: string;
  unit?: string;
  imageUrl?: string;
  quantity: number;
  addedBy: string;
  estimatedUnitPrice: number;
  estimatedSubtotal: number;
}

export interface ShopCartSummary {
  rank: number;
  shopId: number;
  shopName: string;
  availableCount: number;
  missingCount: number;
  totalItemsCount: number;
  coveragePercent: number;
  isCompleteCart: boolean;
  totalPrice: number;
  estimatedFullCartPrice: number;
  totalSavings: number;
  differenceFromWinner: number;
  availableItems: ShopCartItemDetail[];
  missingItems: MissingCartItem[];
}

export interface CartComparisonResult {
  listId: number;
  listName: string;
  status: string;
  selectedShopId?: number | null;
  totalDistinctProducts: number;
  totalUnits: number;
  refreshedStalePricesCount: number;
  winnerShop: ShopCartSummary | null;
  maxPotentialSavings: number;
  ranking: ShopCartSummary[];
}

export interface CompareCartOptions {
  refreshStale?: boolean;
}
