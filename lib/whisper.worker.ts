// Web Worker: runs Whisper in the browser via transformers.js to get
// word-level timestamps. No API key; the model downloads from the Hugging
// Face CDN on first use, then is cached by the browser.

import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

// whisper-base.en balances accuracy and download size for English voice-overs.
// Swap for "Xenova/whisper-tiny.en" (smaller/faster) or a multilingual model.
const MODEL = "Xenova/whisper-base.en";

// The worker's global scope. Typed loosely to avoid DOM/worker lib clashes.
const ctx = self as unknown as {
  postMessage: (message: unknown) => void;
  addEventListener: (type: "message", cb: (e: MessageEvent) => void) => void;
};

type InMessage = { type: "transcribe"; pcm: Float32Array };

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;

async function getTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (transcriber) return transcriber;
  transcriber = (await pipeline("automatic-speech-recognition", MODEL, {
    progress_callback: (p: unknown) => {
      ctx.postMessage({ type: "model-progress", data: p });
    },
  })) as AutomaticSpeechRecognitionPipeline;
  return transcriber;
}

ctx.addEventListener("message", async (e: MessageEvent) => {
  const msg = e.data as InMessage;
  if (msg?.type !== "transcribe") return;

  try {
    const asr = await getTranscriber();
    ctx.postMessage({ type: "status", data: "transcribing" });

    const output = await asr(msg.pcm, {
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const single = Array.isArray(output) ? output[0] : output;
    const chunks =
      (single as { chunks?: Array<{ text?: string; timestamp?: [number, number] }> })
        .chunks ?? [];

    const words = chunks
      .map((c) => ({
        text: (c.text ?? "").trim(),
        start: c.timestamp?.[0] ?? 0,
        end: c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0,
      }))
      .filter((w) => w.text.length > 0);

    ctx.postMessage({ type: "done", words });
  } catch (err) {
    ctx.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
