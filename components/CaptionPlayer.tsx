"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CaptionWord } from "@/lib/types";
import {
  groupLines,
  wordToLineMap,
  lineStartIndex,
  activeWordIndex,
  drawCaptionFrame,
  type CaptionAnim,
} from "@/lib/captions";

const COLORS = [
  { name: "Yellow", value: "#ffe600" },
  { name: "Purple", value: "#b06bff" },
  { name: "Green", value: "#4ade80" },
  { name: "Pink", value: "#ff5fa2" },
];

const FONTS = [
  { id: "anton", name: "Anton", css: "var(--font-anton)", weight: 400 },
  { id: "bangers", name: "Bangers", css: "var(--font-bangers)", weight: 400 },
  { id: "montserrat", name: "Montserrat", css: "var(--font-montserrat)", weight: 800 },
  { id: "poppins", name: "Poppins", css: "var(--font-poppins)", weight: 800 },
  {
    id: "system",
    name: "System",
    css: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    weight: 800,
  },
] as const;

type FontDef = (typeof FONTS)[number];

const ANIMS: { id: CaptionAnim; name: string }[] = [
  { id: "none", name: "None" },
  { id: "pop", name: "Pop" },
  { id: "bounce", name: "Bounce" },
];

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c))
      return c;
  }
  return "video/webm";
}

/** Resolve a CSS font-family value (which may use a var()) to a concrete stack. */
function resolveFamily(css: string): string {
  const el = document.createElement("span");
  el.style.fontFamily = css;
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  document.body.appendChild(el);
  const resolved = getComputedStyle(el).fontFamily;
  el.remove();
  return resolved || css;
}

