import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import type { ProductInput } from "@/lib/adminValidation";
import { ApiError } from "@/server/api/http";
import { uniqueProductSlug } from "@/server/admin/catalog";
import { db, type Db } from "@/server/db";
import {
  categories,
  customizationFields,
  productImages,
  productVariants,
  products,
} from "@/server/db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function listAdminProducts(options: {
  query?: string;
  categoryId?: string;
  state?: "all" | "active" | "disabled" | "low";
  page: number;
  limit: number;
}) {
  const filters = [];

  if (options.query) {
    const term = `%${options.query}%`;
    const clause = or(ilike(products.name, term), ilike(products.sku, term));
    if (clause) filters.push(clause);
  }
  if (options.categoryId) filters.push(eq(products.categoryId, options.categoryId));
  if (options.state === "active") filters.push(eq(products.isActive, true));
  if (options.state === "disabled") filters.push(eq(products.isActive, false));
  if (options.state === "low") {
    filters.push(sql`${products.stock} <= ${products.lowStockThreshold}`);
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, counted] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        sku: products.sku,
        priceP: products.priceP,
        discountPriceP: products.discountPriceP,
        stock: products.stock,
        lowStockThreshold: products.lowStockThreshold,
        isActive: products.isActive,
        isPersonalizable: products.isPersonalizable,
        categoryName: categories.name,
        imageUrl: sql<string | null>`(
          SELECT pi.url FROM product_images pi
          WHERE pi.product_id = ${products.id}
          ORDER BY pi.is_primary DESC, pi.position ASC LIMIT 1
        )`,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(desc(products.updatedAt))
      .limit(options.limit)
      .offset((options.page - 1) * options.limit),
    db.select({ n: count() }).from(products).where(where),
  ]);

  return { rows, total: counted[0]?.n ?? 0 };
}

export async function getAdminProduct(id: string) {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  const product = rows[0];
  if (!product) return null;

  const [images, fields, variants] = await Promise.all([
    db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(desc(productImages.isPrimary), asc(productImages.position)),
    db
      .select()
      .from(customizationFields)
      .where(eq(customizationFields.productId, id))
      .orderBy(asc(customizationFields.position)),
    db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, id))
      .orderBy(asc(productVariants.position), asc(productVariants.name)),
  ]);

  return { ...product, images, customizationFields: fields, variants };
}

/** Shared by create and update: the child rows are replaced wholesale, which
 *  keeps the form's array order authoritative. */
async function writeChildren(tx: Tx, productId: string, input: ProductInput) {
  await tx.delete(productImages).where(eq(productImages.productId, productId));
  if (input.images.length > 0) {
    // Exactly one primary: the flagged one, else the first.
    const primaryIndex = Math.max(
      0,
      input.images.findIndex((image) => image.isPrimary),
    );
    await tx.insert(productImages).values(
      input.images.map((image, index) => ({
        productId,
        url: image.url,
        alt: image.alt || null,
        position: index,
        isPrimary: index === primaryIndex,
      })),
    );
  }

  await tx.delete(customizationFields).where(eq(customizationFields.productId, productId));
  if (input.isPersonalizable && input.customizationFields.length > 0) {
    await tx.insert(customizationFields).values(
      input.customizationFields.map((field, index) => ({
        productId,
        type: field.type,
        label: field.label,
        helpText: field.helpText || null,
        isRequired: field.isRequired,
        maxLength: field.maxLength ?? null,
        options: field.options,
        position: index,
      })),
    );
  }

  await writeVariants(tx, productId, input);
}

/**
 * Variants are merged by id rather than replaced wholesale.
 *
 * A variant id is what a cart line and the storefront selector reference; if a
 * routine edit (renaming, a price tweak, restocking) regenerated ids, a
 * customer's chosen option would silently drop to base price at checkout. So a
 * row the admin kept keeps its id and its stock history, rows they removed are
 * deleted, and only genuinely new choices get a fresh id.
 */
