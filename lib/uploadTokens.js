import { createHmac, timingSafeEqual } from "node:crypto";

const tokenTtlMs = 1000 * 60 * 60 * 4;

export function createUploadToken({ organizationId, mode }) {
  const payload = {
    organizationId,
    mode: mode === "batch" ? "batch" : "invoice",
    exp: Date.now() + tokenTtlMs
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyUploadToken(token) {
  const [encodedPayload, signature] = String(token || "").split(".");
  if (!encodedPayload || !signature) throw tokenError();
  const expected = sign(encodedPayload);
  if (!safeEqual(signature, expected)) throw tokenError();
  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (!payload.organizationId || !payload.exp || Date.now() > payload.exp) throw tokenError("Upload link expired. Ask the manager to show a new QR code.");
  return {
    organizationId: payload.organizationId,
    mode: payload.mode === "batch" ? "batch" : "invoice"
  };
}

function sign(value) {
  return createHmac("sha256", uploadSecret()).update(value).digest("base64url");
}

function uploadSecret() {
  const secret = process.env.UPLOAD_LINK_SECRET;
  if (!secret) throw new Error("UPLOAD_LINK_SECRET is required for phone upload links.");
  return secret;
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function tokenError(message = "Invalid upload link. Ask the manager to show a new QR code.") {
  const error = new Error(message);
  error.status = 401;
  return error;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}
