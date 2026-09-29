"use client";

import { useEffect, useRef, useState } from "react";
import { encodeWav } from "@/lib/wav";
import { detectVoicePreset, type PitchMatch } from "@/lib/detectPitch";
import {
  MOODS,
  buildVoiceFx,
  buildAmbience,
  type MoodId,
  type VoiceFx,
  type Ambience,
} from "@/lib/moods";

const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // 300 MB

// Curated Kokoro voices with friendly labels. `id` is the kokoro-js voice name.
const VOICES: { id: string; name: string }[] = [
  { id: "af_heart", name: "Aria · US female · warm" },
  { id: "af_bella", name: "Bella · US female · expressive" },
  { id: "af_nicole", name: "Nicole · US female · soft" },
  { id: "am_michael", name: "Michael · US male · warm" },
  { id: "am_fenrir", name: "Fenrir · US male · deep" },
  { id: "am_puck", name: "Puck · US male · bright" },
  { id: "bf_emma", name: "Emma · UK female" },
  { id: "bm_george", name: "George · UK male" },
];
const DEFAULT_VOICE = "af_heart";

function presetName(id: string): string {
  return VOICES.find((v) => v.id === id)?.name ?? id;
}

type Phase = "idle" | "loading-model" | "synthesizing" | "ready";
type Job = {
  text: string;
  voice: string;
  kind: "full" | "preview";
  key: string;
  speed: number;
};

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

// The short snippet used for auditioning a voice.
function sampleFrom(script: string): string {
  const src = script.trim();
  if (!src) return "This is a preview of the selected voice.";
  let s = src.slice(0, 90);
  if (src.length > 90) s = s.replace(/\s+\S*$/, "") + "…";
  return s;
}

