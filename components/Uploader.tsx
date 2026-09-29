"use client";

import { useRef, useState } from "react";
import type { FrameData, UploadKind } from "@/lib/types";
import { imageResize } from "@/lib/imageResize";
import { extractFrames } from "@/lib/extractFrames";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const ACCEPT = ".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm";

const MAX_IMAGE_BYTES = 40 * 1024 * 1024; // 40MB
const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // 300MB

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
}

export type UploadResult = {
  kind: UploadKind;
  frames: FrameData[];
  duration?: number;
};

function kindForFile(file: File): UploadKind | null {
  if (IMAGE_TYPES.includes(file.type)) return "image";
  if (VIDEO_TYPES.includes(file.type)) return "video";
  // Fall back to extension when the browser reports no/unknown MIME type.
  const name = file.name.toLowerCase();
  if (/\.(jpe?g|png|webp)$/.test(name)) return "image";
  if (/\.(mp4|mov|webm)$/.test(name)) return "video";
  return null;
}

export default function Uploader({
  onResult,
}: {
  onResult: (result: UploadResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    const kind = kindForFile(file);
    if (!kind) {
      setError(
        "That file type isn't supported. Please use a JPG, PNG, or WEBP image, or an MP4, MOV, or WEBM video."
      );
      return;
    }

    const limit = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (file.size > limit) {
      setError(
        `That ${kind} is too large (${mb(file.size)}). Please use ${
          kind === "image" ? "an image" : "a video"
        } under ${mb(limit)}.`
      );
      return;
    }

    setLoading(true);
    try {
      if (kind === "image") {
        const dataUrl = await imageResize(file);
        onResult({ kind, frames: [{ dataUrl, timestamp: 0 }] });
      } else {
        const { duration, frames } = await extractFrames(file);
        onResult({ kind, frames, duration });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file.");
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging
            ? "border-neutral-400 bg-neutral-900"
            : "border-neutral-700 bg-neutral-950 hover:border-neutral-500"
        }`}
      >
        {loading ? (
          <p className="text-neutral-300">Reading frames…</p>
        ) : (
          <>
            <p className="text-neutral-200">
              Drag &amp; drop a photo or video, or click to choose
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              JPG, PNG, WEBP, MP4, MOV, WEBM
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
