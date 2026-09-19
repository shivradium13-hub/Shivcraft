import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { cartItemSchema } from "@/lib/validation";
import { ApiError, created, ok, readJson, route } from "@/server/api/http";
import { db } from "@/server/db";
import {
  cartItems,
  carts,
  customizationFields,
  productVariants,
  products,
  uploads,
  type CustomizationAnswer,
} from "@/server/db/schema";
import { getProductConfig, parseDesign, validateDesign } from "@/server/customizer/service";
import { ensureShopper, readShopper, type Shopper } from "@/server/shop/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findOrCreateCart(shopper: Shopper): Promise<string> {
  const where = shopper.user
    ? eq(carts.userId, shopper.user.id)
    : eq(carts.guestToken, shopper.guestToken!);

  const existing = await db.select({ id: carts.id }).from(carts).where(where).limit(1);
  if (existing[0]) return existing[0].id;

  const [row] = await db
    .insert(carts)
    .values({ userId: shopper.user?.id ?? null, guestToken: shopper.guestToken })
    .returning({ id: carts.id });
  return row.id;
}

async function countItems(cartId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`coalesce(sum(${cartItems.quantity}), 0)::int` })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.savedForLater, false)));
  return rows[0]?.n ?? 0;
}

/** Badge count for the header. */
export const GET = route(async () => {
  const shopper = await readShopper();
  if (!shopper.user && !shopper.guestToken) return ok({ count: 0 });

  const where = shopper.user
    ? eq(carts.userId, shopper.user.id)
    : eq(carts.guestToken, shopper.guestToken!);
  const cart = await db.select({ id: carts.id }).from(carts).where(where).limit(1);
  if (!cart[0]) return ok({ count: 0 });

  return ok({ count: await countItems(cart[0].id) });
});

export const POST = route(async (request: Request) => {
  const input = await readJson(request, cartItemSchema);
  const shopper = await ensureShopper();

  /* ---------------------------------------------------------- product */
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      stock: products.stock,
      isActive: products.isActive,
      isPersonalizable: products.isPersonalizable,
    })
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);

  const product = productRows[0];
  if (!product || !product.isActive) {
    throw new ApiError("NOT_FOUND", "That product is no longer available.");
  }
  if (product.stock <= 0) {
    throw new ApiError("OUT_OF_STOCK", `${product.name} is out of stock right now.`);
  }
  if (input.quantity > product.stock) {
    throw new ApiError(
      "OUT_OF_STOCK",
      `Only ${product.stock} left in stock. Reduce the quantity and try again.`,
    );
  }

  /* --------------------------------------------------------- variants */
  if (input.variantIds.length > 0) {
    const chosen = await db
      .select({ id: productVariants.id, stock: productVariants.stock, value: productVariants.value })
      .from(productVariants)
      .where(
        and(
          inArray(productVariants.id, input.variantIds),
          eq(productVariants.productId, product.id),
          eq(productVariants.isActive, true),
        ),
      );

    // Every id must belong to THIS product — otherwise a crafted request could
    // attach another product's cheaper option.
    if (chosen.length !== input.variantIds.length) {
      throw new ApiError("BAD_REQUEST", "One of the options you picked is no longer available.");
    }
    const short = chosen.find((v) => v.stock > 0 && v.stock < input.quantity);
    if (short) {
      throw new ApiError("OUT_OF_STOCK", `Only ${short.stock} left in ${short.value}.`);
    }
  }

  /* ---------------------------------------------------- customization */
  const answers: Record<string, CustomizationAnswer> = {};
  const attachedUploadIds: string[] = [];

  if (product.isPersonalizable) {
    const fields = await db
      .select()
      .from(customizationFields)
      .where(eq(customizationFields.productId, product.id));

    for (const field of fields) {
      const supplied = input.customization?.[field.id];
      const value = supplied?.value?.trim() ?? "";

      if (!value) {
        if (field.isRequired) {
          throw new ApiError("BAD_REQUEST", `${field.label} is needed before this can be added.`, {
            [field.id]: `${field.label} is required.`,
          });
        }
        continue;
      }

      if (field.maxLength && value.length > field.maxLength) {
        throw new ApiError("BAD_REQUEST", `${field.label} is too long.`, {
          [field.id]: `Keep ${field.label.toLowerCase()} to ${field.maxLength} characters.`,
        });
      }

      if (field.options.length > 0 && !field.options.includes(value)) {
        throw new ApiError("BAD_REQUEST", `That is not one of the ${field.label} choices.`, {
          [field.id]: "Pick one of the listed options.",
        });
      }

      if (field.type === "IMAGE") {
        // The client sends the upload id; confirm this shopper owns it before
        // it is bound to their order.
        const uploadRows = await db
          .select({ id: uploads.id, userId: uploads.userId, guestToken: uploads.guestToken })
          .from(uploads)
          .where(eq(uploads.id, value))
          .limit(1);

        const upload = uploadRows[0];
        const owned = upload
          ? shopper.user
            ? upload.userId === shopper.user.id
            : Boolean(shopper.guestToken) && upload.guestToken === shopper.guestToken
          : false;

        if (!owned) {
          throw new ApiError("BAD_REQUEST", "Upload your photo again — that one could not be found.", {
            [field.id]: "Re-upload the photo.",
          });
        }
        attachedUploadIds.push(upload!.id);
        answers[field.id] = { label: field.label, type: "IMAGE", value: `/api/uploads/${upload!.id}` };
        continue;
      }

      answers[field.id] = { label: field.label, type: field.type, value };
    }
  }

  /* ------------------------------------------------- customizer design */
  /* Re-checked against the product's own configuration rather than trusted:
     a design names zones and uploads, and both have to be real and belong to
     this shopper before the line is written. */
  let design: ReturnType<typeof parseDesign> | null = null;

  if (input.design) {
    const config = await getProductConfig(product.id);
    if (!config.enabled) {
      throw new ApiError("BAD_REQUEST", "This product cannot be personalised.");
    }

    design = parseDesign(input.design);

    const { issues, uploadIds } = await validateDesign({
      config,
      design,
      userId: shopper.user?.id ?? null,
      guestToken: shopper.guestToken ?? null,
    });

    if (issues.length > 0) {
      const fields: Record<string, string> = {};
      for (const issue of issues) if (issue.zoneId) fields[issue.zoneId] = issue.message;
      throw new ApiError("BAD_REQUEST", issues[0].message, Object.keys(fields).length ? fields : undefined);
    }

    attachedUploadIds.push(...uploadIds);
  }

  /* ---------------------------------------------------------- persist */
  const cartId = await findOrCreateCart(shopper);

  /* Always a new row. Two different designs of the same product are two
     different things to make, and must never collapse into one line (§29). */
  await db.insert(cartItems).values({
    cartId,
    productId: product.id,
    quantity: input.quantity,
    variantIds: input.variantIds,
    customization: Object.keys(answers).length > 0 ? answers : null,
    design,
  });

  if (attachedUploadIds.length > 0) {
    await db
      .update(uploads)
      .set({ attachedAt: new Date() })
      .where(and(inArray(uploads.id, attachedUploadIds), isNull(uploads.attachedAt)));
  }

  return created({ added: true, count: await countItems(cartId) });
});
