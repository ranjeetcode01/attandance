import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "sa_session";
export const SESSION_DAYS = 30;

export type SessionPayload = { uid: number; sv: number; role: string; iat?: number };

let warned = false;
function secretKey() {
  let secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set to a random string of at least 32 characters.");
    }
    if (!warned) {
      console.warn("[auth] AUTH_SECRET missing — using an insecure development secret.");
      warned = true;
    }
    secret = "dev-only-insecure-secret-change-me-0123456789";
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: Omit<SessionPayload, "iat">) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.uid !== "number" || typeof payload.sv !== "number") return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
