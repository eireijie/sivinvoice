export function todayStorageDay() {
  return new Date().toISOString().slice(0, 10);
}

export function organizationStorageFolder(organizationId) {
  return `organizations/${safeStorageSegment(organizationId || "unknown-organization")}`;
}

export function invoiceUploadStoragePath({ organizationId, day = todayStorageDay(), uploadGroup, index, fileName }) {
  return [
    organizationStorageFolder(organizationId),
    "invoices",
    day,
    `${safeStorageSegment(uploadGroup)}-${index}-${safeStorageName(fileName)}`
  ].join("/");
}

export function invoiceExtraStoragePath({ organizationId, invoiceId, day = todayStorageDay(), uploadGroup, index, fileName }) {
  return [
    organizationStorageFolder(organizationId),
    "invoices",
    day,
    `${safeStorageSegment(invoiceId)}-extra-${safeStorageSegment(uploadGroup)}-${index}-${safeStorageName(fileName)}`
  ].join("/");
}

export function batchUploadStoragePath({ organizationId, day = todayStorageDay(), uploadGroup, fileName }) {
  return [
    organizationStorageFolder(organizationId),
    "batches",
    day,
    `${safeStorageSegment(uploadGroup)}-${safeStorageName(fileName)}`
  ].join("/");
}

export function manualInvoiceStoragePath({ organizationId, invoiceId }) {
  return [
    organizationStorageFolder(organizationId),
    "manual",
    safeStorageSegment(invoiceId)
  ].join("/");
}

export function safeStorageName(name) {
  return String(name || "invoice").replace(/[^a-zA-Z0-9._-]/g, "-");
}

function safeStorageSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-");
}
