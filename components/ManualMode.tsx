"use client";

import { useMemo, useState } from "react";
import JSZip from "jszip";
import type { UploadResult } from "@/components/Uploader";
import FramePreview from "@/components/FramePreview";
import PromptOptionsForm from "@/components/PromptOptionsForm";
import { buildManualInstructions } from "@/lib/manualInstructions";
import type { PromptOptions } from "@/lib/types";

function frameFilename(kind: string, i: number, timestamp: number): string {
  const label = kind === "video" ? `t${timestamp.toFixed(1)}s` : "image";
  return `scene2prompt-frame-${String(i + 1).padStart(2, "0")}-${label}.jpg`;
}

export default function ManualMode({
  result,
  options,
  onOptionsChange,
}: {
  result: UploadResult;
  options: PromptOptions;
  onOptionsChange: (next: PromptOptions) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);

  const instructions = useMemo(
    () => buildManualInstructions(result.kind, result.frames, options),
    [result, options]
  );

  async function downloadAll() {
    setZipping(true);
    try {
      const zip = new JSZip();
      result.frames.forEach((frame, i) => {
        const base64 = frame.dataUrl.split(",")[1] ?? "";
        zip.file(frameFilename(result.kind, i, frame.timestamp), base64, {
          base64: true,
        });
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "scene2prompt-frames.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setZipping(false);
    }
  }

  async function copyInstructions() {
    try {
      await navigator.clipboard.writeText(instructions);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            {result.kind === "video"
              ? `Extracted frames${
                  result.duration ? ` · ${result.duration.toFixed(1)}s video` : ""
                }`
              : "Uploaded image"}
          </h2>
          <button
            onClick={downloadAll}
            disabled={zipping}
            className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {zipping
              ? "Preparing…"
              : result.frames.length > 1
                ? `Download all ${result.frames.length} frames (.zip)`
                : "Download image"}
          </button>
        </div>
        <FramePreview kind={result.kind} frames={result.frames} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Prompt options
        </h2>
        <PromptOptionsForm
          value={options}
          onChange={onOptionsChange}
          hideTier
          hideGenerate
        />
      </div>

      <ol className="flex flex-col gap-1 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-sm text-neutral-300">
        <li>
          1. Click <span className="text-neutral-100">Download</span>
          {result.frames.length > 1
            ? " to get a .zip, then unzip it to get all the frames."
            : " to save the image."}
        </li>
        <li>
          2. Open{" "}
          <a
            href="https://claude.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-100 underline"
          >
            claude.ai
          </a>{" "}
          and start a new chat.
        </li>
        <li>3. Attach the frame image(s) to the message.</li>
        <li>4. Paste the instructions below and send.</li>
      </ol>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Instructions to paste
          </h2>
          <button
            onClick={copyInstructions}
            className="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-800"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <textarea
          readOnly
          value={instructions}
          rows={16}
          className="w-full resize-y rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-xs leading-relaxed text-neutral-200 outline-none"
        />
      </div>
    </div>
  );
}
