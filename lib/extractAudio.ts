// Browser-only: decode a media file's audio track into 16 kHz mono PCM,
// the format Whisper (transformers.js) expects.

const TARGET_RATE = 16000;

type WebkitWindow = Window &
  typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function makeAudioContext(): AudioContext {
  const w = window as WebkitWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio API is not available in this browser.");
  return new Ctor();
}

export type AudioResult = {
  /** mono PCM samples at 16 kHz */
  pcm: Float32Array;
  /** duration in seconds */
  duration: number;
};

/**
 * Read a File (video or audio), decode its audio, downmix to mono, and
 * resample to 16 kHz. Returns the Float32Array Whisper needs plus the duration.
 */
export async function extractAudio(file: File): Promise<AudioResult> {
  const arrayBuffer = await file.arrayBuffer();

  const ctx = makeAudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error(
      "Couldn't read the audio from this file. Make sure the video has an audio track (your voice-over)."
    );
  } finally {
    // Free the decode context; rendering happens in an OfflineAudioContext.
    void ctx.close();
  }

  if (decoded.length === 0) {
    throw new Error("This file has no audio — add the voice-over first.");
  }

  // Downmix to mono, then resample to 16 kHz via an offline render.
  const frameCount = Math.ceil(decoded.duration * TARGET_RATE);
  const offline = new OfflineAudioContext(1, frameCount, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  return {
    pcm: rendered.getChannelData(0),
    duration: decoded.duration,
  };
}