export default function VoiceStudio() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [speed, setSpeed] = useState(1);
  const [mood, setMood] = useState<MoodId>("none");
  const [ambVol, setAmbVol] = useState(40);

  const [phase, setPhase] = useState<Phase>("idle");
  const [modelPct, setModelPct] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [chunk, setChunk] = useState<{ done: number; total: number } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [staleVoice, setStaleVoice] = useState(false);

  const [origVol, setOrigVol] = useState(35); // "mix over original" default
  const [voiceVol, setVoiceVol] = useState(100);
  const [holdMode, setHoldMode] = useState<"freeze" | "loop">("freeze");

  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [detected, setDetected] = useState<PitchMatch | null>(null);
  const [detecting, setDetecting] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  const [previewing, setPreviewing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const voiceElRef = useRef<HTMLAudioElement>(null);
  const previewElRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sampleInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  // Web Audio graph (built once) for mixing during playback + export.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const voiceSrcRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gOrigRef = useRef<GainNode | null>(null);
  const gVoiceRef = useRef<GainNode | null>(null);
  const gAmbRef = useRef<GainNode | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const voiceFxRef = useRef<VoiceFx | null>(null);
  const ambienceRef = useRef<Ambience | null>(null);
  const graphBuilt = useRef(false);
  // Separate graph for auditioning (routes the preview element through the
  // mood fx so "Hear this voice" reflects the chosen tone + speed + mood).
  const previewSrcRef = useRef<MediaElementAudioSourceNode | null>(null);
  const previewFxRef = useRef<VoiceFx | null>(null);
  const previewGraphBuilt = useRef(false);

  // Job queue so previews and full jobs never collide on the single worker.
  const queueRef = useRef<Job[]>([]);
  const inFlightRef = useRef<Job | null>(null);
  // Cache of auditioned snippets, keyed by voice+speed+snippet, so re-hearing a
  // voice (or flipping back to one) is instant.
  const previewCacheRef = useRef<Map<string, string>>(new Map());

  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const prevVoiceRef = useRef(voice);
  const prevMoodRef = useRef(mood);
  const resumeRef = useRef<{ wasPlaying: boolean; pos: number } | null>(null);

  // Latest-closure dispatcher for worker messages (stable onmessage → this ref).
  const handlerRef = useRef<(m: MsgIn) => void>(() => {});

  type MsgIn = {
    type: string;
    kind?: string;
    phase?: Phase;
    data?: { status?: string; progress?: number };
    done?: number;
    total?: number;
    voice?: string;
    pcm?: Float32Array;
    sampleRate?: number;
    message?: string;
  };

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    return audioCtxRef.current;
  }

  function getWorker(): Worker {
    if (!workerRef.current) {
      const w = new Worker(new URL("../lib/tts.worker.ts", import.meta.url));
      w.onmessage = (e: MessageEvent) => handlerRef.current(e.data as MsgIn);
      workerRef.current = w;
    }
    return workerRef.current;
  }

  function pump() {
    if (inFlightRef.current) return;
    const job = queueRef.current.shift();
    if (!job) return;
    inFlightRef.current = job;
    getWorker().postMessage({
      type: "speak",
      text: job.text,
      voice: job.voice,
      kind: job.kind,
      speed: job.speed,
    });
  }

  function enqueue(job: Job) {
    if (job.kind === "preview") {
      // Only the most recent audition matters.
      queueRef.current = queueRef.current.filter((j) => j.kind !== "preview");
    }
    queueRef.current.push(job);
    pump();
  }

  // --- Mood routing -------------------------------------------------------

  function applyMoodMain() {
    const ctx = audioCtxRef.current;
    const voiceSrc = voiceSrcRef.current;
    const gVoice = gVoiceRef.current;
    const gAmb = gAmbRef.current;
    if (!ctx || !voiceSrc || !gVoice || !gAmb) return;
    voiceSrc.disconnect();
    voiceFxRef.current?.output.disconnect();
    const fx = buildVoiceFx(ctx, mood);
    voiceSrc.connect(fx.input);
    fx.output.connect(gVoice);
    voiceFxRef.current = fx;
    ambienceRef.current?.dispose();
    const amb = buildAmbience(ctx, mood);
    if (amb) amb.output.connect(gAmb);
    ambienceRef.current = amb;
  }

  function applyMoodPreview() {
    const ctx = audioCtxRef.current;
    const src = previewSrcRef.current;
    if (!ctx || !src) return;
    src.disconnect();
    previewFxRef.current?.output.disconnect();
    const fx = buildVoiceFx(ctx, mood);
    src.connect(fx.input);
    fx.output.connect(ctx.destination);
    previewFxRef.current = fx;
  }

  async function ensurePreviewReady() {
    const el = previewElRef.current;
    if (!el) return;
    const ctx = getAudioCtx();
    if (!previewGraphBuilt.current) {
      previewSrcRef.current = ctx.createMediaElementSource(el);
      previewGraphBuilt.current = true;
      applyMoodPreview();
    }
    await ctx.resume();
  }

  async function playPreviewUrl(url: string) {
    await ensurePreviewReady();
    const el = previewElRef.current;
    if (el) {
      el.src = url;
      el.currentTime = 0;
      try {
        await el.play();
      } catch {}
    }
  }

  function auditionVoice(v: string) {
    previewElRef.current?.pause();
    const sample = sampleFrom(script);
    const key = `${v}|${speed}|${sample}`;
    const cached = previewCacheRef.current.get(key);
    if (cached) {
      void playPreviewUrl(cached);
      return;
    }
    setGenError(null);
    setPreviewing(true);
    enqueue({ text: sample, voice: v, kind: "preview", key, speed });
  }

  function generate() {
    const text = script.trim();
    if (!text) {
      setGenError("Please paste your voice-over script first.");
      return;
    }
    setGenError(null);
    setChunk(null);
    setStaleVoice(false);
    if (playing) {
      resumeRef.current = { wasPlaying: true, pos: current };
      videoRef.current?.pause();
      voiceElRef.current?.pause();
      setPlaying(false);
    }
    setPhase("loading-model");
    enqueue({ text, voice, kind: "full", key: "full", speed });
  }

  // Keep the worker message handler pointed at the latest state/functions.
  handlerRef.current = (m: MsgIn) => {
    switch (m.type) {
      case "model-progress": {
        const p = m.data;
        if (p?.status === "progress" && typeof p.progress === "number") {
          const pct = Math.round(p.progress);
          setModelPct((prev) => Math.max(prev, pct));
        }
        break;
      }
      case "model-ready":
        setModelReady(true);
        setModelPct(100);
        break;
      case "status":
        if (m.kind === "full" && m.phase) setPhase(m.phase);
        break;
      case "chunk-progress":
        if (m.kind === "full")
          setChunk({ done: m.done ?? 0, total: m.total ?? 0 });
        break;
      case "done": {
        const job = inFlightRef.current;
        inFlightRef.current = null;
        const pcm = m.pcm as Float32Array;
        const sr = m.sampleRate as number;
        const blob = encodeWav(pcm, sr);
        const url = URL.createObjectURL(blob);
        if (m.kind === "full") {
          setVoiceUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setVoiceDuration(pcm.length / sr);
          setPhase("ready");
          const r = resumeRef.current;
          if (r) {
            resumeRef.current = null;
            setTimeout(() => {
              seek(r.pos);
              if (r.wasPlaying) void togglePlay();
            }, 60);
          }
        } else {
          if (job) previewCacheRef.current.set(job.key, url);
          if ((m.voice ?? job?.voice) === voiceRef.current)
            void playPreviewUrl(url);
          setPreviewing(false);
        }
        pump();
        break;
      }
      case "error": {
        inFlightRef.current = null;
        setGenError(m.message ?? "Voice generation failed.");
        if (m.kind === "full") setPhase("idle");
        else setPreviewing(false);
        pump();
        break;
      }
    }
  };

  // Warm the model up in the background on mount so the first audition is quick.
  useEffect(() => {
    getWorker().postMessage({ type: "warm" });
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      ambienceRef.current?.dispose();
      if (audioCtxRef.current) void audioCtxRef.current.close();
      for (const u of previewCacheRef.current.values()) URL.revokeObjectURL(u);
      previewCacheRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);
  useEffect(() => {
    return () => {
      if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    };
  }, [voiceUrl]);
  useEffect(() => {
    return () => {
      if (sampleUrl) URL.revokeObjectURL(sampleUrl);
    };
  }, [sampleUrl]);

  // Playhead follows whichever track is longer (keeps moving after a short
  // video freezes on its last frame).
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const ve = voiceElRef.current;
      const master = voiceUrl && voiceDuration > duration && ve ? ve : v;
      if (master) setCurrent(master.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, voiceUrl, voiceDuration, duration]);

  // Changing the voice auditions it immediately; the full narration (if any)
  // is marked stale so the user can Regenerate to apply the new tone.
  useEffect(() => {
    if (prevVoiceRef.current === voice) return;
    prevVoiceRef.current = voice;
    auditionVoice(voice);
    if (voiceUrl) setStaleVoice(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice]);

  // Mood is a live effect (no re-synthesis): re-route both graphs. Audition it
  // if we're not already playing (during playback it just takes effect live).
  useEffect(() => {
    if (graphBuilt.current) applyMoodMain();
    if (previewGraphBuilt.current) applyMoodPreview();
    if (prevMoodRef.current !== mood) {
      prevMoodRef.current = mood;
      if (videoReady && !playing) auditionVoice(voice);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);

  // Speed is baked into the audio at synthesis time → the full narration must be
  // regenerated to apply it.
  useEffect(() => {
    if (voiceUrl) setStaleVoice(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  // Keep gains in sync with the sliders.
  useEffect(() => {
    if (gOrigRef.current) gOrigRef.current.gain.value = origVol / 100;
  }, [origVol]);
  useEffect(() => {
    if (gVoiceRef.current) gVoiceRef.current.gain.value = voiceVol / 100;
  }, [voiceVol]);
  // Gate the ambience bed: audible only while playing a mood.
  useEffect(() => {
    if (gAmbRef.current)
      gAmbRef.current.gain.value =
        playing && mood !== "none" ? ambVol / 100 : 0;
  }, [playing, mood, ambVol]);

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
    setVideoReady(false);
    graphBuilt.current = false;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
  }

  function onLoadedMetadata() {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    setVideoReady(true);
  }

  async function handleSampleFile(file: File | undefined) {
    if (!file) return;
    const ok =
      file.type.startsWith("audio/") ||
      file.type === "" ||
      file.type.includes("mpeg") ||
      /\.(mp3|wav|m4a|ogg|aac|flac|mpeg|mpg|mpga|opus|webm)$/i.test(file.name);
    if (!ok) {
      setGenError(
        "Please choose an audio clip (MP3, WAV, M4A, MPEG…) of your voice."
      );
      return;
    }
    setGenError(null);
    if (sampleUrl) URL.revokeObjectURL(sampleUrl);
    setSampleUrl(URL.createObjectURL(file));
    setDetected(null);
    setDetecting(true);
    try {
      const match = await detectVoicePreset(file);
      setDetected(match);
      setVoice(match.preset); // auto-select the matched tone (auditions it)
    } catch {
      setGenError(
        "Couldn't analyze that clip's pitch — you can still compare by ear."
      );
    } finally {
      setDetecting(false);
    }
  }

  function buildGraph() {
    if (graphBuilt.current) return;
    const video = videoRef.current;
    const voiceEl = voiceElRef.current;
    if (!video || !voiceEl) return;
    const ctx = getAudioCtx();
    const videoSrc = ctx.createMediaElementSource(video);
    const voiceSrc = ctx.createMediaElementSource(voiceEl);
    voiceSrcRef.current = voiceSrc;
    const gOrig = ctx.createGain();
    const gVoice = ctx.createGain();
    const gAmb = ctx.createGain();
    gOrig.gain.value = origVol / 100;
    gVoice.gain.value = voiceVol / 100;
    gAmb.gain.value = 0;
    const mixDest = ctx.createMediaStreamDestination();
    videoSrc.connect(gOrig);
    gOrig.connect(ctx.destination);
    gOrig.connect(mixDest);
    gVoice.connect(ctx.destination);
    gVoice.connect(mixDest);
    gAmb.connect(ctx.destination);
    gAmb.connect(mixDest);
    gOrigRef.current = gOrig;
    gVoiceRef.current = gVoice;
    gAmbRef.current = gAmb;
    mixDestRef.current = mixDest;
    graphBuilt.current = true;
    applyMoodMain();
  }

  async function togglePlay() {
    const video = videoRef.current;
    const voiceEl = voiceElRef.current;
    if (!video) return;

    if (playing) {
      video.pause();
      voiceEl?.pause();
      setPlaying(false);
      return;
    }

    if (voiceUrl) {
      buildGraph();
      await audioCtxRef.current?.resume();
    }
    const total = Math.max(duration, voiceDuration);
    let t = current;
    if (t >= total - 0.1) t = 0;

    const narrationLonger = !!voiceUrl && voiceDuration > duration + 0.05;
    video.loop = narrationLonger && holdMode === "loop";

    video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
    if (voiceEl && voiceUrl) {
      voiceEl.currentTime = Math.min(t, Math.max(0, voiceDuration - 0.01));
      void voiceEl.play();
    }
    await video.play();
    setPlaying(true);
  }

  function onVideoEnded() {
    const voiceEl = voiceElRef.current;
    if (voiceUrl && voiceDuration > duration + 0.05 && voiceEl && !voiceEl.ended) {
      return; // freeze last frame; narration keeps going
    }
    voiceEl?.pause();
    setPlaying(false);
  }

  function onVoiceEnded() {
    if (voiceDuration >= duration - 0.05) {
      videoRef.current?.pause();
      setPlaying(false);
    }
  }

  function seek(t: number) {
    const v = videoRef.current;
    const voiceEl = voiceElRef.current;
    if (v) v.currentTime = Math.min(t, Math.max(0, duration - 0.05));
    if (voiceEl && voiceUrl)
      voiceEl.currentTime = Math.min(t, Math.max(0, voiceDuration - 0.01));
    setCurrent(t);
  }

  function downloadVoiceOnly() {
    if (!voiceUrl) return;
    const a = document.createElement("a");
    a.href = voiceUrl;
    a.download = "scene2prompt-voiceover.wav";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function exportWebm() {
    const video = videoRef.current;
    const voiceEl = voiceElRef.current;
    if (!video || !voiceEl || !voiceUrl) return;
    setExportError(null);
    setExporting(true);
    setExportPct(0);
    video.pause();
    voiceEl.pause();
    setPlaying(false);

    buildGraph();
    const audioCtx = audioCtxRef.current!;
    const mixDest = mixDestRef.current!;
    await audioCtx.resume();
    // Open the ambience gate for the recording.
    if (gAmbRef.current)
      gAmbRef.current.gain.value = mood !== "none" ? ambVol / 100 : 0;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;

    let raf = 0;
    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      if (gAmbRef.current) gAmbRef.current.gain.value = 0;
    };

    try {
      const stream = canvas.captureStream(30);
      const combined = new MediaStream([
        stream.getVideoTracks()[0],
        ...mixDest.stream.getAudioTracks(),
      ]);

      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(combined, { mimeType: pickMimeType() });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const done = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      const vDur = video.duration || 0;
      const totalDur = Math.max(vDur, voiceDuration || 0);
      const narrationLonger = voiceDuration > vDur + 0.05;
      video.loop = narrationLonger && holdMode === "loop";

      const startT = performance.now();
      const draw = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const elapsed = (performance.now() - startT) / 1000;
        if (totalDur > 0)
          setExportPct(Math.min(99, Math.round((elapsed / totalDur) * 100)));
        raf = requestAnimationFrame(draw);
      };

      recorder.start();
      video.currentTime = 0;
      voiceEl.currentTime = 0;
      await Promise.all([video.play(), voiceEl.play()]);
      draw();

      await new Promise<void>((resolve) => {
        const check = () => {
          const videoDone =
            video.loop || video.ended || video.currentTime >= vDur - 0.05;
          const voiceDone =
            voiceEl.ended || voiceEl.currentTime >= voiceDuration - 0.05;
          const timeUp = (performance.now() - startT) / 1000 >= totalDur + 0.3;
          if ((videoDone && voiceDone) || timeUp) resolve();
          else setTimeout(check, 100);
        };
        check();
      });

      cancelAnimationFrame(raf);
      raf = 0;
      video.pause();
      video.loop = false;
      voiceEl.pause();
      recorder.stop();
      await done;

      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "scene2prompt-voiceover.webm";
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

  const busy = phase === "loading-model" || phase === "synthesizing";
  const totalDur = Math.max(duration, voiceDuration);
  const previewLabel = previewing
    ? modelReady
      ? "Synthesizing…"
      : `Loading model… ${modelPct}%`
    : "▶ Hear this voice";
  const moodHint = MOODS.find((m) => m.id === mood)?.hint ?? "";

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-400">
        Add a spoken <strong className="text-neutral-200">voice-over</strong> to a
        video from a text script. The voice is generated{" "}
        <strong className="text-neutral-200">free in your browser</strong> (neural
        TTS — no API key, nothing billed). Pick a video, paste your script, choose
        a voice, speed and <strong className="text-neutral-200">mood</strong>, then
        it&apos;s mixed over the video&apos;s existing audio and exported as a{" "}
        <strong className="text-neutral-200">.webm</strong>. The first run
        downloads the voice model once (~tens of MB), then it&apos;s cached.
      </div>

      {/* Choose video */}
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

      {/* Hidden voice-over audio (mixed via Web Audio). */}
      <audio
        ref={voiceElRef}
        src={voiceUrl ?? undefined}
        className="hidden"
        preload="auto"
        onEnded={onVoiceEnded}
      />
      {/* Hidden element for auditioning a voice (routed through the mood fx). */}
      <audio ref={previewElRef} className="hidden" preload="auto" />

      {videoUrl && (
        <div className="flex flex-col gap-5">
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            onLoadedMetadata={onLoadedMetadata}
            onEnded={onVideoEnded}
            className="mx-auto max-h-[60vh] w-full rounded-xl bg-black"
          />

          {videoReady && (
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
                max={totalDur || 0}
                step={0.05}
                value={current}
                onChange={(e) => seek(Number(e.target.value))}
                className="flex-1 accent-neutral-100"
              />
              <span className="w-10 text-xs tabular-nums text-neutral-400">
                {fmt(totalDur)}
              </span>
            </div>
          )}

          {/* Script + voice */}
          <div className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <label className="flex flex-col gap-1.5 text-sm text-neutral-300">
              Voice-over script
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={5}
                placeholder="Paste the full narration text here…"
                className="resize-y rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
              />
            </label>

            {/* Upload your sample voice → detect & match a tone */}
            <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={sampleInputRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac,.mpeg,.mpg,.mpga,.opus"
                  className="hidden"
                  onChange={(e) => handleSampleFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => sampleInputRef.current?.click()}
                  className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
                >
                  {sampleUrl ? "Replace my sample voice" : "Upload my sample voice"}
                </button>
                {sampleUrl && (
                  <audio src={sampleUrl} controls className="h-8 max-w-[240px]" />
                )}
                {detecting && (
                  <span className="text-xs text-neutral-400">Analyzing pitch…</span>
                )}
              </div>
              {detected && (
                <p className="text-xs text-emerald-400">
                  Detected ~{detected.f0} Hz → matched to{" "}
                  <strong>{presetName(detected.preset)}</strong>. Added as{" "}
                  <em>My voice</em> in the dropdown and selected.
                </p>
              )}
              <p className="text-xs text-neutral-500">
                Optional. We can&apos;t clone your exact voice for free in the
                browser — this measures your clip&apos;s pitch to pick the closest
                preset. Compare by ear with <em>Hear this voice</em>.
              </p>
            </div>

            <label className="flex flex-col gap-1.5 text-sm text-neutral-300 sm:flex-row sm:items-center sm:gap-3">
              <span className="sm:w-24">Voice tone</span>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
              >
                {detected && (
                  <option value={detected.preset}>
                    ★ My voice → {presetName(detected.preset)} (~{detected.f0} Hz)
                  </option>
                )}
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => auditionVoice(voice)}
                disabled={previewing}
                className="shrink-0 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {previewLabel}
              </button>
            </label>

            {/* Speed */}
            <label className="flex items-center gap-3 text-sm text-neutral-300">
              <span className="sm:w-24">Speed</span>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                onPointerUp={() => auditionVoice(voice)}
                onKeyUp={() => auditionVoice(voice)}
                className="flex-1 accent-neutral-100"
              />
              <span className="w-12 text-right tabular-nums text-neutral-200">
                {speed.toFixed(2)}×
              </span>
            </label>

            {/* Mood */}
            <div className="flex flex-col gap-1.5 text-sm text-neutral-300">
              <div className="flex flex-wrap items-center gap-2">
                <span className="sm:w-24">Mood</span>
                <div className="flex flex-wrap gap-2">
                  {MOODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMood(m.id)}
                      className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                        mood === m.id
                          ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                          : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-neutral-500 sm:pl-[6.75rem]">{moodHint}</p>
              {mood !== "none" && (
                <label className="mt-1 flex items-center gap-3 text-sm text-neutral-400">
                  <span className="sm:w-24">Atmosphere</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={ambVol}
                    onChange={(e) => setAmbVol(Number(e.target.value))}
                    className="flex-1 accent-neutral-100"
                  />
                  <span className="w-12 text-right text-neutral-200">
                    {ambVol}%
                  </span>
                </label>
              )}
            </div>

            <p className="-mt-1 text-xs text-neutral-500">
              {modelReady
                ? "Auditions play instantly (cached). Changing voice or speed auto-plays a sample; mood applies live — even while the video is playing."
                : `Preparing the voice model… ${modelPct}% (first time only).`}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={generate}
                disabled={busy || exporting}
                className="rounded-lg bg-neutral-100 px-4 py-2 font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {phase === "loading-model"
                  ? `Loading voice model… ${modelPct}%`
                  : phase === "synthesizing"
                    ? chunk
                      ? `Generating voice… ${chunk.done}/${chunk.total}`
                      : "Generating voice…"
                    : voiceUrl
                      ? "Regenerate voice-over"
                      : "Generate voice-over"}
              </button>
              {voiceUrl && !busy && (
                <button
                  onClick={downloadVoiceOnly}
                  className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-800"
                >
                  Download voice only (.wav)
                </button>
              )}
            </div>
            {staleVoice && !busy && (
              <p className="text-xs text-amber-400">
                Voice or speed changed — click{" "}
                <strong>Regenerate voice-over</strong> to apply it to the full
                narration. (Mood doesn&apos;t need regenerating.)
              </p>
            )}
            {busy && phase === "loading-model" && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full bg-neutral-100 transition-all"
                  style={{ width: `${modelPct}%` }}
                />
              </div>
            )}
            {genError && <p className="text-sm text-red-400">{genError}</p>}
          </div>

          {/* Mix + export */}
          {voiceUrl && (
            <div className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <p className="text-sm text-neutral-300">
                Mix ·{" "}
                <span className="text-neutral-500">
                  voice-over is {fmt(voiceDuration)}, video is {fmt(duration)}
                </span>
              </p>
              <label className="flex items-center gap-3 text-sm text-neutral-400">
                <span className="w-28">Original audio</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={origVol}
                  onChange={(e) => setOrigVol(Number(e.target.value))}
                  className="flex-1 accent-neutral-100"
                />
                <span className="w-10 text-right text-neutral-200">{origVol}%</span>
              </label>
              <label className="flex items-center gap-3 text-sm text-neutral-400">
                <span className="w-28">Voice-over</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={voiceVol}
                  onChange={(e) => setVoiceVol(Number(e.target.value))}
                  className="flex-1 accent-neutral-100"
                />
                <span className="w-10 text-right text-neutral-200">{voiceVol}%</span>
              </label>

              {voiceDuration > duration + 0.05 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-sm text-neutral-400">
                    Video is shorter than the voice-over —
                  </span>
                  {(["freeze", "loop"] as const).map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHoldMode(h)}
                      className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                        holdMode === h
                          ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                          : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      {h === "freeze" ? "Freeze last frame" : "Loop video"}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={exportWebm}
                  disabled={exporting}
                  className="rounded-lg bg-neutral-100 px-4 py-2 font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exporting
                    ? `Exporting… ${exportPct}%`
                    : "Download video with voice-over (.webm)"}
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
              {exportError && (
                <p className="text-sm text-red-400">{exportError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
