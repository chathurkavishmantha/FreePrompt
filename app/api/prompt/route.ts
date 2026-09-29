import { NextResponse } from "next/server";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";
import { parseJson } from "@/lib/parseJson";
import {
  API_KEY_MISSING_MESSAGE,
  friendlyError,
  isApiKeyMissing,
} from "@/lib/apiErrors";
import { STYLE_EXAMPLES } from "@/lib/examples";
import { CREDITS } from "@/lib/credits";
import type {
  PromptOptions,
  PromptResult,
  SceneDescription,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are an expert cinematic prompt engineer for AI video tools (Google Flow/Veo, Kling, Higgsfield). You turn a factual scene description into a ready-to-use video generation prompt.

HARD RULES:
- Use ONLY the subjects, appearance and colors from the description. Never change how a character or object looks. Do not add characters, objects, or settings that are not in the description.
- Write each masterPrompt as ONE flowing cinematic paragraph that moves shot by shot using connective phrases: "then cut to", "then transition into", "followed by", "ending with".
- Every beat must name a specific camera shot and movement chosen from: top-down shot, low-angle hero shot, high-angle shot, wide establishing shot, extreme close-up, macro detail shot, over-the-shoulder, tracking shot, dolly-in, dolly-out, orbit around subject, crane up, aerial drone shot, whip pan, crash zoom, handheld shake, slow motion, speed ramp, rack focus.
- Include detail shots of important parts (hands, eyes, hair, outfit, armor, textures) drawn from the description.
- Describe lighting with color and atmosphere (volumetric smoke, dust, rain, reflections) and VFX (sparks, debris, energy glow, motion blur).
- ALWAYS include the exact phrase: "maintain consistent character appearance, face, outfit/armor, colors and design throughout the entire video".
- End each masterPrompt with quality/style tags (cinematic depth of field, detailed textures, high-quality lighting, smooth camera movement, and the chosen style) and a strong final shot.

STYLE REFERENCES (below) are for RICHNESS, STRUCTURE, CAMERA LANGUAGE and DETAIL LEVEL ONLY. NEVER reuse their content, characters, or settings:
${STYLE_EXAMPLES.map((ex, i) => `[Example ${i + 1}] ${ex}`).join("\n\n")}

MODE — BUDGET:
- Produce exactly ONE clip matched to the tool's clip length.
- Maximum 3 beats, one continuous location.
- Prefer smooth continuous camera moves over hard cuts.
- Keep masterPrompt under about 120 words.
- In tips, recommend testing on the cheapest tier first.

MODE — LONG:
- Split longDuration into clips of the tool's clip length. Produce one Clip per segment, each with its own masterPrompt, shotTimeline, and a continuityNote describing the LAST frame of that clip (so it can be used as the next clip's start frame).
- Also produce one fullSequencePrompt written in the style of the examples (a single flowing paragraph covering the whole sequence).

OTHER FIELDS:
- startFrameTip: tell the user to use their uploaded photo or best extracted frame as the start frame / image-to-video input for consistency.
- negativePrompt: list unwanted artifacts, e.g. blurry, distorted face, extra fingers, extra limbs, character changing appearance, text, watermark, flicker, warping, duplicate limbs.
- audio: suggest fitting sound design / music direction.
- tips: short practical tips for getting good results with the chosen tool.

Return ONLY strict JSON matching this TypeScript type. No markdown, no code fences, no commentary:

type ShotBeat = { time: string; shot: string; camera: string; action: string };
type Clip = { masterPrompt: string; shotTimeline: ShotBeat[]; continuityNote?: string };
type PromptResult = {
  clips: Clip[];
  fullSequencePrompt?: string;
  negativePrompt: string;
  audio: string;
  startFrameTip: string;
  tips: string[];
};

Every required field must be present.`;

type PromptBody = {
  description: SceneDescription;
  options: PromptOptions;
};

function clipSecondsFor(options: PromptOptions): number {
  if (options.tool === "kling") return options.klingLength ?? 5;
  return CREDITS[options.tool]?.clipLengths[0] ?? 8;
}

export async function POST(req: Request) {
  try {
    if (isApiKeyMissing()) {
      return NextResponse.json(
        { error: API_KEY_MISSING_MESSAGE },
        { status: 500 }
      );
    }

    const { description, options } = (await req.json()) as PromptBody;

    if (!description || !options) {
      return NextResponse.json(
        { error: "Missing description or options." },
        { status: 400 }
      );
    }

    const clipSeconds = clipSecondsFor(options);
    const clipCount =
      options.mode === "long" && options.longDuration
        ? Math.max(1, Math.ceil(options.longDuration / clipSeconds))
        : 1;

    const userText = [
      `TOOL: ${options.tool} (clip length ${clipSeconds}s)`,
      `MODE: ${options.mode}`,
      options.mode === "long"
        ? `TARGET DURATION: ${options.longDuration ?? "?"}s → ${clipCount} clip(s) of ${clipSeconds}s`
        : `Produce exactly 1 clip of ${clipSeconds}s`,
      `ASPECT RATIO: ${options.aspectRatio}`,
      `STYLE: ${options.style}`,
      options.idea ? `USER IDEA / DIRECTION: ${options.idea}` : null,
      ``,
      `SCENE DESCRIPTION (JSON):`,
      JSON.stringify(description, null, 2),
    ]
      .filter((line) => line !== null)
      .join("\n");

    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: userText }] }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        maxOutputTokens: 16000,
      },
    });

    const text = response.text ?? "";
    if (!text.trim()) {
      throw new Error("The model returned no text content.");
    }

    const result = parseJson<PromptResult>(text);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: friendlyError(err) },
      { status: 500 }
    );
  }
}
