/**
 * GiftCraft database schema.
 *
 * Conventions used throughout:
 *  - Money is stored as INTEGER PAISE, never a float. ₹549.00 is 54900.
 *    Format for display with `formatPaise()` in `src/lib/money.ts`.
 *  - Every table has `id` (uuid), `createdAt` and, where mutable, `updatedAt`.
 *  - Soft state (active/disabled) uses booleans so admin can hide a row from
 *    the storefront without destroying order history that references it.
 *  - Deletes that would orphan financial history are RESTRICTed, not cascaded.
 */

import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

export const userRoleEnum = pgEnum("user_role", ["USER", "ADMIN"]);

export const orderStatusEnum = pgEnum("order_status", [
  "PLACED",
  "CONFIRMED",
  "PROCESSING",
  "CUSTOMIZED",
  "PACKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "REFUNDED",
  "COD_PENDING",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "UPI",
  "CARD",
  "NETBANKING",
  "WALLET",
  "COD",
]);

export const discountTypeEnum = pgEnum("discount_type", ["PERCENT", "FIXED"]);

export const customizationFieldTypeEnum = pgEnum("customization_field_type", [
  "TEXT",
  "IMAGE",
  "FONT",
  "COLOR",
  "SELECT",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "ORDER_PLACED",
  "ORDER_CONFIRMED",
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "ORDER_CANCELLED",
  "COUPON",
  "OFFER",
  "SYSTEM",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const stockReasonEnum = pgEnum("stock_reason", [
  "ORDER_PLACED",
  "ORDER_CANCELLED",
  "ADMIN_ADJUSTMENT",
  "RESTOCK",
]);

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    /** scrypt hash, format: scrypt$N$r$p$<saltB64>$<keyB64>. Never plaintext. */
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("USER"),
    /** Admin can block a user; blocked users cannot log in or place orders. */
    isBlocked: boolean("is_blocked").notNull().default(false),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    index("users_role_idx").on(t.role),
  ],
);

/**
 * Server-side sessions. We store only a SHA-256 hash of the session token, so a
 * database leak cannot be replayed as a login. Revocable, which JWTs are not —
 * required for the admin "block user" feature to take effect immediately.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    userAgent: varchar("user_agent", { length: 400 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    line1: varchar("line1", { length: 200 }).notNull(),
    line2: varchar("line2", { length: 200 }),
    area: varchar("area", { length: 120 }),
    city: varchar("city", { length: 120 }).notNull(),
    state: varchar("state", { length: 120 }).notNull(),
    pincode: varchar("pincode", { length: 10 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------- categories */

/**
 * Self-referencing tree. A row with `parentId = null` is a top-level category
 * ("Photo Frames"); a row with a parent is a subcategory ("LED Photo Frames").
 * One table keeps the sidebar query to a single read and allows deeper nesting
 * later without a migration.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "restrict",
    }),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    /** Emoji or short icon token rendered in the sidebar. */
    icon: varchar("icon", { length: 16 }),
    imageUrl: text("image_url"),
    description: text("description"),
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    /** Surfaced as a large visual card on the homepage. */
    showOnHome: boolean("show_on_home").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("categories_slug_unique").on(t.slug),
    index("categories_parent_idx").on(t.parentId),
    index("categories_position_idx").on(t.position),
  ],
);

/* ---------------------------------------------------------------- products */

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id").notNull().references(() => categories.id, {
      onDelete: "restrict",
    }),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    sku: varchar("sku", { length: 64 }).notNull(),
    shortDescription: varchar("short_description", { length: 300 }),
    description: text("description"),

    /** List price in paise, before discount. */
    priceP: integer("price_p").notNull(),
    /** Selling price in paise. Null means "sold at list price". */
    discountPriceP: integer("discount_price_p"),

    brand: varchar("brand", { length: 120 }),
    material: varchar("material", { length: 120 }),
    color: varchar("color", { length: 60 }),
    size: varchar("size", { length: 60 }),
    weightGrams: integer("weight_grams"),
    occasion: varchar("occasion", { length: 80 }),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),

    stock: integer("stock").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),

    isPersonalizable: boolean("is_personalizable").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    isBestSeller: boolean("is_best_seller").notNull().default(false),
    isTrending: boolean("is_trending").notNull().default(false),

    /** Denormalised review aggregates, recomputed when a review is approved. */
    ratingSum: integer("rating_sum").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),

    metaTitle: varchar("meta_title", { length: 200 }),
    metaDescription: varchar("meta_description", { length: 320 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_slug_unique").on(t.slug),
    uniqueIndex("products_sku_unique").on(t.sku),
    index("products_category_idx").on(t.categoryId),
    index("products_active_idx").on(t.isActive),
    index("products_price_idx").on(t.discountPriceP),
    /** Backs the search endpoint. */
    index("products_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${t.name} || ' ' || coalesce(${t.shortDescription}, '') || ' ' || coalesce(${t.occasion}, ''))`,
    ),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: varchar("alt", { length: 200 }),
    position: integer("position").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_images_product_idx").on(t.productId, t.position)],
);

/** An option set such as Size / Colour / Frame finish. */
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    /** The axis, e.g. "Size". */
    name: varchar("name", { length: 60 }).notNull(),
    /** The choice on that axis, e.g. "12 x 18 in". */
    value: varchar("value", { length: 80 }).notNull(),
    sku: varchar("sku", { length: 64 }),
    /** Added to the product price, in paise. May be negative. */
    priceDeltaP: integer("price_delta_p").notNull().default(0),
    stock: integer("stock").notNull().default(0),
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    index("product_variants_product_idx").on(t.productId),
    unique("product_variants_unique_choice").on(t.productId, t.name, t.value),
  ],
);

