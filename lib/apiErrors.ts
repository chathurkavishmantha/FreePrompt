// Turns raw SDK / runtime errors into friendly, user-facing messages.

/** True when the server has no Gemini API key configured. */
export function isApiKeyMissing(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return !key || key.trim() === "" || key === "your-key-here";
}

export const API_KEY_MISSING_MESSAGE =
  "The server has no Gemini API key. Add GEMINI_API_KEY to .env.local and restart the dev server.";

/** Map an arbitrary error to a friendly message for the client. */
export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes("api key") ||
    lower.includes("apikey") ||
    lower.includes("api_key") ||
    lower.includes("permission") ||
    lower.includes("authentication") ||
    lower.includes("401") ||
    lower.includes("403")
  ) {
    return "Your Gemini API key was rejected. Check GEMINI_API_KEY in .env.local.";
  }
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("quota")) {
    return "Gemini rate limit or quota reached. Wait a moment and try again.";
  }
  if (lower.includes("overloaded") || lower.includes("unavailable") || lower.includes("503")) {
    return "The model is temporarily overloaded. Please try again shortly.";
  }
  if (lower.includes("safety") || lower.includes("blocked")) {
    return "The request was blocked by a safety filter. Try a different image or wording.";
  }
  if (lower.includes("json")) {
    return "The model returned an unexpected format. Try again or regenerate.";
  }
  return raw || "Something went wrong. Please try again.";
}
