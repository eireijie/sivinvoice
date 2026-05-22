import { createHmac, timingSafeEqual } from "node:crypto";

const tokenTtlMs = 1000 * 60 * 30;

export function createUploadSessionToken(payload) {
  const session = {
    ...payload,
    exp: Date.now() + tokenTtlMs
  };
  const encodedPayload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyUploadSessionToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) throw tokenError();
  const expected = sign(encodedPayload);
  if (!safeEqual(signature, expected)) throw tokenError();
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  if (!payload.organizationId || !payload.exp || Date.now() > payload.exp) throw tokenError("Upload session expired. Choose the files and upload again.");
  return payload;
}

function sign(value) {
  return createHmac("sha256", uploadSecret()).update(value).digest("base64url");
}

function uploadSecret() {
  const secret = process.env.UPLOAD_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.OPENAI_API_KEY;
  if (!secret) throw new Error("UPLOAD_LINK_SECRET is required for signed uploads.");
  return secret;
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function tokenError(message = "Invalid upload session. Choose the files and upload again.") {
  const error = new Error(message);
  error.status = 401;
  return error;
}
