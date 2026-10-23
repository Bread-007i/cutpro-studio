// Color grading helpers: looks, curves LUT, wheel math, grade clipboard, custom presets
import type { ClipProps, CurvePt, GradePatch, GradeCurves } from "./types";
import { DEFAULT_PROPS, GRADE_KEYS } from "./types";

/** Neutral grade patch — everything at default */
export const NEUTRAL_GRADE: GradePatch = (() => {
  const o: Record<string, unknown> = {};
  for (const k of GRADE_KEYS) o[k] = DEFAULT_PROPS[k];
  return o as GradePatch;
})();

// ---------------------------------------------------------------------------
// Looks presets (accurate — applied through the WebGL grading pipeline)
// ---------------------------------------------------------------------------

export interface Look {
  id: string;
  name: string;
  desc: string;
  params: GradePatch;
  /** css approximation for instant tile preview fallback */
  css: string;
}

export const LOOKS: Look[] = [
  {
    id: "original",
    name: "ดั้งเดิม",
    desc: "ล้างเกรดทั้งหมด",
    params: {},
    css: "",
  },
  {
    id: "teal-orange",
    name: "ทีล-ออเรนจ์",
    desc: "ลุคหนังฮอลลีวูด เงาอมฟ้า ไฮไลต์อมส้ม",
    params: {
      liftB: 0.07, liftG: 0.02, liftR: -0.02,
      gainR: 0.09, gainG: 0.01, gainB: -0.07,
      temp: 12, contrast: 112, saturation: 116, shadows: -8,
    },
    css: "contrast(1.12) saturate(1.16) sepia(0.14) hue-rotate(-8deg)",
  },
  {
    id: "cool-cinema",
    name: "ซินีม่าเย็น",
    desc: "โทนหนังแนวระทึกขวัญ เย็นตา",
    params: {
      temp: -18, liftB: 0.05, gainR: -0.03,
      contrast: 115, saturation: 96, highlights: -10,
    },
    css: "contrast(1.15) saturate(0.96) hue-rotate(8deg) brightness(0.98)",
  },
  {
    id: "warm-sunset",
    name: "อบอุ่นซันเซ็ต",
    desc: "โทนส้มอ่อน ไฟอบอุ่น ดูนุ่มนวล",
    params: {
      temp: 20, gainR: 0.06, gammaG: 0.03,
      saturation: 110, highlights: 8, contrast: 102,
    },
    css: "saturate(1.1) sepia(0.2) brightness(1.03)",
  },
  {
    id: "vintage-film",
    name: "ฟิล์มวินเทจ",
    desc: "กระจุยนิดๆ สีซีด เหมือนฟิล์มเก่า",
    params: {
      fade: 35, grain: 30, vignette: 25, liftM: 0.06,
      saturation: 85, contrast: 95, sepia: 15, temp: 8,
    },
    css: "sepia(0.35) contrast(0.95) saturate(0.85) brightness(1.05)",
  },
  {
    id: "bw-classic",
    name: "ขาวดำคลาสสิก",
    desc: "ขาวดำนุ่ม เรียบหรู",
    params: { grayscale: 100, contrast: 108, grain: 8 },
    css: "grayscale(1) contrast(1.08)",
  },
  {
    id: "bw-punch",
    name: "ขาวดำคมชัด",
    desc: "ขาวดำคอนทราสต์สูง ดุดัน",
    params: { grayscale: 100, contrast: 138, shadows: -22, highlights: 10, vignette: 20 },
    css: "grayscale(1) contrast(1.35) brightness(0.97)",
  },
  {
    id: "dark-drama",
    name: "ดราม่ามืด",
    desc: "เงาเข้ม โทนหนังสยองขวัญ",
    params: {
      liftB: 0.08, liftG: 0.03, gainR: 0.05,
      contrast: 118, saturation: 86, shadows: -25, vignette: 30,
    },
    css: "contrast(1.18) saturate(0.86) brightness(0.94) hue-rotate(-6deg)",
  },
  {
    id: "golden-hour",
    name: "โกลเด้นอาวร์",
    desc: "แสงบ่ายทองอร่าม เหมือนตอนเย็น",
    params: {
      temp: 25, highlights: 12, gainR: 0.05, gainG: 0.02,
      saturation: 108, fade: 10, contrast: 104,
    },
    css: "sepia(0.3) saturate(1.15) brightness(1.06)",
  },
  {
    id: "cyberpunk",
    name: "ไซเบอร์พังก์",
    desc: "ม่วงนีออน ฟิวเจอร์ จัดจ้าน",
    params: {
      liftB: 0.1, liftR: 0.03, gainR: 0.1, gainG: -0.05,
      saturation: 130, contrast: 115, vignette: 20, temp: -8, hue: -10,
    },
    css: "saturate(1.35) contrast(1.15) hue-rotate(-12deg) brightness(0.97)",
  },
  {
    id: "pastel-dream",
    name: "พาสเทลฝันหวาน",
    desc: "สีอ่อนละมุน เหมือนละครโรแมนติก",
    params: {
      liftM: 0.08, fade: 25, saturation: 88, contrast: 92,
      gammaM: 0.06, temp: 6,
    },
    css: "brightness(1.08) saturate(0.88) contrast(0.92)",
  },
  {
    id: "forest",
    name: "ฟอเรสต์",
    desc: "เขียวลึก เหมาะกับธรรมชาติ",
    params: {
      liftG: 0.05, liftB: 0.03, gainG: 0.04,
      temp: -8, saturation: 106, shadows: -10, contrast: 106,
    },
    css: "saturate(1.06) hue-rotate(6deg) contrast(1.06)",
  },
  {
    id: "vivid-pop",
    name: "ป๊อปสดใส",
    desc: "สีจัดเต็ม คมชัด สไตล์วล็อก",
    params: { saturation: 135, contrast: 112, brightness: 104, sharpen: 25 },
    css: "saturate(1.35) contrast(1.12) brightness(1.04)",
  },
  {
    id: "noir",
    name: "นอยร์",
    desc: "ขาวดำนักสืบ เงามืดจัด",
    params: {
      grayscale: 100, contrast: 128, vignette: 45, grain: 20, shadows: -25, fade: 8,
    },
    css: "grayscale(1) contrast(1.28) brightness(0.95)",
  },
];

