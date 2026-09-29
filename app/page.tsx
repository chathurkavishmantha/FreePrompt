"use client";

import { useState } from "react";
import Uploader, { type UploadResult } from "@/components/Uploader";
import FramePreview from "@/components/FramePreview";
import StepIndicator from "@/components/StepIndicator";
import DescriptionForm from "@/components/DescriptionForm";
import PromptOptionsForm from "@/components/PromptOptionsForm";
import PromptResultView from "@/components/PromptResultView";
import ManualMode from "@/components/ManualMode";
import CaptionStudio from "@/components/CaptionStudio";
import type {
  PromptOptions,
  PromptResult,
  SceneDescription,
} from "@/lib/types";

type Step = 1 | 2 | 3;
type Mode = "manual" | "auto";
type Tool = "prompt" | "captions";

export default function Home() {
  const [tool, setTool] = useState<Tool>("prompt");
  const [mode, setMode] = useState<Mode>("manual");
  const [step, setStep] = useState<Step>(1);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [describing, setDescribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState<SceneDescription | null>(null);

  const [options, setOptions] = useState<PromptOptions>({
    tool: "flow",
    mode: "budget",
    aspectRatio: "9:16",
    style: "Ultra-realistic cinematic",
  });
  const [tier, setTier] = useState<string>("lite");
  const [generating, setGenerating] = useState(false);
  const [promptResult, setPromptResult] = useState<PromptResult | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);

  function startOver() {
    setStep(1);
    setResult(null);
    setDescribing(false);
    setError(null);
    setDescription(null);
    setOptions({
      tool: "flow",
      mode: "budget",
      aspectRatio: "9:16",
      style: "Ultra-realistic cinematic",
    });
    setTier("lite");
    setGenerating(false);
    setPromptResult(null);
    setPromptError(null);
  }

  async function generatePrompt() {
    if (!description) return;
    setGenerating(true);
    setPromptError(null);
    try {
      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, options }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      setPromptResult(data as PromptResult);
    } catch (err) {
      setPromptError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setGenerating(false);
    }
  }

  function handleResult(r: UploadResult) {
    setResult(r);
    setDescription(null);
    setError(null);
  }

  async function describe() {
    if (!result) return;
    setDescribing(true);
    setError(null);
    try {
      const res = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: result.kind,
          frames: result.frames,
          duration: result.duration,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      setDescription(data as SceneDescription);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setDescribing(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:gap-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Scene2Prompt
              </h1>
              <p className="mt-2 text-sm text-neutral-400 sm:text-base">
                Generate a cinematic AI video prompt, or add animated captions to
                a finished video.
              </p>
            </div>
            {tool === "prompt" && (result || description || promptResult) && (
              <button
                onClick={startOver}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-900"
              >
                Start over
              </button>
            )}
          </div>

          {/* Tool tabs */}
          <div className="inline-flex w-fit rounded-lg border border-neutral-800 bg-neutral-900 p-1">
            {(["prompt", "captions"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTool(t)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  tool === t
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-300 hover:text-neutral-100"
                }`}
              >
                {t === "prompt" ? "Video prompt" : "Auto captions"}
              </button>
            ))}
          </div>

          {/* Mode toggle (prompt tool only) */}
          {tool === "prompt" && (
          <div className="flex flex-col gap-1">
            <div className="inline-flex w-fit rounded-lg border border-neutral-800 bg-neutral-900 p-1">
              {(["manual", "auto"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    mode === m
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-neutral-300 hover:text-neutral-100"
                  }`}
                >
                  {m === "manual" ? "Free · my own chat" : "Automatic · API key"}
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-500">
              {mode === "manual"
                ? "No API key needed — extract frames here, then paste into claude.ai yourself."
                : "Uses the server's GEMINI_API_KEY to generate everything automatically."}
            </p>
          </div>
          )}

          {tool === "prompt" && mode === "auto" && (
            <StepIndicator current={step} />
          )}
        </header>

        {tool === "captions" && <CaptionStudio />}

        {tool === "prompt" && error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {/* Manual (free) mode */}
        {tool === "prompt" && mode === "manual" && (
          <section className="flex flex-col gap-6">
            <Uploader onResult={handleResult} />
            {result && (
              <ManualMode
                result={result}
                options={options}
                onOptionsChange={setOptions}
              />
            )}
          </section>
        )}

        {/* Step 1: Upload */}
        {tool === "prompt" && mode === "auto" && step === 1 && (
          <section className="flex flex-col gap-6">
            <Uploader onResult={handleResult} />

            {result && (
              <div className="flex flex-col gap-4">
                <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
                  {result.kind === "video"
                    ? `Extracted frames${
                        result.duration
                          ? ` · ${result.duration.toFixed(1)}s video`
                          : ""
                      }`
                    : "Uploaded image"}
                </h2>
                <FramePreview kind={result.kind} frames={result.frames} />

                {describing && (
                  <p className="text-sm text-neutral-300">Describing scene…</p>
                )}

                <div>
                  <button
                    onClick={describe}
                    disabled={describing}
                    className="rounded-lg bg-neutral-100 px-4 py-2 font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {describing ? "Describing…" : "Describe"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Step 2: Describe */}
        {tool === "prompt" && mode === "auto" && step === 2 && description && (
          <section className="flex flex-col gap-6">
            <DescriptionForm value={description} onChange={setDescription} />
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="rounded-lg border border-neutral-700 px-4 py-2 font-medium text-neutral-200 transition-colors hover:bg-neutral-900"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="rounded-lg bg-neutral-100 px-4 py-2 font-medium text-neutral-900 transition-colors hover:bg-white"
              >
                Next: Generate prompt
              </button>
            </div>
          </section>
        )}

        {/* Step 3: Prompt */}
        {tool === "prompt" && mode === "auto" && step === 3 && description && (
          <section className="flex flex-col gap-6">
            <PromptOptionsForm
              value={options}
              onChange={setOptions}
              tier={tier}
              onTierChange={setTier}
              onGenerate={generatePrompt}
              generating={generating}
            />

            {promptError && (
              <p className="text-sm text-red-400">{promptError}</p>
            )}

            {generating && (
              <p className="text-sm text-neutral-300">Writing prompt…</p>
            )}

            {promptResult && (
              <PromptResultView
                result={promptResult}
                options={options}
                tier={tier}
                onRegenerate={generatePrompt}
                regenerating={generating}
              />
            )}

            <div>
              <button
                onClick={() => setStep(2)}
                className="rounded-lg border border-neutral-700 px-4 py-2 font-medium text-neutral-200 transition-colors hover:bg-neutral-900"
              >
                Back to description
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
