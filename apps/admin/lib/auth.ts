import { createHmac, timingSafeEqual } from "node:crypto";
import { adminConfig } from "@/lib/admin-config";

export const ADMIN_SESSION_COOKIE = "shop_claw_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getAllowedEmails() {
  if (adminConfig.hasEmailWhitelist) {
    return adminConfig.allowedEmails;
  }

  if (adminConfig.fallbackEmail) {
    return [adminConfig.fallbackEmail];
  }

  return [];
}

export function isAllowedEmail(email: string) {
  return getAllowedEmails().includes(email.trim().toLowerCase());
}

function sign(payload: string) {
  return createHmac("sha256", adminConfig.sessionSecret).update(payload).digest("hex");
}

export function createSessionToken(email: string) {
  const payload = Buffer.from(
    JSON.stringify({
      email: email.trim().toLowerCase(),
      expiresAt: Date.now() + SESSION_TTL_MS
    })
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string) {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email: string;
      expiresAt: number;
    };

    if (parsed.expiresAt < Date.now() || !isAllowedEmail(parsed.email)) {
      return null;
    }

    return parsed.email;
  } catch {
    return null;
  }
}

export function sanitizeNextPath(nextPath: string | null | undefined) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/";
  }

  return nextPath;
}