// ---------------------------------------------------------------------------
// Curves → LUT
// ---------------------------------------------------------------------------

function identityLut(): Uint8Array {
  const a = new Uint8Array(256);
  for (let i = 0; i < 256; i++) a[i] = i;
  return a;
}

/** Monotone cubic interpolation (Fritsch–Carlson) through control points */
export function sampleCurve(points: CurvePt[], x: number): number {
  if (!points || points.length === 0) return x;
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  if (pts.length === 1) return pts[0][1];
  const n = pts.length;
  const dxs: number[] = [];
  const dys: number[] = [];
  const ms: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dy = pts[i + 1][1] - pts[i][1];
    dxs.push(dx);
    dys.push(dy);
    ms.push(dx === 0 ? 0 : dy / dx);
  }
  const c1s = [ms[0]];
  for (let i = 0; i < dxs.length - 1; i++) {
    const m = ms[i];
    const mNext = ms[i + 1];
    if (m * mNext <= 0) {
      c1s.push(0);
    } else {
      const dx = dxs[i];
      const dxNext = dxs[i + 1];
      const common = dx + dxNext;
      c1s.push((3 * common) / ((common + dxNext) / m + (common + dx) / mNext));
    }
  }
  c1s.push(ms[ms.length - 1]);

  // find segment
  if (x <= pts[0][0]) {
    const slope = ms[0];
    return clamp01(pts[0][1] + slope * (x - pts[0][0]));
  }
  if (x >= pts[n - 1][0]) {
    const slope = ms[ms.length - 1];
    return clamp01(pts[n - 1][1] + slope * (x - pts[n - 1][0]));
  }
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (hi + lo) >> 1;
    if (pts[mid][0] > x) hi = mid;
    else lo = mid;
  }
  const dx = dxs[lo];
  const t = (x - pts[lo][0]) / dx;
  const h00 = (1 + 2 * t) * (1 - t) * (1 - t);
  const h10 = t * (1 - t) * (1 - t);
  const h01 = t * t * (3 - 2 * t);
  const h11 = t * t * (t - 1);
  return clamp01(
    h00 * pts[lo][1] + h10 * dx * c1s[lo] + h01 * pts[lo + 1][1] + h11 * dx * c1s[lo + 1]
  );
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface CurveLut {
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
  key: string;
}

