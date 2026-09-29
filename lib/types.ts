export type UploadKind = "image" | "video";

export type FrameData = {
  /** base64 JPEG data URL */
  dataUrl: string;
  /** timestamp in seconds */
  timestamp: number;
};

export type SceneSubject = {
  name: string;
  appearance: string;
  clothing: string;
  colors: string;
  materials: string;
  glowingDetails: string;
  position: string;
};

export type SceneDescription = {
  summary: string;
  subjects: SceneSubject[];
  actions: string[];
  setting: string;
  lighting: string;
  camera: string;
  vfx: string;
  colors: string;
  mood: string;
  style: string;
  uncertain: string[];
};

export type PromptOptions = {
  tool: "flow" | "kling" | "higgsfield";
  mode: "budget" | "long";
  aspectRatio: "9:16" | "16:9" | "1:1";
  style: "Ultra-realistic cinematic" | "3D anime cinematic" | "Animated";
  klingLength?: 5 | 10;
  longDuration?: number;
  idea?: string;
};

export type CaptionWord = {
  /** the spoken word text */
  text: string;
  /** start time in seconds */
  start: number;
  /** end time in seconds */
  end: number;
};

export type ShotBeat = {
  time: string;
  shot: string;
  camera: string;
  action: string;
};

export type Clip = {
  masterPrompt: string;
  shotTimeline: ShotBeat[];
  continuityNote?: string;
};

export type PromptResult = {
  clips: Clip[];
  fullSequencePrompt?: string;
  negativePrompt: string;
  audio: string;
  startFrameTip: string;
  tips: string[];
};
