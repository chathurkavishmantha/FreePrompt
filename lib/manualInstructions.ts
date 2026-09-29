// Builds a ready-to-paste instruction for a chat assistant (e.g. claude.ai),
// so you can generate a prompt WITHOUT an API key — just attach the downloaded
// frames and paste this text. Mirrors the rules used by the API routes.

import type { FrameData, PromptOptions, UploadKind } from "./types";
import { CREDITS } from "./credits";

const TOOL_LABELS: Record<PromptOptions["tool"], string> = {
  flow: "Google Flow / Veo",
  kling: "Kling",
  higgsfield: "Higgsfield",
};

function clipSecondsFor(options: PromptOptions): number {
  if (options.tool === "kling") return options.klingLength ?? 5;
  return CREDITS[options.tool]?.clipLengths[0] ?? 8;
}

export function buildManualInstructions(
  kind: UploadKind,
  frames: FrameData[],
  options: PromptOptions
): string {
  const clipSeconds = clipSecondsFor(options);
  const clipCount =
    options.mode === "long" && options.longDuration
      ? Math.max(1, Math.ceil(options.longDuration / clipSeconds))
      : 1;

  const source =
    kind === "video"
      ? `I've attached ${frames.length} frames sampled in time order from a video, at these timestamps: ${frames
          .map((f) => `${f.timestamp.toFixed(1)}s`)
          .join(", ")}.`
      : `I've attached 1 image.`;

  const modeBlock =
    options.mode === "budget"
      ? `MODE — BUDGET:
- Produce exactly ONE clip matched to the clip length (${clipSeconds}s).
- Maximum 3 beats, one continuous location.
- Prefer smooth continuous camera moves over hard cuts.
- Keep the master prompt under about 120 words.
- Tell me to test on the cheapest tier first.`
      : `MODE — LONG SEQUENCE:
- Target duration: ${options.longDuration ?? "?"}s → split into ${clipCount} clip(s) of ${clipSeconds}s.
- Give each clip its own master prompt, a short shot timeline (time, shot, camera, action), and a continuity note describing its LAST frame (to use as the next clip's start frame).
- Also give one full-sequence prompt covering the whole thing as a single flowing paragraph.`;

  return `${source}

Please do BOTH steps below.

STEP 1 — Describe exactly what you see (do not invent anything):
- Describe ONLY what is actually visible. Never guess. List anything you are unsure about separately as "uncertain".
- Be very specific about appearance so it stays consistent in a video: hair color and style, face, outfit and its materials/fabrics, armor or costume details, any glowing parts, exact colors, textures.
${kind === "video" ? "- Describe how the action changes over time and the camera angles/movement in the footage.\n" : ""}
STEP 2 — Write a cinematic AI video prompt based ONLY on what you see:
- Target tool: ${TOOL_LABELS[options.tool]} (clip length ${clipSeconds}s)
- Aspect ratio: ${options.aspectRatio}
- Style: ${options.style}${options.idea ? `\n- My idea / direction: ${options.idea}` : ""}

Rules for the prompt:
- Use ONLY the subjects, appearance and colors from what you actually see. Never change how a character or object looks. Don't add anything that isn't there.
- Write each master prompt as ONE flowing cinematic paragraph that moves shot by shot using "then cut to", "then transition into", "followed by", "ending with".
- Every beat must name a specific camera shot/movement from: top-down shot, low-angle hero shot, high-angle shot, wide establishing shot, extreme close-up, macro detail shot, over-the-shoulder, tracking shot, dolly-in, dolly-out, orbit around subject, crane up, aerial drone shot, whip pan, crash zoom, handheld shake, slow motion, speed ramp, rack focus.
- Include detail shots of important parts (hands, eyes, hair, outfit, armor, textures).
- Describe lighting with color and atmosphere (volumetric smoke, dust, rain, reflections) and VFX (sparks, debris, energy glow, motion blur).
- Always include the phrase: "maintain consistent character appearance, face, outfit/armor, colors and design throughout the entire video".
- End with quality/style tags (cinematic depth of field, detailed textures, high-quality lighting, smooth camera movement, and the chosen style) and a strong final shot.

${modeBlock}

Also give me:
- A negative prompt (e.g. blurry, distorted face, extra fingers, extra limbs, character changing appearance, text, watermark, flicker, warping).
- A short audio / music suggestion.
- A tip reminding me to use my original photo or best frame as the start frame (image-to-video input) for consistency.`;
}
