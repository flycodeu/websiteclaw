const DEFAULT_ADMIN_EMAIL = "admin@example.com";
const DEFAULT_SESSION_SECRET = "local-admin-secret";

function parseAllowedEmails(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

const allowedEmails = parseAllowedEmails(process.env.ADMIN_ALLOWED_EMAILS);

export const adminConfig = {
  allowedEmails,
  hasEmailWhitelist: allowedEmails.length > 0,
  sessionSecret: process.env.ADMIN_SESSION_SECRET || DEFAULT_SESSION_SECRET,
  bypassAuth: process.env.DEV_BYPASS_AUTH === "true",
  fallbackEmail: process.env.NODE_ENV !== "production" ? DEFAULT_ADMIN_EMAIL : null
};

