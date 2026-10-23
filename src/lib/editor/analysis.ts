// Smart analysis tools: scene detection, silence detection, WAV encoding for AI captions

export interface SceneDetectOptions {
  threshold?: number; // 0..100 mean pixel diff
  sampleStep?: number; // seconds between samples
  minSceneLength?: number; // seconds
  onProgress?: (p: number) => void;
}

/**
 * Detect scene cuts in a video by comparing downsampled frames.
 * Returns cut times (seconds, in media time).
 */
export async function detectScenes(url: string, opts: SceneDetectOptions = {}): Promise<number[]> {
  const threshold = opts.threshold ?? 26;
  const sampleStep = opts.sampleStep ?? 0.4;
  const minSceneLength = opts.minSceneLength ?? 1;
  const onProgress = opts.onProgress;

  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("โหลดวิดีโอไม่สำเร็จ"));
  });

  const dur = isFinite(video.duration) ? video.duration : 0;
  if (dur <= 0) throw new Error("ไม่สามารถอ่านความยาววิดีโอได้");

  const W = 48;
  const H = 27;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas ไม่พร้อมใช้งาน");

  const grabFrame = (t: number): Promise<Uint8ClampedArray | null> =>
    new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        try {
          ctx.drawImage(video, 0, 0, W, H);
          const data = ctx.getImageData(0, 0, W, H).data;
          resolve(data);
        } catch {
          resolve(null);
        }
      };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = Math.min(t, Math.max(0, dur - 0.05));
      // safety timeout
      setTimeout(() => {
        video.removeEventListener("seeked", onSeeked);
        resolve(null);
      }, 3000);
    });

  let prev: Uint8ClampedArray | null = await grabFrame(0);
  const cuts: number[] = [];
  let lastCut = 0;

  for (let t = sampleStep; t < dur; t += sampleStep) {
    const cur = await grabFrame(t);
    onProgress?.(t / dur);
    if (cur && prev) {
      let diff = 0;
      const n = cur.length;
      for (let i = 0; i < n; i += 4) {
        diff += Math.abs(cur[i] - prev[i]) + Math.abs(cur[i + 1] - prev[i + 1]) + Math.abs(cur[i + 2] - prev[i + 2]);
      }
      diff = diff / ((n / 4) * 3); // mean abs diff per channel 0..255
      if (diff > threshold && t - lastCut >= minSceneLength) {
        cuts.push(t);
        lastCut = t;
      }
    }
    prev = cur;
  }

  video.removeAttribute("src");
  video.load();
  return cuts;
}

export interface SilenceRegion {
  start: number;
  end: number;
}

export interface SilenceDetectOptions {
  threshold?: number; // rms 0..1
  minSilence?: number; // seconds
  padding?: number; // seconds kept around speech
  onProgress?: (p: number) => void;
}

/**
 * Decode an audio/video file and find silent regions (in media time).
 */
export async function detectSilence(
  file: File,
  opts: SilenceDetectOptions = {}
): Promise<SilenceRegion[]> {
  const threshold = opts.threshold ?? 0.015;
  const minSilence = opts.minSilence ?? 0.5;
  const padding = opts.padding ?? 0.12;
  const onProgress = opts.onProgress;

  const buf = await file.arrayBuffer();
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) throw new Error("เบราว์เซอร์ไม่รองรับ Web Audio");
  const tmpCtx = new AC();
  let audio: AudioBuffer;
  try {
    audio = await tmpCtx.decodeAudioData(buf);
  } catch {
    await tmpCtx.close();
    throw new Error("ถอดรหัสไฟล์เสียงไม่สำเร็จ (อาจเป็นฟอร์แมตที่ไม่รองรับ)");
  }
  await tmpCtx.close();

  const sr = audio.sampleRate;
  const ch = audio.numberOfChannels;
  const len = audio.length;
  // mixdown
  const data = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < len; i++) data[i] += d[i] / ch;
  }

  const win = Math.max(256, Math.floor(sr * 0.02)); // 20ms windows
  const windows = Math.floor(len / win);
  const rms: number[] = new Array(windows);
  for (let w = 0; w < windows; w++) {
    let sum = 0;
    const off = w * win;
    for (let i = 0; i < win; i++) {
      const v = data[off + i];
      sum += v * v;
    }
    rms[w] = Math.sqrt(sum / win);
    if (w % 500 === 0) onProgress?.((w / windows) * 0.9);
  }

  const regions: SilenceRegion[] = [];
  let silentStart = -1;
  for (let w = 0; w < windows; w++) {
    const isSilent = rms[w] < threshold;
    if (isSilent && silentStart < 0) silentStart = w;
    if ((!isSilent || w === windows - 1) && silentStart >= 0) {
      const startT = (silentStart * win) / sr;
      const endT = ((w + (isSilent ? 1 : 0)) * win) / sr;
      if (endT - startT >= minSilence) {
        regions.push({
          start: Math.max(0, startT - padding),
          end: Math.min(audio.duration, endT + padding),
        });
      }
      silentStart = -1;
    }
  }
  onProgress?.(1);
  return regions;
}

