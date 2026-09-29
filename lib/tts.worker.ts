// Web Worker: turns a text script into speech in the browser via Kokoro TTS
// (kokoro-js, runs on transformers.js / onnxruntime-web). No API key; the model
// downloads from the Hugging Face CDN on first use, then is cached.
//
// Speed: uses WebGPU when the browser exposes it (much faster), falling back to
// WASM/CPU. A "warm" message lets the UI preload the model in the background so
// the first "Hear this voice" isn't waiting on the download.

import { KokoroTTS } from "kokoro-js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";

// The worker's global scope. Typed loosely to avoid DOM/worker lib clashes.
const ctx = self as unknown as {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  addEventListener: (type: "message", cb: (e: MessageEvent) => void) => void;
  navigator?: { gpu?: unknown };
};

type SpeakMessage = {
  type: "speak";
  text: string;
  voice: string;
  kind: string;
  speed?: number;
};
type WarmMessage = { type: "warm" };
type InMessage = SpeakMessage | WarmMessage;

type Tts = {
  generate: (
    text: string,
    opts: { voice: string; speed?: number }
  ) => Promise<{ audio: Float32Array; sampling_rate: number }>;
};

let ttsPromise: Promise<Tts> | null = null;

function getTts(): Promise<Tts> {
  if (!ttsPromise) {
    const hasGpu = !!ctx.navigator?.gpu;
    // Try the fastest backend first, then fall back.
    const attempts: { device: string; dtype: string }[] = hasGpu
      ? [
          { device: "webgpu", dtype: "fp32" },
          { device: "wasm", dtype: "q8" },
        ]
      : [{ device: "wasm", dtype: "q8" }];

    ttsPromise = (async () => {
      let lastErr: unknown;
      for (const a of attempts) {
        try {
          return (await KokoroTTS.from_pretrained(MODEL, {
            dtype: a.dtype,
            device: a.device,
            progress_callback: (p: unknown) => {
              ctx.postMessage({ type: "model-progress", data: p });
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)) as unknown as Tts;
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr;
    })();
  }
  return ttsPromise;
}

// Split a long script into sentence-ish chunks under a character budget so each
// stays within the model's length limit; keeps punctuation for natural pacing.
function chunkText(text: string, maxChars = 300): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  const chunks: string[] = [];
  let cur = "";
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if (piece.length > maxChars) {
      if (cur) {
        chunks.push(cur.trim());
        cur = "";
      }
      const parts = piece.match(new RegExp(`.{1,${maxChars}}(\\s|$)`, "g")) ?? [
        piece,
      ];
      for (const part of parts) chunks.push(part.trim());
      continue;
    }
    if ((cur + " " + piece).trim().length > maxChars) {
      if (cur) chunks.push(cur.trim());
      cur = piece;
    } else {
      cur = (cur ? cur + " " : "") + piece;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

function concat(chunks: Float32Array[], gap: number): Float32Array {
  const total =
    chunks.reduce((n, c) => n + c.length, 0) + gap * Math.max(0, chunks.length - 1);
  const out = new Float32Array(total);
  let offset = 0;
  chunks.forEach((c, i) => {
    out.set(c, offset);
    offset += c.length;
    if (i < chunks.length - 1) offset += gap;
  });
  return out;
}

ctx.addEventListener("message", async (e: MessageEvent) => {
  const msg = e.data as InMessage;

  if (msg?.type === "warm") {
    try {
      await getTts();
      ctx.postMessage({ type: "model-ready" });
    } catch (err) {
      ctx.postMessage({
        type: "error",
        kind: "warm",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (msg?.type !== "speak") return;
  const kind = msg.kind;

  try {
    ctx.postMessage({ type: "status", kind, phase: "loading-model" });
    const tts = await getTts();
    ctx.postMessage({ type: "model-ready" });

    const parts = chunkText(msg.text);
    if (parts.length === 0) {
      ctx.postMessage({ type: "error", kind, message: "The script is empty." });
      return;
    }

    ctx.postMessage({ type: "status", kind, phase: "synthesizing" });
    const audioChunks: Float32Array[] = [];
    let sampleRate = 24000;
    const speed = Math.min(2, Math.max(0.5, msg.speed ?? 1));

    for (let i = 0; i < parts.length; i++) {
      const out = await tts.generate(parts[i], { voice: msg.voice, speed });
      audioChunks.push(out.audio);
      sampleRate = out.sampling_rate || sampleRate;
      ctx.postMessage({
        type: "chunk-progress",
        kind,
        done: i + 1,
        total: parts.length,
      });
    }

    const gap = Math.round(0.25 * sampleRate);
    const pcm = concat(audioChunks, gap);

    ctx.postMessage({ type: "done", kind, voice: msg.voice, pcm, sampleRate }, [
      pcm.buffer,
    ]);
  } catch (err) {
    ctx.postMessage({
      type: "error",
      kind,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
