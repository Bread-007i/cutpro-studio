import type { AspectRatio, Clip, ClipProps, Track } from "./types";
import { ASPECT_DIMS } from "./types";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function formatTime(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatTimeFull(t: number, fps = 30): string {
  if (!isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t % 1) * fps);
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  const ff = f.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}:${ff}` : `${mm}:${ss}:${ff}`;
}

/** CSS filter string from clip props (empty string when everything is default) */
export function filterToCss(p: ClipProps): string {
  const parts: string[] = [];
  if (p.brightness !== 100) parts.push(`brightness(${p.brightness}%)`);
  if (p.contrast !== 100) parts.push(`contrast(${p.contrast}%)`);
  if (p.saturation !== 100) parts.push(`saturate(${p.saturation}%)`);
  if (p.hue !== 0) parts.push(`hue-rotate(${p.hue}deg)`);
  if (p.blur > 0) parts.push(`blur(${p.blur}px)`);
  if (p.grayscale > 0) parts.push(`grayscale(${p.grayscale}%)`);
  if (p.sepia > 0) parts.push(`sepia(${p.sepia}%)`);
  return parts.join(" ");
}

export function isDefaultFilter(p: ClipProps): boolean {
  return filterToCss(p) === "";
}

/** Opacity multiplier from fade in/out at time t */
export function fadeFactor(clip: Clip, t: number): number {
  const local = t - clip.start;
  const end = clip.start + clip.duration;
  let f = 1;
  if (clip.props.fadeIn > 0) f *= clamp(local / clip.props.fadeIn, 0, 1);
  if (clip.props.fadeOut > 0) f *= clamp((end - t) / clip.props.fadeOut, 0, 1);
  return f;
}

export function aspectDims(a: AspectRatio): { w: number; h: number } {
  return ASPECT_DIMS[a];
}

export function trackFor(store: { tracks: Track[] }, trackId: string): Track | undefined {
  return store.tracks.find((tr) => tr.id === trackId);
}

/** Find a free position at the end of a track */
export function trackEnd(clips: Clip[], trackId: string, exceptClipId?: string): number {
  let end = 0;
  for (const c of clips) {
    if (c.trackId !== trackId || c.id === exceptClipId) continue;
    end = Math.max(end, c.start + c.duration);
  }
  return end;
}

/** Snapping candidates around the timeline */
export function snapTime(
  t: number,
  candidates: number[],
  thresholdSec: number
): { time: number; snapped: boolean } {
  let best = t;
  let bestDist = thresholdSec;
  let snapped = false;
  for (const c of candidates) {
    const d = Math.abs(c - t);
    if (d < bestDist) {
      bestDist = d;
      best = c;
      snapped = true;
    }
  }
  return { time: best, snapped };
}

export function niceStep(pxPerSec: number): number {
  // choose a tick interval that is >= ~80px
  const target = 80 / pxPerSec;
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const s of steps) if (s >= target) return s;
  return 900;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
