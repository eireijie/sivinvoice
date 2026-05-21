const imageTypesToOptimize = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/bmp"
]);

export async function optimizeInvoiceFile(file) {
  if (!file || !imageTypesToOptimize.has(String(file.type || "").toLowerCase())) return file;
  if (file.size < 1_500_000) return file;
  if (typeof document === "undefined") return file;

  try {
    const bitmap = await createBitmap(file);
    const { width, height } = fitInside(bitmap.width, bitmap.height, 2200);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    if (typeof bitmap.close === "function") bitmap.close();

    const blob = await canvasToBlob(canvas, "image/jpeg", 0.86);
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], jpegName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified
    });
  } catch {
    return file;
  }
}

export async function optimizeInvoiceFiles(files) {
  return Promise.all(Array.from(files || []).map(optimizeInvoiceFile));
}

function fitInside(width, height, maxEdge) {
  const largest = Math.max(width, height);
  if (!largest || largest <= maxEdge) return { width, height };
  const scale = maxEdge / largest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

async function createBitmap(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to load image."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function jpegName(fileName) {
  return String(fileName || "invoice.jpg").replace(/\.[a-z0-9]+$/i, "") + ".jpg";
}