export default function CaptionPlayer({
  videoUrl,
  words,
}: {
  videoUrl: string;
  words: CaptionWord[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeWord, setActiveWord] = useState(-1);
  const [color, setColor] = useState(COLORS[0].value);
  const [perLine, setPerLine] = useState(3);
  const [fontSize, setFontSize] = useState(6); // % of player width (cqw)
  const [font, setFont] = useState<FontDef>(FONTS[0]);
  const [posX, setPosX] = useState(50); // 0 left – 100 right
  const [posY, setPosY] = useState(88); // 0 top – 100 bottom
  const [gapEm, setGapEm] = useState(0.25); // extra word spacing
  const [anim, setAnim] = useState<CaptionAnim>("pop");

  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  const lines = useMemo(() => groupLines(words, perLine), [words, perLine]);
  const wordToLine = useMemo(() => wordToLineMap(lines), [lines]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    let last = -2;
    const tick = () => {
      const idx = activeWordIndex(words, video.currentTime);
      if (idx !== last) {
        last = idx;
        setActiveWord(idx);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [words]);

  const activeLine = activeWord >= 0 ? wordToLine[activeWord] : -1;
  const line = activeLine >= 0 ? lines[activeLine] : null;
  const startIdx = activeLine >= 0 ? lineStartIndex(lines, activeLine) : 0;
  const animClass = anim === "pop" ? "cap-pop" : anim === "bounce" ? "cap-bounce" : "";

  async function exportWebm() {
    setExportError(null);
    setExporting(true);
    setExportPct(0);

    const ev = document.createElement("video");
    ev.src = videoUrl;
    ev.crossOrigin = "anonymous";
    ev.muted = false;

    let audioCtx: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    let raf = 0;

    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      if (audioCtx) void audioCtx.close();
      ev.removeAttribute("src");
      ev.load();
    };

    try {
      // Make sure the chosen webfont is ready before we rasterize frames.
      try {
        await document.fonts.ready;
      } catch {
        /* ignore */
      }

      await new Promise<void>((resolve, reject) => {
        ev.onloadedmetadata = () => resolve();
        ev.onerror = () => reject(new Error("Couldn't load the video for export."));
      });

      const canvas = document.createElement("canvas");
      canvas.width = ev.videoWidth;
      canvas.height = ev.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is unavailable.");

      audioCtx = new AudioContext();
      const srcNode = audioCtx.createMediaElementSource(ev);
      const audioDest = audioCtx.createMediaStreamDestination();
      srcNode.connect(audioDest);

      const canvasStream = canvas.captureStream(30);
      const combined = new MediaStream([
        canvasStream.getVideoTracks()[0],
        ...audioDest.stream.getAudioTracks(),
      ]);

      const chunks: BlobPart[] = [];
      recorder = new MediaRecorder(combined, { mimeType: pickMimeType() });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const done = new Promise<void>((resolve) => {
        recorder!.onstop = () => resolve();
      });

      const style = {
        color,
        perLine,
        fontPct: fontSize,
        fontFamily: resolveFamily(font.css),
        fontWeight: font.weight,
        posX,
        posY,
        gapEm,
        anim,
      };
      const duration = ev.duration || 0;

      const draw = () => {
        ctx.drawImage(ev, 0, 0, canvas.width, canvas.height);
        drawCaptionFrame(ctx, canvas.width, canvas.height, words, ev.currentTime, style);
        if (duration > 0) {
          setExportPct(Math.min(99, Math.round((ev.currentTime / duration) * 100)));
        }
        raf = requestAnimationFrame(draw);
      };

      recorder.start();
      ev.currentTime = 0;
      await ev.play();
      draw();

      await new Promise<void>((resolve) => {
        ev.onended = () => resolve();
      });

      cancelAnimationFrame(raf);
      raf = 0;
      recorder.stop();
      await done;

      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "scene2prompt-captioned.webm";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportPct(100);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Export failed. Try a shorter clip."
      );
    } finally {
      cleanup();
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative overflow-hidden rounded-xl bg-black"
        style={{ containerType: "inline-size" as never }}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          className="mx-auto max-h-[70vh] w-full object-contain"
        />
        {line && (
          <div
            className="pointer-events-none absolute flex justify-center"
            style={{
              left: `${posX}%`,
              top: `${posY}%`,
              transform: "translate(-50%, -50%)",
              maxWidth: "92%",
            }}
          >
            <p
              className="whitespace-nowrap text-center uppercase leading-tight tracking-tight"
              style={{
                fontSize: `${fontSize}cqw`,
                fontFamily: font.css,
                fontWeight: font.weight,
                wordSpacing: `${gapEm}em`,
                color: "#ffffff",
                WebkitTextStroke: "0.15em #000",
                paintOrder: "stroke fill",
                textShadow: "0 0.06em 0.12em rgba(0,0,0,0.6)",
              }}
            >
              {line.words.map((w, i) => {
                const isActive = startIdx + i === activeWord;
                return (
                  <span
                    key={i}
                    className={isActive ? animClass : undefined}
                    style={{ color: isActive ? color : undefined }}
                  >
                    {w.text}
                    {i < line.words.length - 1 ? " " : ""}
                  </span>
                );
              })}
            </p>
          </div>
        )}
      </div>

      {/* Style controls */}
      <div className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        {/* Font */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-neutral-400">Font</span>
          {FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFont(f)}
              className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                font.id === f.id
                  ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                  : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              }`}
              style={{ fontFamily: f.css }}
            >
              {f.name}
            </button>
          ))}
        </div>

        {/* Highlight color */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-neutral-400">Highlight color</span>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                aria-label={c.name}
                className={`h-7 w-7 rounded-full border-2 transition-transform ${
                  color === c.value ? "scale-110 border-white" : "border-transparent"
                }`}
                style={{ backgroundColor: c.value }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Custom color"
              className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
          </div>
        </div>

        {/* Animation */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-400">Animation</span>
          {ANIMS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAnim(a.id)}
              className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                anim === a.id
                  ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                  : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>

        {/* Position */}
        <label className="flex items-center gap-3 text-sm text-neutral-400">
          Left ↔ Right
          <input
            type="range"
            min={0}
            max={100}
            value={posX}
            onChange={(e) => setPosX(Number(e.target.value))}
            className="flex-1 accent-neutral-100"
          />
          <span className="w-8 text-right text-neutral-200">{posX}</span>
        </label>

        <label className="flex items-center gap-3 text-sm text-neutral-400">
          Up ↕ Down
          <input
            type="range"
            min={0}
            max={100}
            value={posY}
            onChange={(e) => setPosY(Number(e.target.value))}
            className="flex-1 accent-neutral-100"
          />
          <span className="w-8 text-right text-neutral-200">{posY}</span>
        </label>

        <label className="flex items-center gap-3 text-sm text-neutral-400">
          Word gap
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={gapEm}
            onChange={(e) => setGapEm(Number(e.target.value))}
            className="flex-1 accent-neutral-100"
          />
          <span className="w-10 text-right text-neutral-200">
            {gapEm.toFixed(2)}
          </span>
        </label>

        <label className="flex items-center gap-3 text-sm text-neutral-400">
          Words per line
          <input
            type="range"
            min={1}
            max={5}
            value={perLine}
            onChange={(e) => setPerLine(Number(e.target.value))}
            className="flex-1 accent-neutral-100"
          />
          <span className="w-6 text-right text-neutral-200">{perLine}</span>
        </label>

        <label className="flex items-center gap-3 text-sm text-neutral-400">
          Text size
          <input
            type="range"
            min={3}
            max={12}
            step={0.5}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="flex-1 accent-neutral-100"
          />
          <span className="w-8 text-right text-neutral-200">{fontSize}</span>
        </label>
      </div>

      {/* Export */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={exportWebm}
            disabled={exporting}
            className="rounded-lg bg-neutral-100 px-4 py-2 font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting
              ? `Exporting… ${exportPct}%`
              : "Download video with captions (.webm)"}
          </button>
          {exporting && (
            <span className="text-xs text-neutral-500">
              Records in real time — please keep this tab open.
            </span>
          )}
        </div>
        {exporting && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-neutral-100 transition-all"
              style={{ width: `${exportPct}%` }}
            />
          </div>
        )}
        {exportError && <p className="text-sm text-red-400">{exportError}</p>}
        <p className="text-xs text-neutral-500">
          The download bakes the captions into the video. Output is .webm — plays
          on TikTok, Reels, and YouTube.
        </p>
      </div>
    </div>
  );
}