/**
 * What a customer must supply for a personalised product: the admin defines the
 * fields, the storefront renders the form from them, and the answers are stored
 * on the cart/order item so the workshop can see exactly what to engrave.
 */
export const customizationFields = pgTable(
  "customization_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    type: customizationFieldTypeEnum("type").notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    helpText: varchar("help_text", { length: 240 }),
    isRequired: boolean("is_required").notNull().default(false),
    maxLength: integer("max_length"),
    /** For SELECT / FONT / COLOR: the allowed choices. */
    options: text("options").array().notNull().default(sql`ARRAY[]::text[]`),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("customization_fields_product_idx").on(t.productId, t.position)],
);

/* -------------------------------------------------------- cart & wishlist */

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** Anonymous carts are keyed by a cookie until the visitor logs in. */
    guestToken: varchar("guest_token", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("carts_user_unique").on(t.userId),
    uniqueIndex("carts_guest_unique").on(t.guestToken),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    /** Chosen variant ids, resolved to labels and price deltas at checkout. */
    variantIds: uuid("variant_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    /** { fieldId: { label, type, value } } — value is text, or a blob URL for IMAGE. */
    customization: jsonb("customization").$type<Record<string, CustomizationAnswer>>(),
    savedForLater: boolean("saved_for_later").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cart_items_cart_idx").on(t.cartId)],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("wishlist_unique").on(t.userId, t.productId)],
);

/* ------------------------------------------------------------------ orders */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human reference shown to the customer, e.g. GC-2026-0001. */
    orderNumber: varchar("order_number", { length: 32 }).notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull().default("PLACED"),

    /** Address is COPIED onto the order — editing the saved address later must
     *  not rewrite where a past parcel was sent. */
    shipName: varchar("ship_name", { length: 120 }).notNull(),
    shipPhone: varchar("ship_phone", { length: 20 }).notNull(),
    shipLine1: varchar("ship_line1", { length: 200 }).notNull(),
    shipLine2: varchar("ship_line2", { length: 200 }),
    shipArea: varchar("ship_area", { length: 120 }),
    shipCity: varchar("ship_city", { length: 120 }).notNull(),
    shipState: varchar("ship_state", { length: 120 }).notNull(),
    shipPincode: varchar("ship_pincode", { length: 10 }).notNull(),

    subtotalP: integer("subtotal_p").notNull(),
    discountP: integer("discount_p").notNull().default(0),
    shippingP: integer("shipping_p").notNull().default(0),
    taxP: integer("tax_p").notNull().default(0),
    totalP: integer("total_p").notNull(),

    couponId: uuid("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
    couponCode: varchar("coupon_code", { length: 40 }),

    cancelReason: varchar("cancel_reason", { length: 300 }),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_number_unique").on(t.orderNumber),
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
    index("orders_placed_idx").on(t.placedAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),

    /** Snapshots — an order line must still read correctly if the product is
     *  renamed, repriced or deleted years later. */
    productName: varchar("product_name", { length: 200 }).notNull(),
    productSlug: varchar("product_slug", { length: 220 }),
    imageUrl: text("image_url"),
    unitPriceP: integer("unit_price_p").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalP: integer("line_total_p").notNull(),

    variantLabel: varchar("variant_label", { length: 200 }),
    customization: jsonb("customization").$type<Record<string, CustomizationAnswer>>(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/** Append-only status history that backs the customer tracking timeline. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    status: orderStatusEnum("status").notNull(),
    note: varchar("note", { length: 300 }),
    /** Null when the system made the change rather than a person. */
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    method: paymentMethodEnum("method").notNull(),
    status: paymentStatusEnum("status").notNull().default("PENDING"),
    amountP: integer("amount_p").notNull(),

    /** Razorpay identifiers. Never store card data — the gateway holds it. */
    gatewayOrderId: varchar("gateway_order_id", { length: 120 }),
    gatewayPaymentId: varchar("gateway_payment_id", { length: 120 }),
    gatewaySignature: varchar("gateway_signature", { length: 256 }),
    failureReason: varchar("failure_reason", { length: 300 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    uniqueIndex("payments_gateway_order_unique").on(t.gatewayOrderId),
  ],
);

/* ----------------------------------------------------------------- coupons */

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 40 }).notNull(),
    description: varchar("description", { length: 200 }),
    discountType: discountTypeEnum("discount_type").notNull(),
    /** Percent (1-100) when PERCENT, paise when FIXED. */
    discountValue: integer("discount_value").notNull(),
    minOrderP: integer("min_order_p").notNull().default(0),
    maxDiscountP: integer("max_discount_p"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** Null means unlimited. */
    usageLimit: integer("usage_limit"),
    perUserLimit: integer("per_user_limit").default(1),
    usedCount: integer("used_count").notNull().default(0),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coupons_code_unique").on(sql`upper(${t.code})`)],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    amountP: integer("amount_p").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("coupon_redemptions_lookup_idx").on(t.couponId, t.userId)],
);

/* ----------------------------------------------------------------- reviews */

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Set when the reviewer actually bought the item — drives the badge. */
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    rating: smallint("rating").notNull(),
    title: varchar("title", { length: 160 }),
    body: text("body"),
    status: reviewStatusEnum("status").notNull().default("APPROVED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reviews_product_idx").on(t.productId, t.status),
    unique("reviews_one_per_user_product").on(t.userId, t.productId),
  ],
);

