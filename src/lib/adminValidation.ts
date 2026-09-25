import { z } from "zod";

import { isValidGstin } from "@/lib/gst";

/** Money arrives from the form in rupees and is stored in paise. */
const rupees = z
  .number({ message: "Enter an amount." })
  .min(0, "Cannot be negative.")
  .max(10_000_000, "That looks too large.");

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const customizationFieldSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["TEXT", "IMAGE", "FONT", "COLOR", "SELECT"]),
  label: z.string().trim().min(1, "Give the field a label.").max(120),
  helpText: optionalText(240),
  isRequired: z.boolean().default(false),
  maxLength: z.number().int().min(1).max(2000).nullable().optional(),
  options: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});

export const productImageSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().trim().min(1).max(500),
  alt: optionalText(200),
  isPrimary: z.boolean().default(false),
});

export const productSchema = z
  .object({
    name: z.string().trim().min(2, "Give the product a name.").max(200),
    sku: z.string().trim().min(1, "Enter a SKU.").max(64),
    categoryId: z.string().uuid("Choose a category."),
    shortDescription: optionalText(300),
    description: optionalText(8000),

    price: rupees,
    discountPrice: rupees.nullable().optional(),

    stock: z.number().int().min(0, "Cannot be negative.").max(1_000_000),
    lowStockThreshold: z.number().int().min(0).max(10_000).default(5),

    brand: optionalText(120),
    material: optionalText(120),
    color: optionalText(60),
    size: optionalText(60),
    weightGrams: z.number().int().min(0).max(500_000).nullable().optional(),
    occasion: optionalText(80),
    tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
    videoUrl: optionalText(500),

    isPersonalizable: z.boolean().default(false),
    isActive: z.boolean().default(true),
    isBestSeller: z.boolean().default(false),
    isTrending: z.boolean().default(false),

    metaTitle: optionalText(200),
    metaDescription: optionalText(320),

    images: z.array(productImageSchema).max(10).default([]),
    customizationFields: z.array(customizationFieldSchema).max(12).default([]),
  })
  .superRefine((value, ctx) => {
    // A "discount" that is not below the price would show a nonsense saving.
    if (value.discountPrice != null && value.discountPrice > 0 && value.discountPrice >= value.price) {
      ctx.addIssue({
        code: "custom",
        path: ["discountPrice"],
        message: "The selling price must be below the list price.",
      });
    }
    if (value.isPersonalizable && value.customizationFields.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["customizationFields"],
        message: "A personalisable product needs at least one field for the customer to fill in.",
      });
    }
    for (const [index, field] of value.customizationFields.entries()) {
      if ((field.type === "SELECT" || field.type === "FONT") && field.options.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["customizationFields", index, "options"],
          message: `"${field.label}" needs at least one choice.`,
        });
      }
    }
  });

export type ProductInput = z.infer<typeof productSchema>;

/* ------------------------------------------------------- coupons & banners */

/**
 * A date from a `datetime-local` input, which has no timezone and no seconds
 * ("2026-09-19T10:30"). Kept as a string here and turned into a Date on the
 * server, so an unparseable value is a field error rather than an Invalid Date
 * written to the column.
 */
const dateInput = z
  .string()
  .trim()
  .max(40)
  .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), "Enter a valid date.")
  .nullable()
  .optional();

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "A code needs at least 3 characters.")
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, hyphens and underscores only.")
      .transform((value) => value.toUpperCase()),
    description: optionalText(200),
    discountType: z.enum(["PERCENT", "FIXED"], { message: "Choose a discount type." }),
    /** Percent when PERCENT, rupees when FIXED — checked below. */
    discountValue: z.number({ message: "Enter the discount." }).positive("Must be more than zero."),
    minOrder: rupees.default(0),
    maxDiscount: rupees.positive("Must be more than zero.").nullable().optional(),
    usageLimit: z.number().int().positive("Must be at least 1.").max(1_000_000).nullable().optional(),
    perUserLimit: z.number().int().positive("Must be at least 1.").max(1000).nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    startsAt: dateInput,
    endsAt: dateInput,
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.discountType === "PERCENT" && value.discountValue > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "A percentage cannot be above 100.",
      });
    }
    // A window that closes before it opens would never let anyone in.
    if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The end date must be after the start date.",
      });
    }
    // checkCoupon caps the discount at the cart subtotal anyway, but a fixed
    // discount larger than its own minimum spend is almost always a typo.
    if (
      value.discountType === "FIXED" &&
      value.minOrder > 0 &&
      value.discountValue > value.minOrder
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: "This gives away more than the minimum order value. Check the numbers.",
      });
    }
  });

export type CouponInput = z.infer<typeof couponSchema>;

export const bannerSchema = z
  .object({
    title: z.string().trim().min(2, "Give the banner a title.").max(160),
    subtitle: optionalText(240),
    imageUrl: optionalText(500),
    href: optionalText(300),
    ctaLabel: optionalText(60),
    placement: z.enum(["HERO", "OFFER"], { message: "Choose where the banner goes." }),
    position: z.number().int().min(0).max(999).default(0),
    startsAt: dateInput,
    endsAt: dateInput,
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The end date must be after the start date.",
      });
    }
    // Relative paths only: an absolute URL here would send shoppers off-site
    // from a link that looks like part of the shop.
    if (value.href && !value.href.startsWith("/")) {
      ctx.addIssue({
        code: "custom",
        path: ["href"],
        message: "Start the link with / — for example /category/name-plates.",
      });
    }
  });

export type BannerInput = z.infer<typeof bannerSchema>;

/* ------------------------------------------------------------- shop settings */

export const settingsSchema = z.object({
  shipping: z.object({
    /** Rupees in the form, paise in the column. */
    flatRate: rupees,
    freeAbove: rupees,
    originPincode: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code."),
    codEnabled: z.boolean(),
  }),
  tax: z.object({
    gstPercent: z
      .number({ message: "Enter a GST rate." })
      .min(0, "Cannot be negative.")
      .max(100, "Cannot be above 100."),
    pricesIncludeTax: z.boolean(),
  }),
  support: z.object({
    email: z.string().trim().max(160).email("Enter a valid email address.").or(z.literal("")),
    phone: optionalText(30),
    whatsapp: optionalText(30),
    hours: optionalText(120),
  }),
  /** Seller details for invoices. Everything optional; a GSTIN, if given, must
   *  be well-formed so the invoice never prints a malformed registration. */
  business: z
    .object({
      legalName: optionalText(160),
      gstin: z
        .string()
        .trim()
        .max(20)
        .refine((v) => v === "" || isValidGstin(v), "Enter a valid 15-character GSTIN, or leave it blank.")
        .optional()
        .or(z.literal("")),
      pan: optionalText(15),
      line1: optionalText(200),
      line2: optionalText(200),
      city: optionalText(120),
      state: optionalText(120),
      pincode: optionalText(10),
      email: z
        .string()
        .trim()
        .max(160)
        .email("Enter a valid email address.")
        .optional()
        .or(z.literal("")),
      phone: optionalText(30),
    })
    .default({}),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
