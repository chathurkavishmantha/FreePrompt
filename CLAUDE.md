@AGENTS.md

# Scene2Prompt

Local Next.js (App Router) + TypeScript + Tailwind app. Upload a photo or video,
get an editable scene description, then generate a cinematic AI video prompt.

## Tools (top tabs)

- **Video prompt** — the two prompt-generation modes below.
- **Auto captions** — add animated, word-by-word (karaoke) captions to a video
  that already has a voice-over. Fully in-browser, no API key: `extractAudio.ts`
  decodes the audio to 16 kHz mono PCM, `whisper.worker.ts` runs Whisper via
  `@huggingface/transformers` for word timestamps (model downloads once from the
  HF CDN, then cached), and `components/CaptionPlayer.tsx` overlays the video and
  highlights the active word live, and can **export a .webm with the captions
  burned in** (MediaRecorder records an offscreen canvas + audio, in real time).
  Shared draw/timing helpers live in `lib/captions.ts`. Orchestrated by
  `components/CaptionStudio.tsx`.
- **Remove watermark** — hide a logo/watermark by drawing a box or brush mask
  over it and covering it with blur / pixelate / clone-nearby. Fully in-browser,
  no key: `lib/watermark.ts` composites a masked replacement onto each canvas
  frame; `components/WatermarkStudio.tsx` handles drawing, live preview, and a
  burned-in **.webm** export (MediaRecorder). Obscures the region — not true AI
  reconstruction.

## Video prompt modes

- **Free · my own chat** (default, no API key): frames are extracted in the
  browser, downloaded, and a paste-ready instruction (`lib/manualInstructions.ts`,
  `components/ManualMode.tsx`) is generated for the user to paste into claude.ai.
- **Automatic · API key**: the 3-step server flow below (needs `GEMINI_API_KEY`).

## AI provider (Automatic mode)

- Uses **Google Gemini** via the **`@google/genai`** SDK (server-side only).
- Model: **`gemini-2.5-flash`** (multimodal, supports image input) — set in
  `lib/gemini.ts` as `GEMINI_MODEL`.
- API key: **`GEMINI_API_KEY`** in `.env.local`. Never sent to the browser; only
  read in server route handlers. `.env.local` is gitignored.
- Server client lives in `lib/gemini.ts`. API routes: `app/api/describe/route.ts`
  (frames → `SceneDescription`) and `app/api/prompt/route.ts`
  (description + options → `PromptResult`). Both call
  `gemini.models.generateContent(...)` with `responseMimeType: "application/json"`
  and parse the result with `lib/parseJson.ts`.

## Working rules

- Never read `node_modules`, `.next`, `package-lock.json`, or image/video files.
- After a change: run `npm run build`, fix errors, then stop.
- Credit prices/clip lengths are placeholders in `lib/credits.ts` — update as
  prices change.
