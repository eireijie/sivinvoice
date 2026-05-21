const extensionMimeTypes = new Map([
  ["pdf", "application/pdf"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["tif", "image/tiff"],
  ["tiff", "image/tiff"],
  ["gif", "image/gif"],
  ["bmp", "image/bmp"],
  ["ico", "image/x-icon"]
]);

const mimeAliases = new Map([
  ["image/jpg", "image/jpeg"],
  ["image/pjpeg", "image/jpeg"],
  ["image/tif", "image/tiff"],
  ["image/x-tiff", "image/tiff"],
  ["image/x-ms-bmp", "image/bmp"],
  ["image/vnd.microsoft.icon", "image/x-icon"]
]);

const supportedMimeTypes = new Set(extensionMimeTypes.values());
const heicExtensions = new Set(["heic", "heif"]);
const heicMimeTypes = new Set(["image/heic", "image/heif"]);

export const invoiceFileAccept = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/gif",
  "image/bmp",
  "image/x-icon",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tif",
  ".tiff",
  ".gif",
  ".bmp",
  ".ico"
].join(",");

export function inferInvoiceMimeType(file) {
  const fileType = normalizeMimeType(file?.type);
  if (supportedMimeTypes.has(fileType)) return fileType;

  const extension = getFileExtension(file?.name);
  return extensionMimeTypes.get(extension) || "";
}

export function isSupportedInvoiceFile(file) {
  return Boolean(inferInvoiceMimeType(file));
}

export function getUnsupportedInvoiceFileMessage(file) {
  const extension = getFileExtension(file?.name);
  const mimeType = normalizeMimeType(file?.type);
  if (heicExtensions.has(extension) || heicMimeTypes.has(mimeType)) {
    return "HEIC/HEIF images are not supported by the OCR provider yet. Save the photo as JPG or PNG, then upload it.";
  }
  return "Upload a PDF, JPG, PNG, WEBP, TIFF, GIF, BMP, or ICO invoice file.";
}

function normalizeMimeType(mimeType) {
  const normalized = String(mimeType || "").trim().toLowerCase();
  return mimeAliases.get(normalized) || normalized;
}

function getFileExtension(fileName) {
  const match = String(fileName || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}