/* ---------------------------------------------- inventory / notifications */

/** Audit trail for every stock change, so a discrepancy can be traced. */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    /** Negative for a sale, positive for a restock or cancellation. */
    delta: integer("delta").notNull(),
    reason: stockReasonEnum("reason").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inventory_movements_product_idx").on(t.productId, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: varchar("body", { length: 400 }),
    /** Deep link into the site, e.g. /account/orders/GC-2026-0001 */
    href: varchar("href", { length: 300 }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

/* ------------------------------------------------------- content & config */

export const banners = pgTable(
  "banners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 160 }).notNull(),
    subtitle: varchar("subtitle", { length: 240 }),
    imageUrl: text("image_url"),
    href: varchar("href", { length: 300 }),
    ctaLabel: varchar("cta_label", { length: 60 }),
    /** Where it renders: HERO, STRIP, OFFER. */
    placement: varchar("placement", { length: 30 }).notNull().default("HERO"),
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("banners_placement_idx").on(t.placement, t.position)],
);

/** Single-row-per-key store for shop settings the admin can edit. */
export const settings = pgTable("settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ types */

export type CustomizationAnswer = {
  label: string;
  type: "TEXT" | "IMAGE" | "FONT" | "COLOR" | "SELECT";
  /** Text value, or the uploaded blob URL when type is IMAGE. */
  value: string;
};

/* -------------------------------------------------------------- relations */

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  addresses: many(addresses),
  orders: many(orders),
  reviews: many(reviews),
  notifications: many(notifications),
  wishlist: many(wishlistItems),
  cart: one(carts),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "categoryTree",
  }),
  children: many(categories, { relationName: "categoryTree" }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  images: many(productImages),
  variants: many(productVariants),
  customizationFields: many(customizationFields),
  reviews: many(reviews),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

export const customizationFieldsRelations = relations(customizationFields, ({ one }) => ({
  product: one(products, { fields: [customizationFields.productId], references: [products.id] }),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  product: one(products, { fields: [cartItems.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
  events: many(orderEvents),
  payments: many(payments),
  coupon: one(coupons, { fields: [orders.couponId], references: [coupons.id] }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const orderEventsRelations = relations(orderEvents, ({ one }) => ({
  order: one(orders, { fields: [orderEvents.orderId], references: [orders.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, { fields: [reviews.productId], references: [products.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
}));

export const wishlistItemsRelations = relations(wishlistItems, ({ one }) => ({
  user: one(users, { fields: [wishlistItems.userId], references: [users.id] }),
  product: one(products, { fields: [wishlistItems.productId], references: [products.id] }),
}));
