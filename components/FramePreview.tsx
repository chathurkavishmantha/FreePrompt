"use client";

import type { FrameData, UploadKind } from "@/lib/types";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export default function FramePreview({
  kind,
  frames,
}: {
  kind: UploadKind;
  frames: FrameData[];
}) {
  if (frames.length === 0) return null;

  return (
    <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
      {frames.map((frame, i) => (
        <figure
          key={`${frame.timestamp}-${i}`}
          className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={frame.dataUrl}
            alt={kind === "video" ? `Frame at ${frame.timestamp}s` : "Uploaded image"}
            className="aspect-video w-full object-cover"
          />
          {kind === "video" && (
            <figcaption className="px-2 py-1 text-center text-xs text-neutral-400">
              {formatTimestamp(frame.timestamp)}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
