import type { Category, Subcategory } from "@/types/category";

/**
 * The only place the category API is spoken to. Components and hooks depend on
 * this, never on fetch directly, so swapping the transport (or pointing at a
 * different backend) is a change in one file.
 *
 * There is deliberately no mock fallback: silently serving invented categories
 * when the API is down hides a real outage. Failures surface as errors the UI
 * shows with a retry.
 */

const BASE = "/api/categories";

async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? "Unable to load categories.");
  }
  return payload.data as T;
}

export const categoryService = {
  /** The whole active tree, ordered as the admin arranged it. */
  async getCategories(signal?: AbortSignal): Promise<Category[]> {
    const data = await readJson<{ categories: Category[] }>(BASE, signal);
    return data.categories;
  },

  async getCategoryBySlug(slug: string, signal?: AbortSignal): Promise<Category> {
    const data = await readJson<{ category: Category }>(
      `${BASE}/${encodeURIComponent(slug)}`,
      signal,
    );
    return data.category;
  },

  /** Keyed by slug rather than id, because that is what the URLs carry. */
  async getSubcategories(slug: string, signal?: AbortSignal): Promise<Subcategory[]> {
    const data = await readJson<{ subcategories: Subcategory[] }>(
      `${BASE}/${encodeURIComponent(slug)}/subcategories`,
      signal,
    );
    return data.subcategories;
  },
};
