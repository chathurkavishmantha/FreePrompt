"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractAudio } from "@/lib/extractAudio";
import CaptionPlayer from "@/components/CaptionPlayer";
import type { CaptionWord } from "@/lib/types";

const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // 300 MB

type Phase = "idle" | "loading-model" | "transcribing";

type ModelProgress = {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

export default function CaptionStudio() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [words, setWords] = useState<CaptionWord[] | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Spin up the Whisper worker once, lazily.
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("../lib/whisper.worker.ts", import.meta.url)
      );
    }
    return workerRef.current;
  }, []);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Revoke the previous object URL when it changes / unmounts.
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  async function handleFile(file: File | undefined) {
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
    setWords(null);
    setProgress(0);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));

    let pcm: Float32Array;
    try {
      setPhase("loading-model");
      const audio = await extractAudio(file);
      pcm = audio.pcm;
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Couldn't read the audio.");
      return;
    }

    const worker = getWorker();

    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (data.type === "model-progress") {
        const p = data.data as ModelProgress;
        if (typeof p.progress === "number") setProgress(Math.round(p.progress));
      } else if (data.type === "status" && data.data === "transcribing") {
        setPhase("transcribing");
        setProgress(0);
      } else if (data.type === "done") {
        setPhase("idle");
        setWords(data.words as CaptionWord[]);
        worker.removeEventListener("message", onMessage);
      } else if (data.type === "error") {
        setPhase("idle");
        setError(
          `Transcription failed: ${data.message}. If this is the first run, check your internet connection — the model downloads once.`
        );
        worker.removeEventListener("message", onMessage);
      }
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({ type: "transcribe", pcm }, [pcm.buffer]);
  }

  const busy = phase !== "idle";

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-400">
        Add animated word-by-word captions to a video that already has a
        voice-over. Transcription runs <strong className="text-neutral-200">free in your
        browser</strong> — the first run downloads a small speech model (~tens of
        MB), then it&apos;s cached. Timing is approximate; you can preview and
        tweak the look below.
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
          disabled={busy}
          className="rounded-lg bg-neutral-100 px-4 py-2 font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {videoUrl ? "Choose a different video" : "Choose a video"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {busy && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-300">
            {phase === "loading-model"
              ? progress > 0
                ? `Downloading speech model… ${progress}%`
                : "Loading speech model…"
              : "Transcribing the voice-over… (this can take a bit)"}
          </p>
          {phase === "loading-model" && progress > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-neutral-100 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {videoUrl && words && words.length > 0 && (
        <CaptionPlayer videoUrl={videoUrl} words={words} />
      )}

      {videoUrl && words && words.length === 0 && !busy && (
        <p className="text-sm text-neutral-400">
          No speech was detected in this video&apos;s audio.
        </p>
      )}
    </section>
  );
}
