/**
 * GST helpers shared by checkout validation and the invoice.
 *
 * Everything here is presentation/validation only — GST never changes the
 * amount a customer is charged. The charged total is authoritative; the tax
 * breakdown below is derived from it so an invoice can never show a figure that
 * disagrees with what was actually paid.
 */

/** A well-formed 15-character GSTIN. Does not verify the checksum digit, only
 *  the shape, so a typo of the right length can still pass — enough to keep
 *  obviously-wrong values out of the database without pretending to be the GST
 *  portal. */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normaliseGstin(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidGstin(raw: string): boolean {
  return GSTIN_RE.test(normaliseGstin(raw));
}

/** Loose state comparison for deciding intra- vs inter-state supply: names are
 *  free text ("Gujarat" vs "gujarat "), so compare case- and space-insensitively. */
export function sameState(a: string, b: string): boolean {
  const clean = (s: string) => s.trim().toLowerCase().replace(/[^a-z]/g, "");
  return clean(a) !== "" && clean(a) === clean(b);
}

export type InvoiceTax = {
  /** GST rate as a percent, e.g. 18. */
  rate: number;
  /** How tax relates to the prices shown. */
  mode: "inclusive" | "exclusive" | "none";
  /** Net value the GST is charged on, in paise. */
  taxableValueP: number;
  /** Total GST, in paise. Equals cgst+sgst or igst. */
  gstP: number;
  cgstP: number;
  sgstP: number;
  igstP: number;
  /** True when place of supply differs from the seller's state (IGST). */
  interState: boolean;
};

/**
 * Works out the GST portion of an order for the invoice, from the money that
 * was actually stored on it. Nothing here alters the grand total.
 *
 *  - Tax-INCLUSIVE pricing: the whole total already contains GST, so the tax is
 *    extracted from it — taxable = total ÷ (1 + rate/100) — and taxable + GST
 *    equals the total exactly.
 *  - Tax-EXCLUSIVE pricing: GST was added on top and stored in `taxP`. The
 *    taxable value is the net goods after discount (delivery was added
 *    tax-free), which is exactly the base `computeTotals` taxed.
 *
 * The CGST/SGST split is rounded so the two halves always add back to the exact
 * total GST (no stray paisa).
 */
export function computeInvoiceTax(input: {
  subtotalP: number;
  discountP: number;
  shippingP: number;
  totalP: number;
  storedTaxP: number;
  rate: number;
  pricesIncludeTax: boolean;
  interState: boolean;
}): InvoiceTax {
  const { subtotalP, discountP, totalP, storedTaxP, rate, pricesIncludeTax, interState } = input;

  if (!rate || rate <= 0) {
    return {
      rate: rate || 0,
      mode: "none",
      taxableValueP: totalP,
      gstP: 0,
      cgstP: 0,
      sgstP: 0,
      igstP: 0,
      interState,
    };
  }

  let taxableValueP: number;
  let gstP: number;

  if (pricesIncludeTax) {
    taxableValueP = Math.round((totalP * 100) / (100 + rate));
    gstP = totalP - taxableValueP;
  } else {
    gstP = storedTaxP;
    taxableValueP = Math.max(0, subtotalP - discountP);
  }

  const cgstP = interState ? 0 : Math.round(gstP / 2);
  const sgstP = interState ? 0 : gstP - cgstP;
  const igstP = interState ? gstP : 0;

  return {
    rate,
    mode: pricesIncludeTax ? "inclusive" : "exclusive",
    taxableValueP,
    gstP,
    cgstP,
    sgstP,
    igstP,
    interState,
  };
}
