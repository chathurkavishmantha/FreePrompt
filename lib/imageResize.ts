// Browser-only image utilities.

const MAX_EDGE = 1568;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const START_QUALITY = 0.85;
const MIN_QUALITY = 0.4;

/** Approximate byte size of a base64 data URL. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/** Draw a source onto a resized canvas (max MAX_EDGE on the long edge). */
function toResizedCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  srcWidth: number,
  srcHeight: number
): HTMLCanvasElement {
  const longEdge = Math.max(srcWidth, srcHeight);
  const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
  const width = Math.round(srcWidth * scale);
  const height = Math.round(srcHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** Encode a canvas to a JPEG data URL under MAX_BYTES, lowering quality if needed. */
function encodeUnderLimit(canvas: HTMLCanvasElement): string {
  let quality = START_QUALITY;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrlBytes(dataUrl) > MAX_BYTES && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - 0.1);
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

/**
 * Resize an image File or canvas to max 1568px on the long edge, encode as
 * JPEG (quality 0.85, lowered if needed to stay under 5MB), return a base64
 * data URL.
 */
export async function imageResize(
  input: File | HTMLCanvasElement
): Promise<string> {
  if (input instanceof HTMLCanvasElement) {
    const resized = toResizedCanvas(input, input.width, input.height);
    return encodeUnderLimit(resized);
  }

  const objectUrl = URL.createObjectURL(input);
  try {
    const img = await loadImage(objectUrl);
    const resized = toResizedCanvas(img, img.naturalWidth, img.naturalHeight);
    return encodeUnderLimit(resized);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