/**
 * Extract a time range from a media file, downmix + resample to 16 kHz mono WAV.
 * Used before sending audio to the AI caption service.
 */
export async function extractWav(
  file: File,
  startSec: number,
  durationSec: number,
  onProgress?: (p: number) => void
): Promise<Blob> {
  onProgress?.(0.05);
  const buf = await file.arrayBuffer();
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) throw new Error("เบราว์เซอร์ไม่รองรับ Web Audio");
  const tmpCtx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await tmpCtx.decodeAudioData(buf);
  } catch {
    await tmpCtx.close();
    throw new Error("ถอดรหัสไฟล์เสียงไม่สำเร็จ");
  }
  await tmpCtx.close();
  onProgress?.(0.4);

  const sr = decoded.sampleRate;
  const start = Math.max(0, Math.floor(startSec * sr));
  const end = Math.min(decoded.length, Math.ceil((startSec + durationSec) * sr));
  const sliceLen = Math.max(1, end - start);

  const targetRate = 16000;
  const targetLen = Math.ceil((sliceLen / sr) * targetRate);
  const offline = new OfflineAudioContext(1, targetLen, targetRate);
  const src = offline.createBufferSource();
  // build mono slice buffer
  const mono = offline.createBuffer(1, sliceLen, sr);
  const monoData = mono.getChannelData(0);
  const chs = decoded.numberOfChannels;
  for (let i = 0; i < sliceLen; i++) {
    let v = 0;
    for (let c = 0; c < chs; c++) v += decoded.getChannelData(c)[start + i] / chs;
    monoData[i] = v;
  }
  src.buffer = mono;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  onProgress?.(0.7);

  return encodeWav(rendered);
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytes = len * numCh * 2;
  const ab = new ArrayBuffer(44 + bytes);
  const view = new DataView(ab);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, bytes, true);

  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
}

/** Split text (works for Thai without spaces) into caption chunks */
export function splitTextForCaptions(text: string, maxChars = 34): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  let cur = "";
  // split by sentence punctuation first, then hard-wrap
  const segments = clean.split(/(?<=[。.!?\n])\s*/);
  for (const seg of segments) {
    let s = seg;
    while (s.length > maxChars) {
      // try to break at space or thai-friendly break chars near the limit
      const window = s.slice(0, maxChars + 6);
      let breakAt = -1;
      for (let i = maxChars; i >= Math.max(8, maxChars - 10); i--) {
        const ch = window[i];
        if (ch === " " || ch === "," || ch === "、" || ch === "，") {
          breakAt = i;
          break;
        }
      }
      if (breakAt < 0) breakAt = maxChars;
      out.push(s.slice(0, breakAt).trim());
      s = s.slice(breakAt).trim();
    }
    if (s) {
      if ((cur + " " + s).trim().length <= maxChars) {
        cur = (cur ? cur + " " : "") + s;
      } else {
        if (cur) out.push(cur);
        cur = s;
      }
    }
  }
  if (cur) out.push(cur);
  return out.filter(Boolean);
}
