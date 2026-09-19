/**
 * `db:push` is deliberately disabled on this project.
 *
 * `drizzle-kit push` diffs the schema straight against the live database and
 * applies the difference immediately, with no reviewable file in between. This
 * project has one database and it is the production one, so a bad diff is not
 * a local inconvenience — it is lost customer data.
 *
 * It is also, concretely, wrong here. drizzle-kit 0.31 does not detect the
 * existing `product_variants_unique_choice` constraint, so every push offers:
 *
 *     You're about to add product_variants_unique_choice unique constraint to
 *     the table, which contains 8 items. Do you want to truncate
 *     product_variants table?
 *
 * The constraint already exists — adding it by hand returns 42P07 — and there
 * are zero duplicate rows. Answering "yes" would destroy every product variant
 * in the shop to fix nothing.
 */
console.error(
  [
    "",
    "  db:push is disabled on this project.",
    "",
    "  Use migrations instead — they are reviewable files in git:",
    "",
    "    pnpm db:generate     write a migration from your schema changes",
    "    pnpm db:migrate      apply pending migrations",
    "",
    "  Read the generated SQL before applying it.",
    "",
    "  If you are certain you want push anyway, run drizzle-kit directly:",
    "",
    "    pnpm exec drizzle-kit push",
    "",
    "  and do NOT answer yes when it offers to truncate product_variants —",
    "  that prompt is a false positive and would delete real rows.",
    "",
  ].join("\n"),
);
process.exit(1);
