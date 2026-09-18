/**
 * The category shapes the browse UI consumes.
 *
 * These mirror what the admin manages, so a category the admin renames,
 * reorders, re-images or disables changes here with no UI edit: the API filters
 * on isActive and orders by sortOrder before the UI ever sees a row.
 */

export interface Subcategory {
  id: string;
  name: string;
  slug: string;
  image?: string | null;
  icon?: string | null;
  /** Omitted when the API has no count — never render a placeholder number. */
  productCount?: number;
  sortOrder: number;
  /**
   * True when this row is shown under the current parent through a cross-link
   * rather than being its direct child (for example Birthday Mugs appearing
   * under both Photo Mugs and Birthday Gifts).
   */
  linked?: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  image?: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount?: number;
  subcategories: Subcategory[];
}

/** The synthetic "All Gifts" rail entry. It is not a database row — it links to
 *  the full catalogue rather than to a category page. */
export const ALL_GIFTS_SLUG = "all-gifts";

export type CategoryFetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; categories: Category[] };
