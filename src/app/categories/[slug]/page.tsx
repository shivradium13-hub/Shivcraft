import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CategoriesPage } from "@/components/categories/CategoriesPage";
import { getBrowseTree } from "@/server/catalog/browse";

export const dynamic = "force-dynamic";

/** Accepts a parent slug, or a subcategory slug (which selects its parent and
 *  highlights the child) — spec 14. */
async function resolve(slug: string) {
  const categories = await getBrowseTree();
  const parent = categories.find((c) => c.slug === slug);
  if (parent) return { categories, parent, child: null };

  const owner = categories.find((c) => c.subcategories.some((s) => s.slug === slug));
  if (owner) {
    return {
      categories,
      parent: owner,
      child: owner.subcategories.find((s) => s.slug === slug) ?? null,
    };
  }
  return { categories, parent: null, child: null };
}

export async function generateMetadata(
  props: PageProps<"/categories/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const { parent, child } = await resolve(slug);
  if (!parent) return { title: "Category not found" };

  const name = child?.name ?? parent.name;
  return {
    title: `${name} Categories`,
    description: `Browse ${name} at Shiv Radium — personalised gifts made to order.`,
    alternates: { canonical: `/categories/${slug}` },
  };
}

export default async function Page(props: PageProps<"/categories/[slug]">) {
  const { slug } = await props.params;
  const { categories, parent } = await resolve(slug);
  if (!parent) notFound();

  return <CategoriesPage initialCategories={categories} initialSlug={slug} />;
}
