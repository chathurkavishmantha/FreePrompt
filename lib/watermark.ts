// Browser-only helpers to obscure a masked region of a video frame
// (blur / pixelate / clone-nearby) — for hiding watermarks/logos.
//
// True "reconstruct what's behind it" removal needs generative inpainting,
// which can't run cheaply in-browser. Instead we cover the region and — for the
// best result — CLONE clean pixels sampled from a nearby direction and FEATHER
// the mask edges so the patch blends seamlessly.

export type RemovalMethod = "blur" | "pixelate" | "clone";

export type RemovalOptions = {
  method: RemovalMethod;
  strength: number;
  // Clone sampling offset as a fraction of frame size (-1..1). Negative x =
  // sample from the left, positive y = sample from below, etc.
  offsetX: number;
  offsetY: number;
  // Feather radius in px — soft mask edges so the patch blends in.
  feather: number;
};

export type WatermarkScratch = {
  rep: HTMLCanvasElement;
  small: HTMLCanvasElement;
  feathered: HTMLCanvasElement;
};

export function makeScratch(): WatermarkScratch {
  return {
    rep: document.createElement("canvas"),
    small: document.createElement("canvas"),
    feathered: document.createElement("canvas"),
  };
}

function sizeTo(c: HTMLCanvasElement, w: number, h: number) {
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
}

/**
 * Build a feathered version of the mask: same white shape, but with soft
 * (blurred) alpha edges so the replacement fades into the surrounding frame
 * instead of showing a hard rectangular seam.
 */
function buildFeatheredMask(
  scratch: WatermarkScratch,
  w: number,
  h: number,
  mask: CanvasImageSource,
  feather: number
): HTMLCanvasElement {
  const fm = scratch.feathered;
  sizeTo(fm, w, h);
  const fctx = fm.getContext("2d")!;
  fctx.setTransform(1, 0, 0, 1, 0, 0);
  fctx.globalCompositeOperation = "source-over";
  fctx.clearRect(0, 0, w, h);
  fctx.filter = feather > 0.5 ? `blur(${Math.round(feather)}px)` : "none";
  fctx.drawImage(mask, 0, 0, w, h);
  fctx.filter = "none";
  return fm;
}

/**
 * Build a canvas holding the "replacement" pixels, cropped to the (feathered)
 * mask (opaque where the watermark should be covered, transparent elsewhere).
 */
function buildMaskedReplacement(
  scratch: WatermarkScratch,
  w: number,
  h: number,
  video: CanvasImageSource,
  mask: CanvasImageSource,
  opts: RemovalOptions
): HTMLCanvasElement {
  const { method, strength } = opts;
  const rep = scratch.rep;
  sizeTo(rep, w, h);
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
    // clone: cover the region with pixels sampled from a nearby direction.
    // Default offset (if none set) samples from just above, like before.
    const dx = Math.round(opts.offsetX * w);
    const dy = Math.round(opts.offsetY * h) || (opts.offsetX === 0 ? Math.max(6, Math.round((strength / 100) * h * 0.25)) : 0);
    rctx.drawImage(video, dx, dy, w, h);
  }

  // Keep the replacement only inside the (feathered) mask.
  const fm = buildFeatheredMask(scratch, w, h, mask, opts.feather);
  rctx.globalCompositeOperation = "destination-in";
  rctx.drawImage(fm, 0, 0, w, h);
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
  opts: RemovalOptions,
  scratch: WatermarkScratch
) {
  dest.clearRect(0, 0, w, h);
  const rep = buildMaskedReplacement(scratch, w, h, video, mask, opts);
  dest.drawImage(rep, 0, 0, w, h);
}

/** Draw the full frame: video + masked replacement — for the visible canvas and export. */
export function drawProcessedFrame(
  dest: CanvasRenderingContext2D,
  w: number,
  h: number,
  video: CanvasImageSource,
  mask: CanvasImageSource,
  opts: RemovalOptions,
  scratch: WatermarkScratch
) {
  dest.setTransform(1, 0, 0, 1, 0, 0);
  dest.globalCompositeOperation = "source-over";
  dest.filter = "none";
  dest.drawImage(video, 0, 0, w, h);
  const rep = buildMaskedReplacement(scratch, w, h, video, mask, opts);
  dest.drawImage(rep, 0, 0, w, h);
}
