/**
 * Safely parse model output as JSON.
 * Strips ``` fences, trims, isolates the first `{` … last `}`, then JSON.parse.
 * Throws a clear error if parsing fails.
 */
export function parseJson<T = unknown>(raw: string): T {
  const stripped = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) {
    throw new Error("Model output did not contain a JSON object.");
  }

  const candidate = stripped.slice(first, last + 1);
  try {
    return JSON.parse(candidate) as T;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse model output as JSON: ${reason}`);
  }
}
