import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/**
 * One shape for every API response, so the client never has to guess:
 *   success -> { data: T }
 *   failure -> { error: { code, message, fields? } }
 *
 * `message` is safe to show a customer. Internal detail goes to the server log
 * and never to the wire — section 32: no raw technical errors in the UI.
 */

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "OUT_OF_STOCK"
  | "INVALID_COUPON"
  | "RATE_LIMITED"
  | "SERVER_ERROR";

const STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  OUT_OF_STOCK: 409,
  INVALID_COUPON: 422,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
};

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 });
}

export function fail(code: ApiErrorCode, message: string, fields?: Record<string, string>) {
  return NextResponse.json({ error: { code, message, fields } }, { status: STATUS[code] });
}

/**
 * Wraps a route handler so thrown ApiErrors and Zod errors become clean
 * responses, and anything unexpected becomes a 500 with the detail logged
 * server-side rather than leaked to the client.
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(error.code, error.message, error.fields);
      }
      if (error instanceof ZodError) {
        const fields: Record<string, string> = {};
        for (const issue of error.issues) {
          const key = issue.path.join(".") || "_";
          if (!fields[key]) fields[key] = issue.message;
        }
        return fail("BAD_REQUEST", "Please check the highlighted fields.", fields);
      }
      console.error("[api] unhandled error:", error);
      return fail("SERVER_ERROR", "Something went wrong at our end. Please try again.");
    }
  };
}

/** Parse and validate a JSON body, or throw a ZodError the wrapper formats. */
export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "Expected a JSON body.");
  }
  return schema.parse(raw);
}

/** Shared pagination parsing for list endpoints. */
export function readPaging(url: URL, defaultLimit = 24, maxLimit = 60) {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const rawLimit = Number(url.searchParams.get("limit") ?? defaultLimit) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
}
