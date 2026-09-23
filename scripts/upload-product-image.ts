import { readFileSync } from "node:fs";

import { put } from "@vercel/blob";
import { desc, eq } from "drizzle-orm";

import { db, schema } from "@/server/db";
import { IMAGE_EXTENSION, sniffImage } from "@/server/uploads/image";

/**
 * Uploads a local image file and attaches it to a product as a catalogue
 * image, the same way the admin media uploader does: stored PUBLIC and served
 * through /api/media/[id].
 *
 *   pnpm exec tsx --env-file=.env.local scripts/upload-product-image.ts \
 *     <imagePath> <productSlug> [--primary] [--replace] [--alt "text"]
 *
 *   --replace   remove the product's existing images first (e.g. to swap a
 *               generated placeholder for a real photograph)
 *   --primary   make this the gallery's primary image
 *   --alt       alt text (defaults to the product name)
 */

const { products, productImages, uploads } = schema;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let primary = false;
  let replace = false;
  let alt: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--primary") primary = true;
    else if (a === "--replace") replace = true;
    else if (a === "--alt") alt = argv[++i] ?? null;
    else if (a.startsWith("--alt=")) alt = a.slice("--alt=".length);
    else positional.push(a);
  }
  return { imagePath: positional[0], slug: positional[1], primary, replace, alt };
}

async function main() {
  const { imagePath, slug, primary, replace, alt } = parseArgs(process.argv.slice(2));
  if (!imagePath || !slug) {
    throw new Error("Usage: upload-product-image.ts <imagePath> <productSlug> [--primary] [--replace] [--alt text]");
  }

  const admin = (await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "ADMIN")).limit(1))[0];

  const product = (
    await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.slug, slug)).limit(1)
  )[0];
  if (!product) throw new Error(`No product with slug "${slug}".`);

  const bytes = new Uint8Array(readFileSync(imagePath));
  const contentType = sniffImage(bytes);
  if (!contentType) throw new Error(`${imagePath} is not a JPEG/PNG/WebP image.`);

  const blob = await put(`catalogue/${Date.now()}.${IMAGE_EXTENSION[contentType]}`, Buffer.from(bytes), {
    access: "private",
    contentType,
    addRandomSuffix: true,
  });

  const [uploadRow] = await db
    .insert(uploads)
    .values({
      pathname: blob.pathname,
      contentType,
      bytes: bytes.byteLength,
      originalName: imagePath.split(/[\\/]/).pop()?.slice(0, 200) ?? null,
      userId: admin?.id ?? null,
      visibility: "PUBLIC",
      attachedAt: new Date(),
    })
    .returning({ id: uploads.id });

  const url = `/api/media/${uploadRow.id}`;

  if (replace) {
    await db.delete(productImages).where(eq(productImages.productId, product.id));
  }
  if (primary) {
    await db.update(productImages).set({ isPrimary: false }).where(eq(productImages.productId, product.id));
  }

  const last = (
    await db
      .select({ position: productImages.position })
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(desc(productImages.position))
      .limit(1)
  )[0];
  const position = replace ? 0 : (last?.position ?? -1) + 1;

  await db.insert(productImages).values({
    productId: product.id,
    url,
    alt: alt ?? product.name,
    position,
    isPrimary: primary || replace,
  });

  await db.update(products).set({ updatedAt: new Date() }).where(eq(products.id, product.id));

  console.log(`  ${product.name}  <-  ${url}  (${contentType}, ${bytes.byteLength} bytes)${primary ? " [primary]" : ""}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
