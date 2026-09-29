import { NextResponse } from "next/server";
import { type Part } from "@google/genai";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";
import { parseJson } from "@/lib/parseJson";
import {
  API_KEY_MISSING_MESSAGE,
  friendlyError,
  isApiKeyMissing,
} from "@/lib/apiErrors";
import type { FrameData, SceneDescription, UploadKind } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are a meticulous scene analyst. You are given one or more frames from a photo or video and must produce a precise, factual description.

Rules:
- Describe ONLY what is actually visible. Never invent, assume, or guess. If something is unclear, unreadable, occluded, or ambiguous, do not describe it as fact — add it to the "uncertain" array instead.
- Be VERY specific about appearance, because these details must stay consistent when the scene is regenerated as a video later: hair color and style, facial features, outfit and its materials/fabrics, armor or costume details, any glowing or emissive parts, exact colors, textures, and surface finishes.
- For video frames (multiple frames in time order): describe how the action and subjects change over time, and the camera angles, framing, and camera movement used in the source footage.
- Return ONLY strict JSON that matches this TypeScript type. No markdown, no code fences, no commentary before or after:

type SceneDescription = {
  summary: string;
  subjects: {
    name: string;
    appearance: string;
    clothing: string;
    colors: string;
    materials: string;
    glowingDetails: string;
    position: string;
  }[];
  actions: string[];
  setting: string;
  lighting: string;
  camera: string;
  vfx: string;
  colors: string;
  mood: string;
  style: string;
  uncertain: string[];
};

Every field must be present. Use "" or [] when there is nothing to report for a field.`;

type ImageMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function splitDataUrl(dataUrl: string): {
  mimeType: ImageMimeType;
  data: string;
} {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([\s\S]+)$/.exec(
    dataUrl
  );
  if (!match) {
    throw new Error("A frame was not a supported base64 image data URL.");
  }
  return { mimeType: match[1] as ImageMimeType, data: match[2] };
}

type DescribeBody = {
  kind: UploadKind;
  frames: FrameData[];
  duration?: number;
};

export async function POST(req: Request) {
  try {
    if (isApiKeyMissing()) {
      return NextResponse.json(
        { error: API_KEY_MISSING_MESSAGE },
        { status: 500 }
      );
    }

    const { kind, frames, duration } = (await req.json()) as DescribeBody;

    if (!Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json(
        { error: "No frames were provided." },
        { status: 400 }
      );
    }

    const parts: Part[] = [];
    parts.push({
      text:
        kind === "video"
          ? `The following ${frames.length} frames are sampled in time order from a ${
              duration ? `${duration.toFixed(1)}s ` : ""
            }video.`
          : `The following is a single uploaded image.`,
    });

    frames.forEach((frame, i) => {
      const { mimeType, data } = splitDataUrl(frame.dataUrl);
      parts.push({ text: `Frame ${i + 1} at ${frame.timestamp.toFixed(1)}s` });
      parts.push({ inlineData: { mimeType, data } });
    });

    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
      },
    });

    const text = response.text ?? "";
    if (!text.trim()) {
      throw new Error("The model returned no text content.");
    }

    const description = parseJson<SceneDescription>(text);
    return NextResponse.json(description);
  } catch (err) {
    return NextResponse.json({ error: friendlyError(err) }, { status: 500 });
  }
}
