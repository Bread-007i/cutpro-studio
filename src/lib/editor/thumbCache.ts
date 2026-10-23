// Filmstrip thumbnails + audio waveform peaks, cached per media item.
import type { MediaItem } from "./types";

const TILE_W = 96;
const TILE_H = 54;
const TILES = 10;

const filmstrips = new Map<string, string[]>();
const stripPending = new Map<string, Promise<string[]>>();

export function getFilmstrip(mediaId: string): string[] | undefined {
  return filmstrips.get(mediaId);
}

export function isStripLoading(mediaId: string): boolean {
  return stripPending.has(mediaId);
}

/** Generate (once) a filmstrip of TILE_W-wide tiles for a video/image */
export function ensureFilmstrip(media: MediaItem): Promise<string[]> {
  const existing = filmstrips.get(media.id);
  if (existing) return Promise.resolve(existing);
  const inflight = stripPending.get(media.id);
  if (inflight) return inflight;

  const job = (async (): Promise<string[]> => {
    if (media.type === "image") {
      if (media.thumbnail) {
        const tiles = [media.thumbnail];
        filmstrips.set(media.id, tiles);
        return tiles;
      }
      return [];
    }
    if (media.type !== "video" || !isFinite(media.duration) || media.duration <= 0) return [];

    const tiles: string[] = [];
    const v = document.createElement("video");
    v.src = media.url;
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";

    const seekTo = (t: number) =>
      new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        v.onseeked = done;
        setTimeout(done, 1200);
        try {
          v.currentTime = Math.max(0, Math.min(t, (media.duration || 1) - 0.05));
        } catch {
          done();
        }
      });

    for (let i = 0; i < TILES; i++) {
      await seekTo((media.duration * (i + 0.5)) / TILES);
      if (v.readyState < 2) continue;
      try {
        const c = document.createElement("canvas");
        const scale = TILE_W / Math.max(1, v.videoWidth || TILE_W);
        c.width = TILE_W;
        c.height = Math.max(1, Math.round((v.videoHeight || TILE_H) * scale));
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        tiles.push(c.toDataURL("image/jpeg", 0.62));
      } catch {
        /* frame not ready */
      }
    }
    v.removeAttribute("src");
    if (tiles.length > 0) filmstrips.set(media.id, tiles);
    return tiles;
  })().finally(() => stripPending.delete(media.id));

  stripPending.set(media.id, job);
  return job;
}

// ---- waveforms ---------------------------------------------------------------

const waves = new Map<string, Float32Array>();
const wavePending = new Map<string, Promise<Float32Array | null>>();

export function getWaveform(mediaId: string): Float32Array | undefined {
  return waves.get(mediaId);
}

export function isWaveLoading(mediaId: string): boolean {
  return wavePending.has(mediaId);
}

const PEAKS_PER_SEC = 20;

/** Decode audio (from audio or video file) into normalized peaks */
export function ensureWaveform(media: MediaItem): Promise<Float32Array | null> {
  const existing = waves.get(media.id);
  if (existing) return Promise.resolve(existing);
  const inflight = wavePending.get(media.id);
  if (inflight) return inflight;

  const job = (async (): Promise<Float32Array | null> => {
    if (!media.file || media.type === "image") return null;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const buf = await media.file.arrayBuffer();
      const ctx = new AC();
      const audio = await ctx.decodeAudioData(buf);
      const ch = audio.getChannelData(0);
      const step = Math.max(1, Math.floor(audio.sampleRate / PEAKS_PER_SEC));
      const n = Math.ceil(ch.length / step);
      const peaks = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let peak = 0;
        const end = Math.min(ch.length, (i + 1) * step);
        for (let j = i * step; j < end; j += 4) {
          const v = Math.abs(ch[j]);
          if (v > peak) peak = v;
        }
        peaks[i] = peak;
      }
      // normalize
      let max = 0;
      for (let i = 0; i < n; i++) if (peaks[i] > max) max = peaks[i];
      if (max > 0.001) for (let i = 0; i < n; i++) peaks[i] = peaks[i] / max;
      void ctx.close();
      waves.set(media.id, peaks);
      return peaks;
    } catch {
      return null;
    } finally {
      wavePending.delete(media.id);
    }
  })();

  wavePending.set(media.id, job);
  return job;
}

/** Get waveform segment for a clip: source range [from,to] seconds */
export function waveSlice(peaks: Float32Array, mediaDuration: number, from: number, to: number, width: number): number[] {
  if (!mediaDuration || mediaDuration <= 0) return [];
  const out: number[] = [];
  const n = peaks.length;
  for (let x = 0; x < width; x++) {
    const t = from + ((to - from) * x) / Math.max(1, width - 1);
    const idx = Math.floor((t / mediaDuration) * n);
    out.push(idx >= 0 && idx < n ? peaks[idx] : 0);
  }
  return out;
}
