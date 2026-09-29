// Browser-only video frame extraction.

import type { FrameData } from "./types";
import { imageResize } from "./imageResize";

const FRAME_COUNT = 20;
const EDGE_SKIP = 0.2; // seconds skipped at the very start and end

export type ExtractResult = {
  duration: number;
  frames: FrameData[];
};

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error("Failed to load video"));
    video.src = src;
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Failed to seek video"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = time;
  });
}

/** Compute up to FRAME_COUNT evenly spaced timestamps within the usable range. */
function timestampsFor(duration: number): number[] {
  const start = EDGE_SKIP;
  const end = Math.max(start, duration - EDGE_SKIP);
  const span = end - start;
  if (span <= 0) return [Math.min(duration / 2, duration)];

  const stops: number[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    // Distribute at the centers of FRAME_COUNT equal slices.
    const t = start + (span * (i + 0.5)) / FRAME_COUNT;
    stops.push(Number(t.toFixed(3)));
  }
  return stops;
}

/**
 * Load a video File, read its duration, seek to 20 evenly spaced timestamps
 * (skipping the first/last 0.2s), draw each frame to a canvas, resize each via
 * imageResize, and return { duration, frames }.
 */
export async function extractFrames(file: File): Promise<ExtractResult> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = await loadVideo(objectUrl);
    const duration = video.duration;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    const frames: FrameData[] = [];
    for (const timestamp of timestampsFor(duration)) {
      await seekTo(video, timestamp);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = await imageResize(canvas);
      frames.push({ dataUrl, timestamp });
    }

    return { duration, frames };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
