// Encode mono Float32 PCM samples to a 16-bit WAV Blob (browser-friendly, so it
// can be played by an <audio> element and mixed via Web Audio).

export function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const numFrames = pcm.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = bytesPerSample; // mono
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/** Concatenate Float32 chunks, optionally with a gap of silence (seconds) between them. */
export function concatPcm(
  chunks: Float32Array[],
  sampleRate: number,
  gapSeconds = 0
): Float32Array {
  const gap = Math.max(0, Math.round(gapSeconds * sampleRate));
  const total =
    chunks.reduce((n, c) => n + c.length, 0) +
    gap * Math.max(0, chunks.length - 1);
  const out = new Float32Array(total);
  let offset = 0;
  chunks.forEach((c, i) => {
    out.set(c, offset);
    offset += c.length;
    if (i < chunks.length - 1) offset += gap; // leave silence
  });
  return out;
}
