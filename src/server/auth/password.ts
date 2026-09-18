import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt from Node's own crypto module, rather than bcrypt or argon2.
 *
 * It is a memory-hard KDF (RFC 7914) designed for exactly this, it needs no
 * native compilation — which keeps Windows dev and serverless deploys
 * identical — and it is one less third-party dependency in the path that
 * handles passwords.
 *
 * N=16384/r=8 costs about 16 MB and ~80 ms per hash, which is deliberate:
 * it makes offline cracking expensive.
 */
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Returns `scrypt$N$r$p$<salt b64>$<key b64>` — self-describing, so the
 *  parameters can be raised later without invalidating existing hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  const actual = await scrypt(password.normalize("NFKC"), salt, expected.length, {
    N,
    r,
    p,
    maxmem: PARAMS.maxmem,
  });

  // Constant-time: never leak how much of the hash matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
