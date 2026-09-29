// Shared caption helpers used by both the live preview and the export/burn-in.

import type { CaptionWord } from "./types";

export type CaptionLine = {
  words: CaptionWord[];
  start: number;
  end: number;
};

/** Group words into short caption lines (like TikTok/Reels captions). */
export function groupLines(words: CaptionWord[], perLine: number): CaptionLine[] {
  const lines: CaptionLine[] = [];
  const n = Math.max(1, perLine);
  for (let i = 0; i < words.length; i += n) {
    const slice = words.slice(i, i + n);
    lines.push({
      words: slice,
      start: slice[0].start,
      end: slice[slice.length - 1].end,
    });
  }
  return lines;
}

/**
 * Index of the active word at time t: the word currently being spoken, or the
 * most recently spoken word while in a gap. Returns -1 before the first word.
 */
export function activeWordIndex(words: CaptionWord[], t: number): number {
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    if (t >= words[i].start && t < words[i].end) return i;
    if (t >= words[i].start) idx = i;
    else break;
  }
  return idx;
}

/** For each global word index, which line it belongs to. */
export function wordToLineMap(lines: CaptionLine[]): number[] {
  const map: number[] = [];
  lines.forEach((line, li) => line.words.forEach(() => map.push(li)));
  return map;
}

/** First global word index of a given line. */
export function lineStartIndex(lines: CaptionLine[], lineIdx: number): number {
  let n = 0;
  for (let i = 0; i < lineIdx; i++) n += lines[i].words.length;
  return n;
}

export type CaptionAnim = "none" | "pop" | "bounce";

export type CaptionStyle = {
  /** highlight color for the active word */
  color: string;
  /** words per caption line */
  perLine: number;
  /** font size as a percentage of the video width (matches the preview's cqw) */
  fontPct: number;
  /** resolved CSS font-family string for canvas (e.g. '"Anton", sans-serif') */
  fontFamily: string;
  /** numeric font weight to render at */
  fontWeight: number;
  /** horizontal center of the caption block, 0 (left) – 100 (right) */
  posX: number;
  /** vertical center of the caption block, 0 (top) – 100 (bottom) */
  posY: number;
  /** extra gap between words, in em */
  gapEm: number;
  /** active-word animation */
  anim: CaptionAnim;
};

function easeOutBack(p: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}
function easeOutQuad(p: number): number {
  return 1 - (1 - p) * (1 - p);
}

/** Transform for the active word given time since it became active. */
export function wordAnim(
  anim: CaptionAnim,
  t: number,
  wordStart: number
): { scale: number; dyEm: number } {
  const D = anim === "bounce" ? 0.4 : 0.32;
  const p = Math.min(1, Math.max(0, (t - wordStart) / D));
  if (anim === "pop") return { scale: 1 + 0.15 * easeOutBack(p), dyEm: 0 };
  if (anim === "bounce") return { scale: 1, dyEm: -0.4 * (1 - easeOutQuad(p)) };
  return { scale: 1, dyEm: 0 };
}

/**
 * Draw the caption for time `t` onto a canvas, matching the preview look
 * (bold white uppercase, black outline, active word colored + animated).
 */
export function drawCaptionFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  words: CaptionWord[],
  t: number,
  style: CaptionStyle
) {
  const lines = groupLines(words, style.perLine);
  const active = activeWordIndex(words, t);
  if (active < 0) return;
  const map = wordToLineMap(lines);
  const lineIdx = map[active];
  const line = lines[lineIdx];
  if (!line) return;
  const startIdx = lineStartIndex(lines, lineIdx);

  let fontPx = (style.fontPct / 100) * width;
  const setFont = () => {
    ctx.font = `${style.fontWeight} ${fontPx}px ${style.fontFamily}`;
  };
  setFont();

  const gap = () => ctx.measureText(" ").width + style.gapEm * fontPx;
  const upper = line.words.map((w) => w.text.toUpperCase());
  const measureTotal = () =>
    upper.reduce((sum, txt, i) => {
      const w = ctx.measureText(txt).width;
      return sum + w + (i < upper.length - 1 ? gap() : 0);
    }, 0);

  // Shrink to fit within 92% of the width if a line is too long.
  let total = measureTotal();
  const maxW = width * 0.92;
  if (total > maxW) {
    fontPx *= maxW / total;
    setFont();
    total = measureTotal();
  }

  const y = (style.posY / 100) * height;
  const center = (style.posX / 100) * width;
  const margin = width * 0.02;
  let x =
    total >= width
      ? (width - total) / 2
      : Math.min(Math.max(center - total / 2, margin), width - margin - total);

  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineWidth = fontPx * 0.18;
  ctx.strokeStyle = "#000";

  upper.forEach((txt, i) => {
    const wordW = ctx.measureText(txt).width;
    const isActive = startIdx + i === active;
    if (isActive) {
      const activeStart = line.words[i].start;
      const { scale, dyEm } = wordAnim(style.anim, t, activeStart);
      ctx.save();
      ctx.translate(x + wordW / 2, y + dyEm * fontPx);
      ctx.scale(scale, scale);
      ctx.textAlign = "center";
      ctx.strokeText(txt, 0, 0);
      ctx.fillStyle = style.color;
      ctx.fillText(txt, 0, 0);
      ctx.restore();
      ctx.textAlign = "left";
    } else {
      ctx.strokeText(txt, x, y);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(txt, x, y);
    }
    x += wordW + gap();
  });
}
