import { ApiError, ok, route } from "@/server/api/http";
import { getAllSettings } from "@/server/settings/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * India's PIN codes start with a digit that identifies the postal region.
 * We estimate transit from the distance between the workshop's region and the
 * destination's. This is an ESTIMATE from postal zones, not a courier
 * serviceability lookup — the UI says so, and it must keep saying so unless a
 * real courier API is wired in here.
 */
const REGIONS: Record<string, string> = {
  "1": "Delhi, Haryana, Punjab, Himachal Pradesh, J&K",
  "2": "Uttar Pradesh, Uttarakhand",
  "3": "Rajasthan, Gujarat",
  "4": "Maharashtra, Madhya Pradesh, Chhattisgarh, Goa",
  "5": "Telangana, Andhra Pradesh, Karnataka",
  "6": "Tamil Nadu, Kerala, Puducherry",
  "7": "West Bengal, Odisha, Assam, North East",
  "8": "Bihar, Jharkhand",
  "9": "Army Postal Service",
};

/** Rough physical adjacency of the postal regions, for a transit estimate. */
const NEIGHBOURS: Record<string, string[]> = {
  "1": ["2"],
  "2": ["1", "3", "4", "8"],
  "3": ["2", "4"],
  "4": ["3", "2", "5"],
  "5": ["4", "6", "7"],
  "6": ["5"],
  "7": ["8", "5"],
  "8": ["2", "7"],
  "9": [],
};

function hops(from: string, to: string): number {
  if (from === to) return 0;
  const seen = new Set([from]);
  let frontier = [from];
  for (let depth = 1; depth <= 4; depth++) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const neighbour of NEIGHBOURS[node] ?? []) {
        if (seen.has(neighbour)) continue;
        if (neighbour === to) return depth;
        seen.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return 4;
}

export const GET = route(async (request: Request) => {
  const pincode = (new URL(request.url).searchParams.get("pincode") ?? "").trim();

  if (!/^[1-9]\d{5}$/.test(pincode)) {
    throw new ApiError("BAD_REQUEST", "Enter a valid 6-digit PIN code.");
  }

  // Same reader the cart and the admin form use, so the origin and the COD
  // switch cannot mean one thing here and another at checkout.
  const { shipping } = await getAllSettings();

  const originRegion = shipping.originPincode[0];
  const targetRegion = pincode[0];

  if (targetRegion === "9") {
    return ok({
      pincode,
      serviceable: false,
      message:
        "Army Postal Service addresses need to be arranged with us directly — call the workshop and we will sort it out.",
    });
  }

  // 3 working days to make it, plus transit that grows with distance.
  const distance = hops(originRegion, targetRegion);
  const minDays = 3 + Math.max(1, distance);
  const maxDays = minDays + 2 + distance;

  return ok({
    pincode,
    serviceable: true,
    region: REGIONS[targetRegion] ?? "India",
    minDays,
    maxDays,
    estimate: `${minDays}–${maxDays} working days`,
    codAvailable: shipping.codEnabled && distance <= 3,
    shippingP: shipping.flatRateP ?? 5900,
    freeAboveP: shipping.freeAboveP ?? 99900,
    note: "Estimated from postal zones, not a courier tracking check. We confirm the exact date on your artwork proof.",
  });
});