const lutCache = new Map<string, CurveLut>();

/** Build (cached) 256-entry per-channel LUT composing master curve with channel curves */
export function buildCurveLut(curves: GradeCurves | null | undefined): CurveLut | null {
  if (!curves || (!curves.master && !curves.r && !curves.g && !curves.b)) return null;
  const key = JSON.stringify(curves);
  const cached = lutCache.get(key);
  if (cached) return cached;

  const master = curves.master && curves.master.length >= 2 ? curves.master : null;
  const base = new Uint8Array(256);
  if (master) {
    for (let i = 0; i < 256; i++) base[i] = Math.round(clamp01(sampleCurve(master, i / 255)) * 255);
  } else {
    for (let i = 0; i < 256; i++) base[i] = i;
  }
  const apply = (pts?: CurvePt[] | null): Uint8Array => {
    const out = new Uint8Array(256);
    if (!pts || pts.length < 2) {
      out.set(base);
      return out;
    }
    for (let i = 0; i < 256; i++) {
      const v = base[i] / 255;
      out[i] = Math.round(clamp01(sampleCurve(pts, v)) * 255);
    }
    return out;
  };
  const lut: CurveLut = {
    r: apply(curves.r),
    g: apply(curves.g),
    b: apply(curves.b),
    key,
  };
  if (lutCache.size > 40) lutCache.clear();
  lutCache.set(key, lut);
  return lut;
}

/** Build RGBA pixels (256x1) for LUT texture upload */
export function lutToRgba(lut: CurveLut): Uint8Array {
  const px = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    px[i * 4] = lut.r[i];
    px[i * 4 + 1] = lut.g[i];
    px[i * 4 + 2] = lut.b[i];
    px[i * 4 + 3] = 255;
  }
  return px;
}

export function curvesEqual(a: GradeCurves | null | undefined, b: GradeCurves | null | undefined): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

// ---------------------------------------------------------------------------
// Color wheel math
// ---------------------------------------------------------------------------

/** Convert wheel drag position (angle deg, radius 0..1) to RGB offset */
export function wheelToOffset(angleDeg: number, radius: number, maxOff = 0.25): { r: number; g: number; b: number } {
  const h = (((angleDeg % 360) + 360) % 360) / 60;
  const c = 1 - Math.abs((h % 2) - 1);
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1) { r = 1; g = c; }
  else if (h < 2) { r = c; g = 1; }
  else if (h < 3) { g = 1; b = c; }
  else if (h < 4) { g = c; b = 1; }
  else if (h < 5) { r = c; b = 1; }
  else { r = 1; b = c; }
  // convert pure hue (0..1) to signed offset around 0.5
  const k = radius * maxOff * 2;
  return {
    r: (r - 0.5) * k,
    g: (g - 0.5) * k,
    b: (b - 0.5) * k,
  };
}

