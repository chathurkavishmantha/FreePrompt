# Scene2Prompt

Turn a photo or video into a **cinematic AI video prompt** ready for tools like
Google Flow/Veo, Kling, and Higgsfield.

Upload an image or a short clip, get an accurate, editable description of the
scene, then generate a shot-by-shot cinematic prompt (with a shot timeline,
negative prompt, audio direction, and a credit estimate).

Everything runs locally. Your Google Gemini API key stays on the server and is
never sent to the browser.

## How it works

- **Images** are resized in the browser (max 1568px on the long edge, JPEG) and
  sent as a single frame.
- **Videos** are sampled in the browser into 20 evenly spaced frames.
- The frames go to Google Gemini (`gemini-2.5-flash`) via a server route to
  produce a structured `SceneDescription`.
- You edit that description, choose your options, and Gemini writes a
  `PromptResult` with one or more clips.

## Setup

Requires Node.js 18+.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add your Gemini API key to `.env.local` (create it if it doesn't exist):

   ```
   GEMINI_API_KEY=...
   ```

   Get a key at <https://aistudio.google.com/apikey>. `.env.local` is gitignored
   and only read on the server.

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open <http://localhost:3000>.

## Two tools

Tabs at the top switch between:

- **Video prompt** — turn a photo/video into a cinematic AI video prompt (the two
  modes and 3-step flow described below).
- **Auto captions** — add animated word-by-word (karaoke) captions to a video
  that already has a voice-over. See below.

## Auto captions (free, in-browser)

Pick a video that already has your voice-over. The app decodes the audio and runs
**Whisper speech-to-text right in your browser** (via `@huggingface/transformers`)
to get word-level timing — **no API key, nothing billed**. The first run downloads
a small speech model (~tens of MB) from the Hugging Face CDN, then it's cached.

You then get a live preview: the video plays with captions that highlight each
word as it's spoken (TikTok/Reels style). Tweak the **font** (Anton, Bangers,
Montserrat, Poppins, or System), **highlight color**, **animation** (none / pop /
bounce), free **position** (left↔right and up↕down sliders), **word gap**,
**words per line**, and **text size**. When it looks right, click **Download video with
captions** to export a **.webm** with the captions **burned into the video**
(plays on TikTok, Reels, and YouTube). Export records in real time, so a 60s clip
takes ~60s — keep the tab open. Word timing is approximate.

## Video prompt — two modes

A toggle switches how the AI work happens:

- **Free · my own chat** (default, no API key) — the app extracts the frames in
  your browser, lets you **download** them, and gives you a ready-to-paste
  **instruction**. You open [claude.ai](https://claude.ai) (or any chat you
  already pay for), attach the frames, paste the instruction, and it writes the
  prompt for you there. Nothing is billed by this app.
- **Automatic · API key** — the app calls Gemini server-side and does the
  describe → generate steps for you. Needs `GEMINI_API_KEY` (see Setup) and is
  billed per use by Google.

The Setup key step is only required for **Automatic** mode.

## Using the app — Automatic mode (3 steps)

1. **Upload** — Drag & drop or pick a photo (JPG/PNG/WEBP) or video
   (MP4/MOV/WEBM). You'll see the extracted frame(s). Click **Describe**.
2. **Describe** — Review and edit the auto-generated scene description. Anything
   the model was unsure about appears in a yellow **Uncertain** box — fix those
   for best consistency. Click **Next: Generate prompt**.
3. **Prompt** — Pick your tool, mode (Budget = one clip, Long = a multi-clip
   sequence), aspect ratio, style, and tier. Click **Generate prompt**. Copy any
   section (or **Copy all**), or **Regenerate**. Use your original photo / best
   frame as the start frame for image-to-video.

Use **Start over** at the top right to reset everything.

## Updating credit prices

Credit costs and clip lengths are placeholders and change often. Edit them in
[`lib/credits.ts`](lib/credits.ts):

- Adjust `creditsPerGeneration` for each tool/tier.
- Adjust `clipLengths` (seconds) per tool.
- `estimateCredits(tool, tier, clipCount)` multiplies the per-clip cost by the
  number of clips — the UI shows this on the results screen.

These numbers are only estimates shown in the UI; they don't affect prompt
generation.

## Project structure

```
app/
  page.tsx              3-step flow (upload → describe → prompt)
  api/describe/route.ts POST: frames → SceneDescription
  api/prompt/route.ts   POST: description + options → PromptResult
components/             Uploader, FramePreview, StepIndicator, ManualMode,
                        DescriptionForm, PromptOptionsForm, PromptResultView,
                        CaptionStudio, CaptionPlayer
lib/
  imageResize.ts        browser image resize → JPEG data URL
  extractFrames.ts      browser video → 20 frames
  extractAudio.ts       browser video → 16 kHz mono PCM (for captions)
  whisper.worker.ts     in-browser Whisper (word timestamps), no API key
  captions.ts           caption line-grouping + canvas draw (preview + export)
  manualInstructions.ts builds the paste-into-chat instruction (free mode)
  gemini.ts             server-only Google Gemini client + model id
  parseJson.ts          tolerant JSON parsing of model output
  examples.ts           STYLE_EXAMPLES (style references only)
  credits.ts            editable credit/clip-length config
  apiErrors.ts          friendly server error messages
  types.ts              shared types
```
