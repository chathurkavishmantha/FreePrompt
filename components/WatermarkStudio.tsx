"use client";

import { useEffect, useRef, useState } from "react";
import {
  drawProcessedFrame,
  makeScratch,
  type RemovalMethod,
  type WatermarkScratch,
} from "@/lib/watermark";

const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // 300 MB

type DrawMode = "rect" | "brush" | "erase";

const METHODS: { id: RemovalMethod; name: string }[] = [
  { id: "blur", name: "Blur" },
  { id: "pixelate", name: "Pixelate" },
  { id: "clone", name: "Clone nearby" },
];

const MODES: { id: DrawMode; name: string }[] = [
  { id: "rect", name: "Box" },
  { id: "brush", name: "Brush" },
  { id: "erase", name: "Erase" },
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

function fmt(t: number): string {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function WatermarkStudio() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<DrawMode>("rect");
  const [method, setMethod] = useState<RemovalMethod>("blur");
  const [strength, setStrength] = useState(60);
  const [brushSize, setBrushSize] = useState(48);
  const [hasMask, setHasMask] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const scratchRef = useRef<WatermarkScratch | null>(null);

  // Latest control values for the render loop to read without restarting it.
  const cfg = useRef({ method, strength });
  cfg.current = { method, strength };

  // Interaction state (refs so pointer handlers see current values).
  const drag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const painting = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const brushRef = useRef(brushSize);
  brushRef.current = brushSize;

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setError("Please choose a video file (MP4, MOV, or WEBM).");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError("That video is over 300 MB — please use a smaller clip.");
      return;
    }
    setError(null);
    setReady(false);
    setHasMask(false);
    drag.current = null;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
  }

  function onLoadedMetadata() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;

    const mask = document.createElement("canvas");
    mask.width = w;
    mask.height = h;
    maskRef.current = mask;
    scratchRef.current = makeScratch();

    setDuration(video.duration);
    setReady(true);
  }

  // Render loop: draw the processed frame and any in-progress box outline.
  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const mask = maskRef.current;
    const scratch = scratchRef.current;
    if (!video || !canvas || !mask || !scratch) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastT = -1;
    const tick = () => {
      drawProcessedFrame(
        ctx,
        canvas.width,
        canvas.height,
        video,
        mask,
        cfg.current.method,
        cfg.current.strength,
        scratch
      );
      const d = drag.current;
      if (d) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = Math.max(2, canvas.width * 0.003);
        ctx.setLineDash([canvas.width * 0.012, canvas.width * 0.012]);
        ctx.strokeRect(d.x, d.y, d.w, d.h);
        ctx.setLineDash([]);
      }
      const t = video.currentTime;
      if (Math.abs(t - lastT) > 0.05) {
        lastT = t;
        setCurrent(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  function toCanvas(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    };
  }

  function paintDot(x: number, y: number, erase: boolean) {
    const mask = maskRef.current;
    if (!mask) return;
    const mctx = mask.getContext("2d")!;
    mctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    mctx.fillStyle = "#fff";
    mctx.beginPath();
    mctx.arc(x, y, brushRef.current / 2, 0, Math.PI * 2);
    mctx.fill();
    mctx.globalCompositeOperation = "source-over";
    setHasMask(true);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    if (modeRef.current === "rect") {
      drag.current = { x: p.x, y: p.y, w: 0, h: 0 };
    } else {
      painting.current = true;
      paintDot(p.x, p.y, modeRef.current === "erase");
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready) return;
    const p = toCanvas(e);
    if (modeRef.current === "rect" && drag.current) {
      const s = drag.current;
      drag.current = { x: s.x, y: s.y, w: p.x - s.x, h: p.y - s.y };
    } else if (painting.current) {
      paintDot(p.x, p.y, modeRef.current === "erase");
    }
  }

  function onPointerUp() {
    if (modeRef.current === "rect" && drag.current) {
      const d = drag.current;
      const x = Math.min(d.x, d.x + d.w);
      const y = Math.min(d.y, d.y + d.h);
      const w = Math.abs(d.w);
      const h = Math.abs(d.h);
      if (w > 3 && h > 3) {
        const mask = maskRef.current!;
        const mctx = mask.getContext("2d")!;
        mctx.fillStyle = "#fff";
        mctx.fillRect(x, y, w, h);
        setHasMask(true);
      }
      drag.current = null;
    }
    painting.current = false;
  }

  function clearMask() {
    const mask = maskRef.current;
    if (!mask) return;
    mask.getContext("2d")!.clearRect(0, 0, mask.width, mask.height);
    drag.current = null;
    setHasMask(false);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (v) v.currentTime = t;
    setCurrent(t);
  }

  async function exportWebm() {
    const video = videoRef.current;
    const mask = maskRef.current;
    if (!video || !mask) return;
    setExportError(null);
    setExporting(true);
    setExportPct(0);
    video.pause();
    setPlaying(false);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    const scratch = makeScratch();

    let audioCtx: AudioContext | null = null;
    let raf = 0;
    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      if (audioCtx) void audioCtx.close();
    };

    try {
      audioCtx = new AudioContext();
      const srcNode = audioCtx.createMediaElementSource(video);
      const audioDest = audioCtx.createMediaStreamDestination();
      srcNode.connect(audioDest);

      const stream = canvas.captureStream(30);
      const combined = new MediaStream([
        stream.getVideoTracks()[0],
        ...audioDest.stream.getAudioTracks(),
      ]);

      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(combined, { mimeType: pickMimeType() });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const done = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      const dur = video.duration || 0;
      const draw = () => {
        drawProcessedFrame(
          ctx,
          canvas.width,
          canvas.height,
          video,
          mask,
          cfg.current.method,
          cfg.current.strength,
          scratch
        );
        if (dur > 0)
          setExportPct(Math.min(99, Math.round((video.currentTime / dur) * 100)));
        raf = requestAnimationFrame(draw);
      };

      recorder.start();
      video.currentTime = 0;
      await video.play();
      draw();

      await new Promise<void>((resolve) => {
        video.onended = () => resolve();
      });

      cancelAnimationFrame(raf);
      raf = 0;
      recorder.stop();
      await done;
      video.onended = null;

      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "scene2prompt-clean.webm";
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
    <section className="flex flex-col gap-6">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-400">
        Hide a watermark or logo (CapCut, TikTok, Dola, etc.). Pick a video, then{" "}
        <strong className="text-neutral-200">draw a box or brush</strong> over the
        watermark and choose how to cover it. Everything runs{" "}
        <strong className="text-neutral-200">free in your browser</strong>. This
        obscures the spot (blur / pixelate / clone) rather than perfectly
        reconstructing what&apos;s behind it. For a watermark that moves between
        corners, cover each spot.
      </div>

      <div>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={exporting}
          className="rounded-lg bg-neutral-100 px-4 py-2 font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {videoUrl ? "Choose a different video" : "Choose a video"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Hidden source video. */}
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          className="hidden"
          playsInline
          onLoadedMetadata={onLoadedMetadata}
          onEnded={() => setPlaying(false)}
        />
      )}

      {videoUrl && ready && (
        <div className="flex flex-col gap-4">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="mx-auto max-h-[70vh] w-full cursor-crosshair touch-none rounded-xl bg-black"
          />

          {/* Playback */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <span className="w-10 text-right text-xs tabular-nums text-neutral-400">
              {fmt(current)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.05}
              value={current}
              onChange={(e) => seek(Number(e.target.value))}
              className="flex-1 accent-neutral-100"
            />
            <span className="w-10 text-xs tabular-nums text-neutral-400">
              {fmt(duration)}
            </span>
          </div>

          {/* Tools */}
          <div className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm text-neutral-400">Tool</span>
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                    mode === m.id
                      ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                      : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  {m.name}
                </button>
              ))}
              <button
                type="button"
                onClick={clearMask}
                disabled={!hasMask}
                className="ml-auto rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-40"
              >
                Clear
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm text-neutral-400">Cover with</span>
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                    method === m.id
                      ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                      : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-3 text-sm text-neutral-400">
              Strength
              <input
                type="range"
                min={10}
                max={100}
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
                className="flex-1 accent-neutral-100"
              />
              <span className="w-8 text-right text-neutral-200">{strength}</span>
            </label>

            {mode !== "rect" && (
              <label className="flex items-center gap-3 text-sm text-neutral-400">
                Brush size
                <input
                  type="range"
                  min={10}
                  max={200}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="flex-1 accent-neutral-100"
                />
                <span className="w-10 text-right text-neutral-200">
                  {brushSize}
                </span>
              </label>
            )}
          </div>

          {/* Export */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={exportWebm}
                disabled={exporting || !hasMask}
                className="rounded-lg bg-neutral-100 px-4 py-2 font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exporting
                  ? `Exporting… ${exportPct}%`
                  : "Download cleaned video (.webm)"}
              </button>
              {exporting && (
                <span className="text-xs text-neutral-500">
                  Records in real time — please keep this tab open.
                </span>
              )}
              {!hasMask && !exporting && (
                <span className="text-xs text-neutral-500">
                  Draw over the watermark first.
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
          </div>
        </div>
      )}
    </section>
  );
}
