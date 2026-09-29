// Server-only. Never import this from a client component.
import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  // Surfaced at request time via the route's try/catch, not at module load,
  // so the build doesn't fail when the key is absent.
  console.warn("GEMINI_API_KEY is not set — /api routes will fail.");
}

export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY ?? "",
});

// A current Gemini model with image (vision) input support.
export const GEMINI_MODEL = "gemini-2.5-flash";
