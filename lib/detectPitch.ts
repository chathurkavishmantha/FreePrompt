// Browser-only: roughly estimate the average pitch (fundamental frequency) of a
// voice clip and map it to the closest preset. This is NOT voice cloning — it
// just measures pitch to pick a similar-sounding preset tone.

type AudioCtor = typeof AudioContext;

function makeAudioContext(): AudioContext {
  const w = window as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio is not supported in this browser.");
  return new Ctor();
}

// Autocorrelation pitch estimate for one window. Returns Hz, or -1 if unvoiced.
function estimatePitch(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1; // too quiet / silence

  const minLag = Math.floor(sampleRate / 400); // up to 400 Hz
  const maxLag = Math.floor(sampleRate / 70); // down to 70 Hz
  let bestLag = -1;
  let bestCorr = 0;
  let lastCorr = 1;
  let foundGoodDip = false;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < SIZE - lag; i++) corr += buf[i] * buf[i + lag];
    corr /= SIZE - lag;
    if (corr > 0.5 && corr > lastCorr) {
      foundGoodDip = true;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    } else if (foundGoodDip && corr < lastCorr) {
      break;
    }
    lastCorr = corr;
  }
  if (bestLag <= 0) return -1;
  return sampleRate / bestLag;
}

function median(nums: number[]): number {
  if (nums.length === 0) return -1;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type PitchMatch = { f0: number; preset: string };

/**
 * Decode a voice clip, estimate its median pitch, and choose the preset whose
 * typical range is closest. Returns the matched preset voice id + measured Hz.
 */
export async function detectVoicePreset(file: File): Promise<PitchMatch> {
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = makeAudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    void audioCtx.close();
  }

  const data = decoded.getChannelData(0);
  const sampleRate = decoded.sampleRate;
  const win = 2048;
  const hop = win; // non-overlapping windows are enough here
  const f0s: number[] = [];
  for (let start = 0; start + win < data.length; start += hop) {
    const f0 = estimatePitch(data.subarray(start, start + win), sampleRate);
    if (f0 > 0) f0s.push(f0);
    if (f0s.length > 400) break; // plenty of voiced frames
  }

  const f0 = median(f0s);

  // Map median pitch → closest preset (see VOICES in VoiceStudio).
  let preset: string;
  if (f0 <= 0) preset = "af_heart"; // couldn't tell — default warm female
  else if (f0 < 125) preset = "am_fenrir"; // deep male
  else if (f0 < 155) preset = "am_michael"; // male
  else if (f0 < 190) preset = "af_nicole"; // soft female
  else preset = "af_heart"; // higher female

  return { f0: Math.round(f0), preset };
}
