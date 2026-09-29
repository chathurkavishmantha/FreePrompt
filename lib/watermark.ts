// Browser-only helpers to obscure a masked region of a video frame
// (blur / pixelate / clone-nearby) — for hiding watermarks/logos.

export type RemovalMethod = "blur" | "pixelate" | "clone";

export type WatermarkScratch = {
  rep: HTMLCanvasElement;
  small: HTMLCanvasElement;
};

export function makeScratch(): WatermarkScratch {
  return {
    rep: document.createElement("canvas"),
    small: document.createElement("canvas"),
  };
}

/**
 * Build a canvas holding the "replacement" pixels, cropped to the mask
 * (opaque where the watermark should be covered, transparent elsewhere).
 */
function buildMaskedReplacement(
  scratch: WatermarkScratch,
  w: number,
  h: number,
  video: CanvasImageSource,
  mask: CanvasImageSource,
  method: RemovalMethod,
  strength: number
): HTMLCanvasElement {
  const rep = scratch.rep;
  if (rep.width !== w) rep.width = w;
  if (rep.height !== h) rep.height = h;
  const rctx = rep.getContext("2d")!;
  rctx.setTransform(1, 0, 0, 1, 0, 0);
  rctx.globalCompositeOperation = "source-over";
  rctx.filter = "none";
  rctx.imageSmoothingEnabled = true;
  rctx.clearRect(0, 0, w, h);

  if (method === "blur") {
    const px = Math.max(2, Math.round((strength / 100) * 40));
    rctx.filter = `blur(${px}px)`;
    rctx.drawImage(video, 0, 0, w, h);
    rctx.filter = "none";
  } else if (method === "pixelate") {
    const block = Math.max(4, Math.round((strength / 100) * 60));
    const dw = Math.max(1, Math.floor(w / block));
    const dh = Math.max(1, Math.floor(h / block));
    const small = scratch.small;
    small.width = dw;
    small.height = dh;
    const sctx = small.getContext("2d")!;
    sctx.imageSmoothingEnabled = false;
    sctx.clearRect(0, 0, dw, dh);
    sctx.drawImage(video, 0, 0, dw, dh);
    rctx.imageSmoothingEnabled = false;
    rctx.drawImage(small, 0, 0, dw, dh, 0, 0, w, h);
    rctx.imageSmoothingEnabled = true;
  } else {
    // clone: cover the region with content sampled from just above it.
    const dy = Math.max(6, Math.round((strength / 100) * h * 0.25));
    rctx.drawImage(video, 0, dy, w, h);
  }

  // Keep the replacement only inside the mask.
  rctx.globalCompositeOperation = "destination-in";
  rctx.drawImage(mask, 0, 0, w, h);
  rctx.globalCompositeOperation = "source-over";
  return rep;
}

/** Draw ONLY the masked replacement (transparent elsewhere) — for a preview overlay. */
export function drawOverlay(
  dest: CanvasRenderingContext2D,
  w: number,
  h: number,
  video: CanvasImageSource,
  mask: CanvasImageSource,
  method: RemovalMethod,
  strength: number,
  scratch: WatermarkScratch
) {
  dest.clearRect(0, 0, w, h);
  const rep = buildMaskedReplacement(scratch, w, h, video, mask, method, strength);
  dest.drawImage(rep, 0, 0, w, h);
}

/** Draw the full frame: video + masked replacement — for the visible canvas and export. */
export function drawProcessedFrame(
  dest: CanvasRenderingContext2D,
  w: number,
  h: number,
  video: CanvasImageSource,
  mask: CanvasImageSource,
  method: RemovalMethod,
  strength: number,
  scratch: WatermarkScratch
) {
  dest.setTransform(1, 0, 0, 1, 0, 0);
  dest.globalCompositeOperation = "source-over";
  dest.filter = "none";
  dest.drawImage(video, 0, 0, w, h);
  const rep = buildMaskedReplacement(scratch, w, h, video, mask, method, strength);
  dest.drawImage(rep, 0, 0, w, h);
}
