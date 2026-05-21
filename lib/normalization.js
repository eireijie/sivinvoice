export function normalizeProductName(value = "") {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(vodka|whiskey|whisky|tequila|rum|gin|liqueur|bourbon)\b/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSize(value = "") {
  const raw = String(value || "").toLowerCase().replace(/\s+/g, "");
  const match = raw.match(/(\d+(?:\.\d+)?)(ml|l|liter|litre|oz)?/);
  if (!match) return value || null;
  const amount = Number(match[1]);
  const unit = match[2] || "";
  if ((unit === "l" || unit === "liter" || unit === "litre") && amount <= 10) {
    return `${Math.round(amount * 1000)}ml`;
  }
  if (!unit && amount < 10) return `${Math.round(amount * 1000)}ml`;
  return `${String(match[1]).replace(/\.0$/, "")}${unit || "ml"}`;
}

export function splitBrandAndBottle(productName = "") {
  const normalized = productName.replace(/\s+/g, " ").trim();
  const words = normalized.split(" ");
  if (words.length <= 1) {
    return { brand: normalized || null, bottle_name: normalized || null };
  }
  return {
    brand: words.slice(0, Math.min(2, words.length - 1)).join(" "),
    bottle_name: normalized
  };
}
