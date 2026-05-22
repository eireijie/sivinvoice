import { NextResponse } from "next/server";
import { processNextQueuedInvoices } from "@/lib/invoices";

export const maxDuration = 60;

export async function GET(request) {
  return runWorker(request);
}

export async function POST(request) {
  return runWorker(request);
}

async function runWorker(request) {
  try {
    authorizeWorker(request);
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || 1);
    const result = await processNextQueuedInvoices({ limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

function authorizeWorker(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const expected = `Bearer ${secret}`;
  if (request.headers.get("authorization") === expected) return;
  const error = new Error("Unauthorized worker request.");
  error.status = 401;
  throw error;
}
