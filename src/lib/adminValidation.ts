import { z } from "zod";

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
