import { z } from "zod";

/**
 * Every value that crosses the network is validated here, on the server.
 * Client-side checks are a convenience; these are the real gate.
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Enter an email address.")
  .max(255)
  .email("That email address does not look right.");

/** Indian mobile: 10 digits starting 6-9, with optional +91 / 0 prefix. */
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => /^(?:\+?91|0)?[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number.")
  .transform((v) => v.slice(-10));

const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(200, "That password is too long.");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  email,
  phone: phone.optional(),
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const addressSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the recipient's name.").max(120),
  phone,
  line1: z.string().trim().min(3, "Enter the house or flat number.").max(200),
  line2: z.string().trim().max(200).optional().or(z.literal("")),
  area: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().min(2, "Enter the city.").max(120),
  state: z.string().trim().min(2, "Enter the state.").max(120),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code."),
  isDefault: z.boolean().optional().default(false),
});

export const productQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(140).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  color: z.string().trim().max(60).optional(),
  material: z.string().trim().max(120).optional(),
  size: z.string().trim().max(60).optional(),
  occasion: z.string().trim().max(80).optional(),
  personalized: z.enum(["true", "false"]).optional(),
  inStock: z.enum(["true", "false"]).optional(),
  sort: z
    .enum(["popularity", "newest", "price_asc", "price_desc", "rating", "discount"])
    .optional()
    .default("popularity"),
});

export const cartItemSchema = z.object({
  productId: z.string().uuid("Unknown product."),
  quantity: z.number().int().min(1).max(20).default(1),
  variantIds: z.array(z.string().uuid()).max(5).optional().default([]),
  customization: z
    .record(
      z.string(),
      z.object({
        label: z.string().max(120),
        type: z.enum(["TEXT", "IMAGE", "FONT", "COLOR", "SELECT"]),
        value: z.string().max(2000),
      }),
    )
    .optional(),
});

export const reviewSchema = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1, "Pick a rating.").max(5),
  title: z.string().trim().max(160).optional().or(z.literal("")),
  body: z.string().trim().max(3000).optional().or(z.literal("")),
});

export const couponApplySchema = z.object({
  code: z.string().trim().min(1, "Enter a coupon code.").max(40).toUpperCase(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
