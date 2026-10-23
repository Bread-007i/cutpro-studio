// Core types for the video editor

export type MediaType = "video" | "audio" | "image";
export type TrackType = "video" | "audio" | "text";
export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5";

/** Curve point [x, y] normalized 0..1 */
export type CurvePt = [number, number];
export interface GradeCurves {
  master?: CurvePt[] | null;
  r?: CurvePt[] | null;
  g?: CurvePt[] | null;
  b?: CurvePt[] | null;
}

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  file?: File;
  duration: number; // seconds (images use default display duration)
  width: number;
  height: number;
  thumbnail?: string;
}

export interface ClipProps {
  // transform
  x: number; // -1..1 relative offset from center
  y: number;
  scale: number; // 1 = fit
  rotation: number; // degrees
  opacity: number; // 0..1
  fit: "contain" | "cover";
  // basic color (kept for compat / quick sliders)
  brightness: number; // 100 = normal (0..200)
  contrast: number; // 100 = normal (0..200)
  saturation: number; // 100 = normal (0..200)
  hue: number; // degrees
  blur: number; // px @1080p reference
  grayscale: number; // 0..100
  sepia: number; // 0..100
  // pro grade — color wheels
  liftM: number; // master lift -0.5..0.5
  liftR: number; // wheel offsets -0.25..0.25
  liftG: number;
  liftB: number;
  gammaM: number; // -1..1
  gammaR: number; // -0.9..0.9
  gammaG: number;
  gammaB: number;
  gainM: number; // -1..1
  gainR: number; // -0.5..0.5
  gainG: number;
  gainB: number;
  // pro grade — tonal
  temp: number; // -100..100 (blue..orange)
  tint: number; // -100..100 (green..magenta)
  highlights: number; // -100..100
  shadows: number; // -100..100
  fade: number; // 0..100 film fade
  // pro grade — effects
  vignette: number; // 0..100
  grain: number; // 0..100
  sharpen: number; // 0..100
  // pro grade — curves
  curves: GradeCurves | null;
  // speed / audio
  speed: number; // 0.25..4
  volume: number; // 0..2
  muted: boolean;
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  // text
  text: string;
  fontSize: number; // px @1080p reference
  color: string;
  fontWeight: number;
  textBg: number; // background alpha 0..1
  stroke: boolean;
  align: "left" | "center" | "right";
}

export interface Clip {
  id: string;
  trackId: string;
  mediaId?: string; // undefined for text clips
  kind: "media" | "text";
  name: string;
  start: number; // timeline position (seconds)
  duration: number; // timeline length (seconds) = sourceDuration / speed
  inPoint: number; // offset into source (seconds)
  props: ClipProps;
}

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  muted: boolean;
  hidden: boolean;
}

export const DEFAULT_PROPS: ClipProps = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  fit: "contain",
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  liftM: 0,
  liftR: 0,
  liftG: 0,
  liftB: 0,
  gammaM: 0,
  gammaR: 0,
  gammaG: 0,
  gammaB: 0,
  gainM: 0,
  gainR: 0,
  gainG: 0,
  gainB: 0,
  temp: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  fade: 0,
  vignette: 0,
  grain: 0,
  sharpen: 0,
  curves: null,
  speed: 1,
  volume: 1,
  muted: false,
  fadeIn: 0,
  fadeOut: 0,
  text: "ข้อความใหม่",
  fontSize: 56,
  color: "#ffffff",
  fontWeight: 700,
  textBg: 0,
  stroke: true,
  align: "center",
};

/** Fields that belong to the color grade (used by copy/paste/reset/looks) */
export const GRADE_KEYS = [
  "brightness", "contrast", "saturation", "hue", "grayscale", "sepia",
  "liftM", "liftR", "liftG", "liftB",
  "gammaM", "gammaR", "gammaG", "gammaB",
  "gainM", "gainR", "gainG", "gainB",
  "temp", "tint", "highlights", "shadows", "fade",
  "vignette", "grain", "sharpen", "curves",
] as const;

export type GradePatch = Partial<Pick<ClipProps, (typeof GRADE_KEYS)[number]>>;

export const ASPECT_DIMS: Record<AspectRatio, { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

export const IMAGE_DEFAULT_DURATION = 4;
