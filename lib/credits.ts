// Credit cost per generation and clip length per tool/tier.
// NOTE: update these, prices change. Numbers below are placeholders only.

export type ToolId = "flow" | "kling" | "higgsfield";

export type TierConfig = {
  label: string;
  /** Placeholder credits charged per single clip generation. */
  creditsPerGeneration: number;
};

export type ToolConfig = {
  label: string;
  /** Clip length options in seconds. */
  clipLengths: number[];
  tiers: Record<string, TierConfig>;
};

export const CREDITS: Record<ToolId, ToolConfig> = {
  flow: {
    label: "Google Flow / Veo",
    clipLengths: [8], // Flow/Veo clips are 8s
    tiers: {
      lite: { label: "Lite", creditsPerGeneration: 10 },
      fast: { label: "Fast", creditsPerGeneration: 20 },
      quality: { label: "Quality", creditsPerGeneration: 100 },
    },
  },
  kling: {
    label: "Kling",
    clipLengths: [5, 10], // Kling clips are 5s or 10s
    tiers: {
      standard: { label: "Standard", creditsPerGeneration: 20 },
      pro: { label: "Pro", creditsPerGeneration: 35 },
    },
  },
  higgsfield: {
    label: "Higgsfield",
    clipLengths: [5], // placeholder clip length
    tiers: {
      standard: { label: "Standard", creditsPerGeneration: 30 },
    },
  },
};

/** Estimate total credits for a run: per-generation cost × number of clips. */
export function estimateCredits(
  tool: ToolId,
  tier: string,
  clipCount: number
): number {
  const toolCfg = CREDITS[tool];
  if (!toolCfg) return 0;
  const tierCfg = toolCfg.tiers[tier];
  if (!tierCfg) return 0;
  return tierCfg.creditsPerGeneration * Math.max(1, clipCount);
}