async function writeVariants(tx: Tx, productId: string, input: ProductInput) {
  const existing = await tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));
  const existingIds = new Set(existing.map((v) => v.id));

  const keptIds = new Set(
    input.variants.map((v) => v.id).filter((id): id is string => Boolean(id) && existingIds.has(id!)),
  );

  // Remove variants the admin deleted first, so a value freed up here does not
  // clash with the unique (product, name, value) constraint on the inserts.
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length > 0) {
    await tx.delete(productVariants).where(inArray(productVariants.id, toDelete));
  }

  for (const [index, variant] of input.variants.entries()) {
    const row = {
      name: variant.name,
      value: variant.value,
      sku: variant.sku || null,
      priceDeltaP: Math.round(variant.priceDelta * 100),
      stock: variant.stock,
      position: index,
      isActive: variant.isActive,
    };
    if (variant.id && existingIds.has(variant.id)) {
      await tx.update(productVariants).set(row).where(eq(productVariants.id, variant.id));
    } else {
      await tx.insert(productVariants).values({ productId, ...row });
    }
  }
}

async function assertCategoryUsable(categoryId: string) {
  const rows = await db
    .select({ id: categories.id, parentId: categories.parentId, name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);

  if (!rows[0]) throw new ApiError("BAD_REQUEST", "That category does not exist.");
  // Products belong to a subcategory so they appear in both levels of browse.
  if (!rows[0].parentId) {
    throw new ApiError(
      "BAD_REQUEST",
      `"${rows[0].name}" is a top-level category. Choose one of its subcategories so the product shows up in browse.`,
    );
  }
}

async function assertSkuFree(sku: string, exceptId?: string) {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.sku, sku))
    .limit(1);
  if (rows[0] && rows[0].id !== exceptId) {
    throw new ApiError("CONFLICT", `SKU "${sku}" is already used by another product.`, {
      sku: "Already in use.",
    });
  }
}

export async function createProduct(input: ProductInput) {
  await assertCategoryUsable(input.categoryId);
  await assertSkuFree(input.sku);

  const slug = await uniqueProductSlug(input.name);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(products)
      .values({
        categoryId: input.categoryId,
        name: input.name,
        slug,
        sku: input.sku,
        shortDescription: input.shortDescription || null,
        description: input.description || null,
        priceP: Math.round(input.price * 100),
        discountPriceP: input.discountPrice ? Math.round(input.discountPrice * 100) : null,
        stock: input.stock,
        lowStockThreshold: input.lowStockThreshold,
        brand: input.brand || null,
        material: input.material || null,
        color: input.color || null,
        size: input.size || null,
        weightGrams: input.weightGrams ?? null,
        occasion: input.occasion || null,
        tags: input.tags,
        videoUrl: input.videoUrl || null,
        isPersonalizable: input.isPersonalizable,
        isActive: input.isActive,
        isBestSeller: input.isBestSeller,
        isTrending: input.isTrending,
        metaTitle: input.metaTitle || null,
        metaDescription: input.metaDescription || null,
      })
      .returning({ id: products.id, slug: products.slug });

    await writeChildren(tx, row.id, input);
    return row;
  });
}

export async function updateProduct(id: string, input: ProductInput) {
  const existing = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1);
  if (!existing[0]) throw new ApiError("NOT_FOUND", "That product does not exist.");

  await assertCategoryUsable(input.categoryId);
  await assertSkuFree(input.sku, id);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(products)
      .set({
        categoryId: input.categoryId,
        name: input.name,
        sku: input.sku,
        shortDescription: input.shortDescription || null,
        description: input.description || null,
        priceP: Math.round(input.price * 100),
        discountPriceP: input.discountPrice ? Math.round(input.discountPrice * 100) : null,
        stock: input.stock,
        lowStockThreshold: input.lowStockThreshold,
        brand: input.brand || null,
        material: input.material || null,
        color: input.color || null,
        size: input.size || null,
        weightGrams: input.weightGrams ?? null,
        occasion: input.occasion || null,
        tags: input.tags,
        videoUrl: input.videoUrl || null,
        isPersonalizable: input.isPersonalizable,
        isActive: input.isActive,
        isBestSeller: input.isBestSeller,
        isTrending: input.isTrending,
        metaTitle: input.metaTitle || null,
        metaDescription: input.metaDescription || null,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning({ id: products.id, slug: products.slug });

    await writeChildren(tx, id, input);
    return row;
  });
}

/** How many order lines reference this product — shown before deleting. */
export async function productOrderCount(id: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM order_items WHERE product_id = ${id}`,
  );
  return Number(rows.rows[0]?.n ?? 0);
}
