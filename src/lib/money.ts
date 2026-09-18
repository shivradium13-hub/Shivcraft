/**
 * Money is stored and calculated in integer paise. Never use a float for a
 * price: 0.1 + 0.2 !== 0.3, and that error compounds through coupon maths and
 * GST until an invoice is a rupee out.
 */

/** ₹549 -> 54900 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** 54900 -> 549 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** 54900 -> "₹549"  ·  54950 -> "₹549.50" */
export function formatPaise(paise: number): string {
  const rupees = paiseToRupees(paise);
  const hasPaise = paise % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(rupees);
}

/** The price a customer actually pays. */
export function effectivePriceP(product: {
  priceP: number;
  discountPriceP: number | null;
}): number {
  const { priceP, discountPriceP } = product;
  if (discountPriceP != null && discountPriceP > 0 && discountPriceP < priceP) {
    return discountPriceP;
  }
  return priceP;
}

/** Whole-number percent off, or 0 when there is no genuine discount. */
export function discountPercent(product: {
  priceP: number;
  discountPriceP: number | null;
}): number {
  const { priceP, discountPriceP } = product;
  if (!discountPriceP || discountPriceP >= priceP || priceP <= 0) return 0;
  return Math.round(((priceP - discountPriceP) / priceP) * 100);
}
