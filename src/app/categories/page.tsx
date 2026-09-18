import type { Metadata } from "next";

import { CategoriesPage } from "@/components/categories/CategoriesPage";
import { getBrowseTree } from "@/server/catalog/browse";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All Categories",
  description:
    "Browse every Shiv Radium gift category — name plates, photo frames, photo mugs, handmade crafts and personalised gifts.",
  alternates: { canonical: "/categories" },
};

/** Server-rendered so the first paint already has the tree; the client takes
 *  over for switching without another request. */
export default async function Page() {
  const categories = await getBrowseTree();
  return <CategoriesPage initialCategories={categories} />;
}
