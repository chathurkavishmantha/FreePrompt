"use client";

import { useState } from "react";
import type { PromptOptions, PromptResult } from "@/lib/types";
import { estimateCredits, CREDITS, type ToolId } from "@/lib/credits";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

function Section({
  title,
  copyText,
  children,
}: {
  title: string;
  copyText?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          {title}
        </h3>
        {copyText != null && <CopyButton text={copyText} />}
      </div>
      {children}
    </section>
  );
}

function buildCopyAll(result: PromptResult): string {
  const parts: string[] = [];
  result.clips.forEach((clip, i) => {
    parts.push(`# Clip ${i + 1}\n${clip.masterPrompt}`);
    if (clip.continuityNote) parts.push(`Continuity: ${clip.continuityNote}`);
  });
  if (result.fullSequencePrompt)
    parts.push(`# Full sequence\n${result.fullSequencePrompt}`);
  parts.push(`# Negative prompt\n${result.negativePrompt}`);
  parts.push(`# Audio\n${result.audio}`);
  parts.push(`# Start frame\n${result.startFrameTip}`);
  if (result.tips.length) parts.push(`# Tips\n- ${result.tips.join("\n- ")}`);
  return parts.join("\n\n");
}

export default function PromptResultView({
  result,
  options,
  tier,
  onRegenerate,
  regenerating,
}: {
  result: PromptResult;
  options: PromptOptions;
  tier: string;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const tool = options.tool as ToolId;
  const clipCount = result.clips.length;
  const credits = estimateCredits(tool, tier, clipCount);
  const tierLabel = CREDITS[tool]?.tiers[tier]?.label ?? tier;

  return (
    <div className="flex flex-col gap-6">
      {/* Header: credit estimate + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
        <div className="text-sm text-neutral-300">
          Estimated cost:{" "}
          <span className="font-semibold text-neutral-100">
            {credits} credits
          </span>{" "}
          <span className="text-neutral-500">
            ({clipCount} clip{clipCount === 1 ? "" : "s"} · {CREDITS[tool]?.label}{" "}
            {tierLabel})
          </span>
        </div>
        <div className="flex gap-2">
          <CopyButton text={buildCopyAll(result)} label="Copy all" />
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>

      {/* Clips */}
      {result.clips.map((clip, i) => (
        <div
          key={i}
          className="flex flex-col gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-100">
              Clip {i + 1}
            </h2>
          </div>

          <Section title="Master prompt" copyText={clip.masterPrompt}>
            <p className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm leading-relaxed text-neutral-100">
              {clip.masterPrompt}
            </p>
          </Section>

          {clip.shotTimeline.length > 0 && (
            <Section title="Shot timeline">
              <div className="overflow-x-auto rounded-lg border border-neutral-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-900 text-neutral-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Shot</th>
                      <th className="px-3 py-2 font-medium">Camera</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 text-neutral-200">
                    {clip.shotTimeline.map((beat, j) => (
                      <tr key={j} className="align-top">
                        <td className="px-3 py-2 whitespace-nowrap text-neutral-400">
                          {beat.time}
                        </td>
                        <td className="px-3 py-2">{beat.shot}</td>
                        <td className="px-3 py-2">{beat.camera}</td>
                        <td className="px-3 py-2">{beat.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {clip.continuityNote && (
            <Section title="Continuity (last frame)" copyText={clip.continuityNote}>
              <p className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-300">
                {clip.continuityNote}
              </p>
            </Section>
          )}
        </div>
      ))}

      {result.fullSequencePrompt && (
        <Section title="Full sequence prompt" copyText={result.fullSequencePrompt}>
          <p className="whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm leading-relaxed text-neutral-100">
            {result.fullSequencePrompt}
          </p>
        </Section>
      )}

      <Section title="Negative prompt" copyText={result.negativePrompt}>
        <p className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          {result.negativePrompt}
        </p>
      </Section>

      <Section title="Audio" copyText={result.audio}>
        <p className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          {result.audio}
        </p>
      </Section>

      <Section title="Start frame tip" copyText={result.startFrameTip}>
        <p className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-300">
          {result.startFrameTip}
        </p>
      </Section>

      {result.tips.length > 0 && (
        <Section title="Tips" copyText={result.tips.join("\n")}>
          <ul className="list-disc rounded-lg border border-neutral-800 bg-neutral-950 p-4 pl-8 text-sm text-neutral-300">
            {result.tips.map((tip, i) => (
              <li key={i} className="mb-1">
                {tip}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
