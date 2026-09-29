// Browser-only mood/atmosphere for the voice-over, built entirely with the Web
// Audio API — no audio files, no API key.
//
// Two parts per mood:
//   buildVoiceFx  — an effect chain (reverb / filter / delay / compression) that
//                   the narration voice is routed through, reshaping its tone.
//   buildAmbience — a procedurally-synthesized background bed (drones, pads,
//                   wind) generated live with oscillators + noise, mixed under
//                   the voice.
// Both are rebuilt when the mood changes; ambience is gated by an external gain.

export type MoodId = "none" | "horror" | "mystery" | "dramatic" | "calm";

export const MOODS: { id: MoodId; name: string; hint: string }[] = [
  { id: "none", name: "Neutral", hint: "Clean narration — no effect." },
  { id: "horror", name: "Horror", hint: "Muffled & cavernous, with a low throbbing drone." },
  { id: "mystery", name: "Mystery", hint: "Distant echo, with a tense shimmering pad." },
  { id: "dramatic", name: "Dramatic", hint: "Bold, present & cinematic, with a low swell." },
  { id: "calm", name: "Calm / bedtime", hint: "Soft & warm, with a gentle pad." },
];

// A decaying-noise impulse response for the ConvolverNode (synthetic reverb).
function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function makeNoise(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export type VoiceFx = { input: AudioNode; output: AudioNode };

/** Route the voice: connect the source to `.input` and take audio from `.output`. */
export function buildVoiceFx(ctx: AudioContext, mood: MoodId): VoiceFx {
  const input = ctx.createGain();
  const output = ctx.createGain();

  if (mood === "none") {
    input.connect(output);
    return { input, output };
  }

  // Parallel reverb send onto `output`.
  const addReverb = (src: AudioNode, seconds: number, decay: number, wet: number) => {
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, seconds, decay);
    const wetGain = ctx.createGain();
    wetGain.gain.value = wet;
    src.connect(conv);
    conv.connect(wetGain);
    wetGain.connect(output);
  };

  if (mood === "horror") {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200; // muffle the highs
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 220;
    low.gain.value = 6; // thicken the low end
    input.connect(lp);
    lp.connect(low);
    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    low.connect(dry);
    dry.connect(output);
    addReverb(low, 3.5, 2.2, 0.55); // long, cavernous tail
  } else if (mood === "mystery") {
    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    input.connect(dry);
    dry.connect(output);
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.19;
    const fb = ctx.createGain();
    fb.gain.value = 0.28; // repeating slap echo
    const dWet = ctx.createGain();
    dWet.gain.value = 0.35;
    input.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(dWet);
    dWet.connect(output);
    addReverb(input, 2.2, 2.5, 0.3);
  } else if (mood === "dramatic") {
    const pres = ctx.createBiquadFilter();
    pres.type = "peaking";
    pres.frequency.value = 3000;
    pres.Q.value = 1;
    pres.gain.value = 4; // presence / clarity
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    input.connect(pres);
    pres.connect(comp);
    const dry = ctx.createGain();
    dry.gain.value = 0.9;
    comp.connect(dry);
    dry.connect(output);
    addReverb(comp, 1.6, 2.5, 0.15);
  } else if (mood === "calm") {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3500;
    lp.Q.value = 0.7; // gentle warmth
    input.connect(lp);
    const dry = ctx.createGain();
    dry.gain.value = 0.9;
    lp.connect(dry);
    dry.connect(output);
    addReverb(lp, 2.0, 3, 0.15);
  }

  return { input, output };
}

export type Ambience = { output: AudioNode; dispose: () => void };

/**
 * Build a looping background atmosphere for the mood. Returns null for "none".
 * Nodes start immediately (and are silent until the external gate opens); call
 * `dispose()` to stop and disconnect everything.
 */
export function buildAmbience(ctx: AudioContext, mood: MoodId): Ambience | null {
  if (mood === "none") return null;

  const output = ctx.createGain();
  const stops: (() => void)[] = [];

  const osc = (freq: number, type: OscillatorType, gainVal: number, dest: AudioNode) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    o.connect(g);
    g.connect(dest);
    o.start();
    stops.push(() => {
      try {
        o.stop();
      } catch {}
      o.disconnect();
      g.disconnect();
    });
    return g;
  };

  // A slow LFO added on top of a param's base value (tremolo / throb / swell).
  const lfo = (rate: number, depth: number, base: number, target: AudioParam) => {
    const l = ctx.createOscillator();
    l.type = "sine";
    l.frequency.value = rate;
    const d = ctx.createGain();
    d.gain.value = depth;
    l.connect(d);
    d.connect(target);
    target.value = base;
    l.start();
    stops.push(() => {
      try {
        l.stop();
      } catch {}
      l.disconnect();
      d.disconnect();
    });
  };

  const noise = (
    type: BiquadFilterType,
    freq: number,
    gainVal: number,
    dest: AudioNode
  ) => {
    const src = ctx.createBufferSource();
    src.buffer = makeNoise(ctx, 2);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start();
    stops.push(() => {
      try {
        src.stop();
      } catch {}
      src.disconnect();
      f.disconnect();
      g.disconnect();
    });
  };

  if (mood === "horror") {
    const throb = ctx.createGain();
    throb.connect(output);
    lfo(0.8, 0.18, 0.5, throb.gain); // slow heartbeat-like throb
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    lp.connect(throb);
    osc(55, "sine", 0.6, lp);
    osc(55.35, "sine", 0.45, lp); // detuned beating drone
    noise("lowpass", 120, 0.12, output); // low rumble
  } else if (mood === "mystery") {
    const trem = ctx.createGain();
    const pad = ctx.createBiquadFilter();
    pad.type = "lowpass";
    pad.frequency.value = 1400;
    trem.connect(pad);
    pad.connect(output);
    lfo(0.12, 0.02, 0.05, trem.gain);
    osc(330, "sine", 0.05, trem);
    osc(392, "sine", 0.04, trem);
    osc(494, "sine", 0.028, trem); // shimmering minor-ish cluster
    noise("highpass", 5000, 0.02, output); // airy hiss
  } else if (mood === "dramatic") {
    const swell = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 250;
    swell.connect(lp);
    lp.connect(output);
    lfo(0.1, 0.15, 0.4, swell.gain); // slow cinematic swell
    osc(82.4, "sine", 0.5, swell);
    osc(123.5, "sine", 0.3, swell); // low fifth
  } else if (mood === "calm") {
    const warm = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    warm.connect(lp);
    lp.connect(output);
    lfo(0.08, 0.06, 0.35, warm.gain); // gentle breathing
    osc(196, "sine", 0.4, warm);
    osc(261, "sine", 0.3, warm); // soft warm pad
    noise("lowpass", 500, 0.03, output); // soft air
  }

  return {
    output,
    dispose: () => {
      for (const stop of stops) stop();
      output.disconnect();
    },
  };
}
