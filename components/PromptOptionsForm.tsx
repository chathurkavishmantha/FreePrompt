"use client";

import type { PromptOptions } from "@/lib/types";
import { CREDITS, type ToolId } from "@/lib/credits";

const TOOL_LABELS: Record<ToolId, string> = {
  flow: "Google Flow / Veo",
  kling: "Kling",
  higgsfield: "Higgsfield",
};

const ASPECT_RATIOS: PromptOptions["aspectRatio"][] = ["9:16", "16:9", "1:1"];
const STYLES: PromptOptions["style"][] = [
  "Ultra-realistic cinematic",
  "3D anime cinematic",
  "Animated",
];

const labelClass =
  "text-xs font-medium uppercase tracking-wide text-neutral-500";
const controlClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500";

export default function PromptOptionsForm({
  value,
  onChange,
  tier,
  onTierChange,
  onGenerate,
  generating = false,
  hideTier = false,
  hideGenerate = false,
}: {
  value: PromptOptions;
  onChange: (next: PromptOptions) => void;
  tier?: string;
  onTierChange?: (tier: string) => void;
  onGenerate?: () => void;
  generating?: boolean;
  hideTier?: boolean;
  hideGenerate?: boolean;
}) {
  function setTool(tool: ToolId) {
    const next: PromptOptions = { ...value, tool };
    if (tool === "kling") {
      next.klingLength = value.klingLength ?? 5;
    } else {
      delete next.klingLength;
    }
    onChange(next);
    // Reset tier to the first valid tier for the new tool.
    onTierChange?.(Object.keys(CREDITS[tool].tiers)[0]);
  }

  const tierEntries = Object.entries(CREDITS[value.tool].tiers);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Tool */}
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Tool</span>
          <select
            value={value.tool}
            onChange={(e) => setTool(e.target.value as ToolId)}
            className={controlClass}
          >
            {(Object.keys(TOOL_LABELS) as ToolId[]).map((t) => (
              <option key={t} value={t}>
                {TOOL_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        {/* Tier */}
        {!hideTier && (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Tier (for credit estimate)</span>
            <select
              value={tier ?? tierEntries[0]?.[0]}
              onChange={(e) => onTierChange?.(e.target.value)}
              className={controlClass}
            >
              {tierEntries.map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label} · {cfg.creditsPerGeneration} cr/clip
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Aspect ratio */}
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Aspect ratio</span>
          <select
            value={value.aspectRatio}
            onChange={(e) =>
              onChange({
                ...value,
                aspectRatio: e.target.value as PromptOptions["aspectRatio"],
              })
            }
            className={controlClass}
          >
            {ASPECT_RATIOS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        {/* Style */}
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Style</span>
          <select
            value={value.style}
            onChange={(e) =>
              onChange({
                ...value,
                style: e.target.value as PromptOptions["style"],
              })
            }
            className={controlClass}
          >
            {STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        {/* Kling length (Kling only) */}
        {value.tool === "kling" && (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Kling clip length</span>
            <select
              value={value.klingLength ?? 5}
              onChange={(e) =>
                onChange({
                  ...value,
                  klingLength: Number(e.target.value) as 5 | 10,
                })
              }
              className={controlClass}
            >
              <option value={5}>5s</option>
              <option value={10}>10s</option>
            </select>
          </label>
        )}

        {/* Long duration (Long mode only) */}
        {value.mode === "long" && (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Target duration (seconds)</span>
            <input
              type="number"
              min={1}
              value={value.longDuration ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  longDuration: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              placeholder="e.g. 30"
              className={controlClass}
            />
          </label>
        )}
      </div>

      {/* Mode toggle */}
      <div className="flex flex-col gap-1">
        <span className={labelClass}>Mode</span>
        <div className="inline-flex w-fit rounded-lg border border-neutral-800 bg-neutral-900 p-1">
          {(["budget", "long"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...value, mode: m })}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                value.mode === m
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-300 hover:text-neutral-100"
              }`}
            >
              {m === "budget" ? "Budget" : "Long sequence"}
            </button>
          ))}
        </div>
      </div>

      {/* My idea */}
      <label className="flex flex-col gap-1">
        <span className={labelClass}>My idea (optional)</span>
        <textarea
          value={value.idea ?? ""}
          rows={3}
          onChange={(e) =>
            onChange({ ...value, idea: e.target.value || undefined })
          }
          placeholder="Any direction you want to add…"
          className={`${controlClass} resize-y`}
        />
      </label>

      {!hideGenerate && (
        <div>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="rounded-lg bg-neutral-100 px-4 py-2 font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? "Writing prompt…" : "Generate prompt"}
          </button>
        </div>
      )}
    </div>
  );
}
