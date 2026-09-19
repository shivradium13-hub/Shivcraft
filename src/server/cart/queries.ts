import { and, asc, eq, inArray } from "drizzle-orm";

import { effectivePriceP } from "@/lib/money";
import { db } from "@/server/db";
import {
  cartItems,
  carts,
  productImages,
  productVariants,
  products,
  type CustomizationAnswer,
} from "@/server/db/schema";
import type { Shopper } from "@/server/shop/identity";

import { designSchema } from "@/lib/customizer/design";

import { checkCoupon, computeTotals, getShopSettings, type CartTotals } from "./pricing";

export type CartLine = {
  id: string;
  productId: string;
  /** Carried on the line so order placement can re-check a category-limited
   *  coupon against the same categories the cart checked it against. */
  categoryId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  listPriceP: number;
  unitPriceP: number;
  quantity: number;
  lineTotalP: number;
  stock: number;
  isActive: boolean;
  variantLabel: string | null;
  customization: Record<string, CustomizationAnswer> | null;
  /** Customizer design, carried through so checkout can freeze it onto the
   *  order exactly as the customer approved it. */
  design: unknown;
  /** A one-line description of that design for the cart, e.g. "1 photo ·
   *  Priya & Arjun". Null when the line is not personalised. */
  designSummary: string | null;
  savedForLater: boolean;
};

/** Turns a stored design into something a customer can read at a glance. */
function summariseDesign(raw: unknown): string | null {
  const design = designSchema.safeParse(raw);
  if (!design.success) return null;

  const parts: string[] = [];
  let photos = 0;
  for (const value of Object.values(design.data.zones)) {
    if (value.kind === "PHOTO") photos += 1;
    else if (value.text.value.trim()) parts.push(`“${value.text.value.trim()}”`);
  }
  if (photos > 0) parts.unshift(`${photos} photo${photos === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type CartView = {
  id: string | null;
  items: CartLine[];
  saved: CartLine[];
  totals: CartTotals;
  coupon: { code: string; description: string | null; discountP: number } | null;
  couponError: string | null;
  itemCount: number;
};

const EMPTY: CartView = {
  id: null,
  items: [],
  saved: [],
  totals: {
    subtotalP: 0,
    discountP: 0,
    shippingP: 0,
    taxP: 0,
    totalP: 0,
    freeShippingShortfallP: 0,
  },
  coupon: null,
  couponError: null,
  itemCount: 0,
};

export async function findCartId(shopper: Shopper): Promise<string | null> {
  if (!shopper.user && !shopper.guestToken) return null;
  const where = shopper.user
    ? eq(carts.userId, shopper.user.id)
    : eq(carts.guestToken, shopper.guestToken!);

  const rows = await db.select({ id: carts.id }).from(carts).where(where).limit(1);
  return rows[0]?.id ?? null;
}

/**
 * The cart as the page renders it.
 *
 * Every price is recomputed from the product row at read time, so a price the
 * admin changes is reflected immediately rather than frozen at add-to-cart.
 * (It freezes at order placement, not before — that snapshot lives on
 * order_items.)
 */
export async function getCartView(shopper: Shopper): Promise<CartView> {
  const cartId = await findCartId(shopper);
  if (!cartId) return EMPTY;

  const cartRows = await db.select().from(carts).where(eq(carts.id, cartId)).limit(1);
  const cart = cartRows[0];

  const rows = await db
    .select({
      item: cartItems,
      product: products,
      imageUrl: productImages.url,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .leftJoin(
      productImages,
      and(eq(productImages.productId, products.id), eq(productImages.isPrimary, true)),
    )
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt));

  /* Variant labels and price deltas, fetched in one go rather than per line. */
  const variantIds = [...new Set(rows.flatMap((r) => r.item.variantIds))];
  const variantById = new Map<string, { name: string; value: string; priceDeltaP: number }>();

  if (variantIds.length > 0) {
    const variants = await db
      .select({
        id: productVariants.id,
        name: productVariants.name,
        value: productVariants.value,
        priceDeltaP: productVariants.priceDeltaP,
      })
      .from(productVariants)
      .where(inArray(productVariants.id, variantIds));
    for (const v of variants) variantById.set(v.id, v);
  }

  const toLine = (row: (typeof rows)[number]): CartLine => {
    const chosen = row.item.variantIds
      .map((id) => variantById.get(id))
      .filter((v): v is NonNullable<typeof v> => Boolean(v));

    const delta = chosen.reduce((sum, v) => sum + v.priceDeltaP, 0);
    const unitPriceP = effectivePriceP(row.product) + delta;

    return {
      id: row.item.id,
      productId: row.product.id,
      categoryId: row.product.categoryId,
      name: row.product.name,
      slug: row.product.slug,
      imageUrl: row.imageUrl,
      listPriceP: row.product.priceP + delta,
      unitPriceP,
      quantity: row.item.quantity,
      lineTotalP: unitPriceP * row.item.quantity,
      stock: row.product.stock,
      isActive: row.product.isActive,
      variantLabel: chosen.length > 0 ? chosen.map((v) => `${v.name}: ${v.value}`).join(" · ") : null,
      customization: row.item.customization,
      design: row.item.design ?? null,
      designSummary: summariseDesign(row.item.design),
      savedForLater: row.item.savedForLater,
    };
  };

  const all = rows.map(toLine);
  const items = all.filter((line) => !line.savedForLater);
  const saved = all.filter((line) => line.savedForLater);

  // A product the admin disabled stays visible but cannot be counted or bought.
  const payable = items.filter((line) => line.isActive && line.stock > 0);
  const subtotalP = payable.reduce((sum, line) => sum + line.lineTotalP, 0);

  let coupon: CartView["coupon"] = null;
  let couponError: string | null = null;

  if (cart?.couponCode && subtotalP > 0) {
    const categoryIds = [...new Set(payable.map((line) => line.categoryId))];
    const result = await checkCoupon(cart.couponCode, {
      userId: shopper.user?.id ?? null,
      subtotalP,
      categoryIds,
    });

    if (result.ok) {
      coupon = { code: result.code, description: result.description, discountP: result.discountP };
    } else {
      couponError = result.message;
    }
  }

  const shop = await getShopSettings();

  return {
    id: cartId,
    items,
    saved,
    totals: computeTotals(subtotalP, coupon?.discountP ?? 0, shop),
    coupon,
    couponError,
    itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
  };
}
