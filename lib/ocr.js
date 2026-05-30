export async function runOcr({ fileBuffer, mimeType, maxPages = 1 }) {
  if (mimeType === "application/pdf") {
    if (process.env.GOOGLE_VISION_API_KEY) {
      const pages = await runGoogleVisionPdfPages({ fileBuffer, maxPages });
      return {
        provider: "google-vision-pdf",
        text: pages.map((page) => page.text).join("\n\n"),
        confidence: 0.88,
        pages
      };
    }

    throw new Error("GOOGLE_VISION_API_KEY is required to OCR PDF invoices.");
  }

  if (mimeType?.startsWith("image/")) {
    if (!process.env.GOOGLE_VISION_API_KEY) {
      throw new Error("GOOGLE_VISION_API_KEY is required to OCR image invoices.");
    }
    return runGoogleVisionImage({ fileBuffer });
  }

  throw new Error("Unsupported invoice file type. Upload a PDF or image.");
}

async function runGoogleVisionImage({ fileBuffer }) {
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: fileBuffer.toString("base64") },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Google Vision OCR failed with status ${response.status}`);
  }

  const payload = await response.json();
  const text = payload.responses?.[0]?.fullTextAnnotation?.text || "";
  if (!text.trim()) throw new Error("Google Vision did not return OCR text for this image.");
  return { provider: "google-vision", text, confidence: text ? 0.9 : 0.2 };
}

export async function runGoogleVisionPdfPages({ fileBuffer, maxPages = 5 }) {
  const pages = Array.from({ length: Math.min(Math.max(maxPages, 1), 30) }, (_, index) => index + 1);
  const concurrency = 5;
  const settled = [];
  for (let i = 0; i < pages.length; i += concurrency) {
    const chunk = pages.slice(i, i + concurrency);
    const batch = await Promise.allSettled(chunk.map((pageNumber) => runGoogleVisionPdfPageChunk({ fileBuffer, pages: [pageNumber] })));
    settled.push(...batch);
  }
  const results = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      results.push(...result.value);
      return;
    }
    if (isNoPagesFoundError(result.reason) && index > 0) return;
    throw result.reason;
  });

  if (!results.some((page) => page.text.trim())) throw new Error("Google Vision did not return OCR text for this PDF.");
  return results.sort((a, b) => a.pageNumber - b.pageNumber);
}

async function runGoogleVisionPdfPageChunk({ fileBuffer, pages }) {
  const response = await fetch(`https://vision.googleapis.com/v1/files:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          inputConfig: {
            mimeType: "application/pdf",
            content: fileBuffer.toString("base64")
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          pages
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Google Vision PDF OCR failed with status ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  const payload = await response.json();
  return payload.responses?.[0]?.responses?.map((page, index) => ({
    pageNumber: pages[index],
    text: page.fullTextAnnotation?.text || ""
  })) || [];
}

function isNoPagesFoundError(error) {
  return error?.status === 400 && String(error.body || error.message || "").includes("No pages found");
}
