import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient } from "@supabase/supabase-js";

loadDotEnv(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "invoices";

if (!url || !serviceKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
}

const supabase = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = join(process.cwd(), "backups", stamp);
const tableDir = join(backupRoot, "tables");
const fileDir = join(backupRoot, "storage", bucket);
mkdirSync(tableDir, { recursive: true });
mkdirSync(fileDir, { recursive: true });

const tables = [
  "organizations",
  "organization_members",
  "stores",
  "vendors",
  "invoice_batches",
  "invoices",
  "invoice_line_items",
  "product_aliases",
  "batch_detected_invoices"
];

const manifest = {
  createdAt: new Date().toISOString(),
  supabaseUrl: url,
  bucket,
  tables: {},
  storage: {
    fileCount: 0,
    totalBytes: 0
  }
};

for (const table of tables) {
  const rows = await readAllRows(table);
  manifest.tables[table] = rows.length;
  writeFileSync(join(tableDir, `${table}.json`), JSON.stringify(rows, null, 2));
  console.log(`table ${table}: ${rows.length} rows`);
}

await downloadStorageFolder("");

writeFileSync(join(backupRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`backup complete: ${backupRoot}`);
console.log(`storage files: ${manifest.storage.fileCount}`);
console.log(`storage bytes: ${manifest.storage.totalBytes}`);

async function readAllRows(table) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select("*").range(from, to);
    if (error) throw new Error(`Failed to export ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function downloadStorageFolder(prefix) {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" }
  });
  if (error) throw new Error(`Failed to list storage folder ${prefix || "/"}: ${error.message}`);

  for (const item of data || []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      await downloadStorageFolder(path);
      continue;
    }
    await downloadStorageFile(path, Number(item.metadata?.size || 0));
  }
}

async function downloadStorageFile(path, size) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw new Error(`Failed to download ${path}: ${error.message}`);

  const outputPath = join(fileDir, path);
  mkdirSync(dirname(outputPath), { recursive: true });
  const stream = createWriteStream(outputPath);
  await pipeline(Readable.fromWeb(data.stream()), stream);
  manifest.storage.fileCount += 1;
  manifest.storage.totalBytes += size || data.size || 0;
  console.log(`file ${path}`);
}

function loadDotEnv(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Environment variables may already be provided by the shell.
  }
}