/** Recover wheel position from an RGB offset (approximate) */
export function offsetToWheel(o: { r: number; g: number; b: number }, maxOff = 0.25): { angle: number; radius: number } {
  const mag = Math.max(Math.abs(o.r), Math.abs(o.g), Math.abs(o.b));
  if (mag < 0.004) return { angle: 0, radius: 0 };
  const radius = Math.min(1, mag / maxOff);
  // reconstruct hue from normalized rgb
  const inv = mag > 0 ? 1 / mag : 0;
  const r = clamp01((o.r * inv + 1) / 2);
  const g = clamp01((o.g * inv + 1) / 2);
  const b = clamp01((o.b * inv + 1) / 2);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0.0001) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { angle: (h + 360) % 360, radius };
}

// ---------------------------------------------------------------------------
// Grade state helpers
// ---------------------------------------------------------------------------

export function isGraded(p: ClipProps): boolean {
  return (
    p.brightness !== 100 || p.contrast !== 100 || p.saturation !== 100 ||
    p.hue !== 0 || p.grayscale !== 0 || p.sepia !== 0 ||
    p.liftM !== 0 || p.liftR !== 0 || p.liftG !== 0 || p.liftB !== 0 ||
    p.gammaM !== 0 || p.gammaR !== 0 || p.gammaG !== 0 || p.gammaB !== 0 ||
    p.gainM !== 0 || p.gainR !== 0 || p.gainG !== 0 || p.gainB !== 0 ||
    p.temp !== 0 || p.tint !== 0 || p.highlights !== 0 || p.shadows !== 0 ||
    p.fade !== 0 || p.vignette !== 0 || p.grain !== 0 || p.sharpen !== 0 ||
    !!p.curves
  );
}

/** CSS approximation (fallback when WebGL is unavailable) */
export function cssApprox(p: ClipProps): string {
  const parts: string[] = [];
  if (p.brightness !== 100) parts.push(`brightness(${p.brightness}%)`);
  if (p.contrast !== 100) parts.push(`contrast(${p.contrast}%)`);
  if (p.saturation !== 100) parts.push(`saturate(${p.saturation}%)`);
  if (p.hue !== 0) parts.push(`hue-rotate(${p.hue}deg)`);
  if (p.grayscale > 0) parts.push(`grayscale(${p.grayscale}%)`);
  if (p.sepia > 0) parts.push(`sepia(${p.sepia}%)`);
  if (p.temp !== 0) parts.push(`sepia(${Math.min(35, Math.abs(p.temp) * 0.28)}%)`);
  if (p.fade > 0) parts.push(`contrast(${100 - p.fade * 0.2}%) brightness(${100 + p.fade * 0.12}%)`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Grade clipboard + custom user looks (localStorage)
// ---------------------------------------------------------------------------

let gradeClipboard: GradePatch | null = null;

export function copyGrade(p: ClipProps) {
  const patch: Record<string, unknown> = {};
  for (const k of GRADE_KEYS) patch[k] = Array.isArray(p[k]) ? structuredClone(p[k]) : p[k];
  gradeClipboard = patch as GradePatch;
}

export function pasteGrade(): GradePatch | null {
  if (!gradeClipboard) return null;
  const patch: Record<string, unknown> = {};
  for (const k of GRADE_KEYS) patch[k] = Array.isArray(gradeClipboard[k]) ? structuredClone(gradeClipboard[k]) : gradeClipboard[k];
  return patch as GradePatch;
}

export function hasGradeClipboard(): boolean {
  return gradeClipboard !== null;
}

export interface UserLook {
  id: string;
  name: string;
  params: GradePatch;
}

const LS_KEY = "cutpro-user-looks";

export function loadUserLooks(): UserLook[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as UserLook[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveUserLooks(list: UserLook[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* storage full/unavailable */
  }
}

export function addUserLook(name: string, params: GradePatch): UserLook[] {
  const list = loadUserLooks();
  const look: UserLook = { id: `u${Date.now().toString(36)}`, name, params };
  list.unshift(look);
  if (list.length > 24) list.pop();
  saveUserLooks(list);
  return list;
}

export function removeUserLook(id: string): UserLook[] {
  const list = loadUserLooks().filter((l) => l.id !== id);
  saveUserLooks(list);
  return list;
}
