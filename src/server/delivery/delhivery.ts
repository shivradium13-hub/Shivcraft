/**
 * Delhivery (B2C last-mile) over its REST API rather than through an SDK.
 *
 * Like the Razorpay client (src/server/payments/razorpay.ts) this is plain
 * HTTPS + a token header, so a dependency would add supply-chain surface for no
 * benefit. Config is read from the environment and the whole thing is a no-op
 * until the shop owner sets the variables — the storefront falls back to the
 * postal-zone estimate and the admin simply does not show the Delhivery actions.
 *
 * NOTE: written against Delhivery's documented B2C API, but NO live call has
 * been made from this machine. The exact request/response field names
 * (create.json shipment fields, serviceability keys, packing-slip params) MUST
 * be confirmed on the developer portal
 * (https://ucp.delhivery.com/developer-portal/v1/execute) with the real token,
 * and the first real shipment watched end to end.
 */

export type DelhiveryConfig = {
  token: string;
  client: string;
  pickupName: string;
  baseUrl: string;
};

const DEFAULT_BASE_URL = "https://track.delhivery.com";

/** Null when the integration is not set up — callers then degrade gracefully
 *  (postal-zone estimate on the storefront, no Delhivery actions in admin). */
export function getDelhiveryConfig(): DelhiveryConfig | null {
  const token = process.env.DELHIVERY_API_TOKEN;
  const client = process.env.DELHIVERY_CLIENT_NAME;
  const pickupName = process.env.DELHIVERY_PICKUP_NAME;
  if (!token || !client || !pickupName) return null;
  // Base URL is optional: default to the live host. Set it to the staging host
  // (https://staging-express.delhivery.com) while testing.
  const baseUrl = (process.env.DELHIVERY_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { token, client, pickupName, baseUrl };
}

export function isDelhiveryConfigured(): boolean {
  return getDelhiveryConfig() !== null;
}

export type DelhiveryStatus = {
  configured: boolean;
  /** Derived from the base URL. Null when nothing is configured. */
  mode: "staging" | "live" | null;
  hasToken: boolean;
  hasClient: boolean;
  hasPickup: boolean;
  /** Safe to show — the registered pickup-location name, never the token. */
  pickupName: string | null;
};

/** Enough for the admin to see whether Delhivery is wired up. Returns no token. */
export function delhiveryStatus(): DelhiveryStatus {
  const token = process.env.DELHIVERY_API_TOKEN ?? "";
  const client = process.env.DELHIVERY_CLIENT_NAME ?? "";
  const pickupName = process.env.DELHIVERY_PICKUP_NAME ?? "";
  const baseUrl = process.env.DELHIVERY_BASE_URL || DEFAULT_BASE_URL;
  const configured = Boolean(token && client && pickupName);
  return {
    configured,
    mode: !configured ? null : /staging/i.test(baseUrl) ? "staging" : "live",
    hasToken: Boolean(token),
    hasClient: Boolean(client),
    hasPickup: Boolean(pickupName),
    pickupName: pickupName || null,
  };
}

function authHeaders(config: DelhiveryConfig, extra: Record<string, string> = {}) {
  return { authorization: `Token ${config.token}`, accept: "application/json", ...extra };
}

/* ------------------------------------------------------------ serviceability */

export type Serviceability = {
  serviceable: boolean;
  /** Cash on delivery available to this pincode. */
  cod: boolean;
  /** Prepaid (online-paid) shipments available to this pincode. */
  prepaid: boolean;
};

/**
 * Whether Delhivery delivers to a pincode, and with which payment modes.
 * GET /c/api/pin-codes/json/?filter_codes=<pin>
 */
export async function checkServiceability(pincode: string): Promise<Serviceability | null> {
  const config = getDelhiveryConfig();
  if (!config) return null;

  const url = `${config.baseUrl}/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(pincode)}`;
  const res = await fetch(url, { headers: authHeaders(config), cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    console.error("[delhivery] serviceability failed:", res.status, json);
    return null;
  }

  // Documented shape: { delivery_codes: [ { postal_code: { pin, pre_paid, cod, ... } } ] }
  const entry = json?.delivery_codes?.[0]?.postal_code;
  if (!entry) return { serviceable: false, cod: false, prepaid: false };

  const yes = (v: unknown) => v === "Y" || v === true || v === "true";
  const prepaid = yes(entry.pre_paid);
  const cod = yes(entry.cod ?? entry.cash);
  return { serviceable: prepaid || cod, cod, prepaid };
}

/* --------------------------------------------------------------- create order */

export type ShipmentInput = {
  orderNumber: string;
  name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  /** "Prepaid" for online-paid orders, "COD" for cash on delivery. */
  paymentMode: "Prepaid" | "COD";
  /** COD amount in rupees — 0 for prepaid. */
  codAmountRupees: number;
  /** Declared value of the parcel, in rupees. */
  totalRupees: number;
  /** Total weight in grams. */
  weightGrams: number;
  productsDesc: string;
  /** Seller GSTIN — optional; sent only when the shop has set one. */
  sellerGstin?: string | null;
};

export type CreatedShipment = { awb: string; raw: unknown };

/**
 * Manifest one shipment. POST /api/cmu/create.json with a form body that MUST be
 * prefixed `format=json&data=` (Delhivery requirement). The waybill is left
 * blank so Delhivery auto-generates one and returns it.
 */
export async function createShipment(input: ShipmentInput): Promise<CreatedShipment> {
  const config = getDelhiveryConfig();
  if (!config) throw new Error("Delhivery is not configured");

  const shipment = {
    name: input.name,
    add: [input.line1, input.line2].filter(Boolean).join(", "),
    pin: input.pincode,
    city: input.city,
    state: input.state,
    country: "India",
    phone: input.phone,
    order: input.orderNumber,
    payment_mode: input.paymentMode,
    cod_amount: input.paymentMode === "COD" ? Math.round(input.codAmountRupees) : 0,
    total_amount: Math.round(input.totalRupees),
    weight: Math.max(1, Math.round(input.weightGrams)),
    quantity: 1,
    products_desc: input.productsDesc.slice(0, 200),
    seller_name: config.client,
    waybill: "",
    // GST is optional: only sent when the shop has set a GSTIN, so a shipment
    // can be created without one.
    ...(input.sellerGstin ? { seller_gst_tin: input.sellerGstin } : {}),
  };

  const payload = {
    client: config.client,
    shipments: [shipment],
    pickup_location: { name: config.pickupName },
  };

  const body = `format=json&data=${encodeURIComponent(JSON.stringify(payload))}`;

  const res = await fetch(`${config.baseUrl}/api/cmu/create.json`, {
    method: "POST",
    headers: authHeaders(config, { "content-type": "application/x-www-form-urlencoded" }),
    body,
  });
  const json = await res.json().catch(() => null);

  // Delhivery returns 200 with a `success` flag and per-package results even for
  // business errors, so the flag is checked, not only the HTTP status.
  const pkg = json?.packages?.[0];
  const awb: string | undefined = pkg?.waybill;
  if (!res.ok || json?.success === false || !awb) {
    console.error("[delhivery] create shipment failed:", res.status, json);
    const reason = pkg?.remarks?.join?.(", ") || json?.rmk || "Delhivery rejected the shipment";
    throw new Error(reason);
  }

  return { awb, raw: json };
}

/* ------------------------------------------------------------------ tracking */

export type TrackResult = {
  status: string;
  statusDetail: string;
  location: string;
  updatedAt: string | null;
};

/** Latest tracking status for an AWB. GET /api/v1/packages/json/?waybill=<awb> */
export async function trackShipment(awb: string): Promise<TrackResult | null> {
  const config = getDelhiveryConfig();
  if (!config) return null;

  const url = `${config.baseUrl}/api/v1/packages/json/?waybill=${encodeURIComponent(awb)}`;
  const res = await fetch(url, { headers: authHeaders(config), cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    console.error("[delhivery] track failed:", res.status, json);
    return null;
  }

  const shipment = json?.ShipmentData?.[0]?.Shipment;
  const status = shipment?.Status;
  if (!status) return null;
  return {
    status: status.Status ?? "",
    statusDetail: status.Instructions ?? status.StatusType ?? "",
    location: status.StatusLocation ?? "",
    updatedAt: status.StatusDateTime ?? null,
  };
}

/** The customer-facing public tracking page for an AWB. */
export function publicTrackingUrl(awb: string): string {
  return `https://www.delhivery.com/track/package/${encodeURIComponent(awb)}`;
}

/**
 * The packing-slip / label. GET /api/p/packing_slip?wbns=<awb>&pdf=true
 * Returns the download link Delhivery provides (the PDF is hosted by them).
 */
export async function fetchLabel(awb: string): Promise<{ url: string } | null> {
  const config = getDelhiveryConfig();
  if (!config) return null;

  const url = `${config.baseUrl}/api/p/packing_slip?wbns=${encodeURIComponent(awb)}&pdf=true`;
  const res = await fetch(url, { headers: authHeaders(config), cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    console.error("[delhivery] label failed:", res.status, json);
    return null;
  }
  const link = json?.packages?.[0]?.pdf_download_link ?? json?.packages?.[0]?.label;
  return link ? { url: link } : null;
}
