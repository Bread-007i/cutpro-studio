// WebGL GPU color-grading engine.
// Renders one media source (video frame / image / canvas) through a full
// professional grading shader (lift/gamma/gain wheels, curves LUT, temp/tint,
// highlights/shadows, contrast, saturation, hue, fade, vignette, grain,
// sharpen, blur, before/after split) into an offscreen GL canvas.

import type { ClipProps, GradePatch } from "./types";
import { DEFAULT_PROPS } from "./types";
import { buildCurveLut, lutToRgba } from "./color";

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uLut;
uniform float uHasLut;
uniform vec2 uTexel;
uniform float uBlur;
uniform float uSharpen;
uniform float uBrightness;
uniform float uContrast;
uniform float uPivot;
uniform float uSat;
uniform float uHue;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform vec3 uTemp;
uniform vec2 uHiSh;
uniform float uFade;
uniform float uVignette;
uniform float uGrain;
uniform float uGray;
uniform float uSepia;
uniform float uTime;
uniform float uSplit;

mat3 hueMat(float a) {
  float ca = cos(a);
  float sa = sin(a);
  return mat3(
    0.213 + ca*0.787 - sa*0.213, 0.213 - ca*0.213 + sa*0.143, 0.213 - ca*0.213 - sa*0.787,
    0.715 - ca*0.715 - sa*0.715, 0.715 + ca*0.285 + sa*0.140, 0.715 - ca*0.715 + sa*0.715,
    0.072 - ca*0.072 + sa*0.928, 0.072 - ca*0.072 - sa*0.283, 0.072 + ca*0.928 + sa*0.072
  );
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 blurSample(vec2 uv, float radius) {
  if (radius <= 0.001) return texture2D(uTex, uv).rgb;
  vec2 o = uTexel * radius;
  vec3 sum = texture2D(uTex, uv).rgb * 4.0;
  sum += texture2D(uTex, uv + vec2(o.x, 0.0)).rgb * 2.0;
  sum += texture2D(uTex, uv - vec2(o.x, 0.0)).rgb * 2.0;
  sum += texture2D(uTex, uv + vec2(0.0, o.y)).rgb * 2.0;
  sum += texture2D(uTex, uv - vec2(0.0, o.y)).rgb * 2.0;
  sum += texture2D(uTex, uv + o).rgb;
  sum += texture2D(uTex, uv - o).rgb;
  sum += texture2D(uTex, uv + vec2(o.x, -o.y)).rgb;
  sum += texture2D(uTex, uv + vec2(-o.x, o.y)).rgb;
  return sum / 16.0;
}

void main() {
  vec3 c = blurSample(vUv, uBlur);

  if (uSharpen > 0.001) {
    vec2 o = uTexel * 1.2;
    vec3 avg = (
      texture2D(uTex, vUv + vec2(o.x, 0.0)).rgb +
      texture2D(uTex, vUv - vec2(o.x, 0.0)).rgb +
      texture2D(uTex, vUv + vec2(0.0, o.y)).rgb +
      texture2D(uTex, vUv - vec2(0.0, o.y)).rgb
    ) * 0.25;
    c += (c - avg) * uSharpen * 1.6;
  }

  vec3 raw = c; // untouched copy for before/after compare

  c *= uBrightness;
  c *= uTemp;

  // lift (shadows) — tapers off in highlights
  c += uLift * (1.0 - c);
  // gamma (midtones)
  c = pow(max(c, vec3(0.0)), uGamma);
  // gain (highlights)
  c *= uGain;

  // contrast around pivot
  c = (c - uPivot) * uContrast + uPivot;

  // highlights / shadows (luma-masked)
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += vec3(uHiSh.x) * smoothstep(0.45, 1.0, l) * 0.35;
  c += vec3(uHiSh.y) * (1.0 - smoothstep(0.0, 0.55, l)) * 0.35;

  // saturation
  l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);

  // hue rotation
  if (abs(uHue) > 0.001) c = hueMat(uHue) * c;

  // film fade (lifted blacks)
  c = mix(c, c * 0.78 + 0.13, uFade);

  // vignette
  float d = distance(vUv, vec2(0.5));
  c *= 1.0 - uVignette * smoothstep(0.32, 0.98, d);

  // film grain
  if (uGrain > 0.001) {
    float n = hash(vUv * vec2(1613.0, 1271.0) + fract(uTime) * 91.7);
    c += (n - 0.5) * uGrain * 0.14;
  }

  // curves LUT (per channel, composed with master)
  if (uHasLut > 0.5) {
    c.r = texture2D(uLut, vec2(clamp(c.r, 0.004, 0.996), 0.5)).r;
    c.g = texture2D(uLut, vec2(clamp(c.g, 0.004, 0.996), 0.5)).g;
    c.b = texture2D(uLut, vec2(clamp(c.b, 0.004, 0.996), 0.5)).b;
  }

  // grayscale / sepia
  if (uGray > 0.001) {
    c = mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))), uGray);
  }
  if (uSepia > 0.001) {
    vec3 s = vec3(
      dot(c, vec3(0.393, 0.769, 0.189)),
      dot(c, vec3(0.349, 0.686, 0.168)),
      dot(c, vec3(0.272, 0.534, 0.131))
    );
    c = mix(c, s, uSepia);
  }

  // before/after split
  if (uSplit >= 0.0 && vUv.x < uSplit) c = raw;

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

type TexSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

class Grader {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private locs = new Map<string, WebGLUniformLocation | null>();
  private tex: WebGLTexture | null = null;
  private lutTex: WebGLTexture | null = null;
  private lutKey = "";
  private w = 0;
  private h = 0;
  available = false;

  private init(): boolean {
    if (this.gl) return true;
    try {
      const canvas = document.createElement("canvas");
      const gl = (canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      }) ?? canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      if (!gl) return false;

      const compile = (type: number, src: string) => {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(sh) ?? "shader compile failed");
        }
        return sh;
      };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(prog) ?? "link failed");
      }
      this.program = prog;
      this.gl = gl;
      this.canvas = canvas;

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      this.lutTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      this.available = true;
      return true;
    } catch (e) {
      console.warn("[grader] WebGL init failed, falling back to CSS filters", e);
      this.available = false;
      return false;
    }
  }

  private loc(name: string): WebGLUniformLocation | null {
    if (!this.gl || !this.program) return null;
    if (!this.locs.has(name)) this.locs.set(name, this.gl.getUniformLocation(this.program, name));
    return this.locs.get(name) ?? null;
  }

  private resize(w: number, h: number) {
    if (!this.gl || !this.canvas) return;
    if (this.w === w && this.h === h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    glViewportSafe(this.gl, 0, 0, w, h);
  }

  /** Pre-initialize GL (e.g. on app mount to know availability) */
  warmup(): boolean {
    return this.init();
  }

  /** Render `src` graded into the internal GL canvas. Returns the canvas or null on failure. */
  process(
    src: TexSource,
    p: ClipProps,
    opts: { w: number; h: number; split?: number; time?: number; cacheKey?: string }
  ): HTMLCanvasElement | null {
    if (!this.init() || !this.gl || !this.program || !this.canvas) return null;
    const gl = this.gl;
    this.resize(Math.max(2, opts.w), Math.max(2, opts.h));
    gl.useProgram(this.program);

    // upload source texture (videos every frame; images too — cheap and always correct)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch {
      return null;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

    // LUT texture
    const lut = buildCurveLut(p.curves);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    const hasLut = lut ? 1 : 0;
    if (lut && lut.key !== this.lutKey) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutToRgba(lut));
      this.lutKey = lut.key;
    }

    // uniforms
    const u = (n: string) => this.loc(n);
    gl.uniform1i(u("uTex"), 0);
    gl.uniform1i(u("uLut"), 1);
    gl.uniform1f(u("uHasLut"), hasLut);
    gl.uniform2f(u("uTexel"), 1 / this.w, 1 / this.h);
    const scaleF = this.h / 1080;
    gl.uniform1f(u("uBlur"), p.blur > 0 ? Math.max(1, p.blur * scaleF) : 0);
    gl.uniform1f(u("uSharpen"), p.sharpen / 100);
    gl.uniform1f(u("uBrightness"), p.brightness / 100);
    gl.uniform1f(u("uContrast"), p.contrast / 100);
    gl.uniform1f(u("uPivot"), 0.45);
    gl.uniform1f(u("uSat"), p.saturation / 100);
    gl.uniform1f(u("uHue"), (p.hue * Math.PI) / 180);

    const lift = (m: number, w: number) => Math.max(-0.6, Math.min(0.6, m * 0.35 + w));
    gl.uniform3f(u("uLift"), lift(p.liftM, p.liftR), lift(p.liftM, p.liftG), lift(p.liftM, p.liftB));
    const gexp = (m: number, w: number) => 1 / Math.max(0.12, Math.min(8, 1 + m * 0.9 + w));
    gl.uniform3f(u("uGamma"), gexp(p.gammaM, p.gammaR), gexp(p.gammaM, p.gammaG), gexp(p.gammaM, p.gammaB));
    const gmul = (m: number, w: number) => Math.max(0.05, Math.min(2.5, 1 + m * 0.6 + w));
    gl.uniform3f(u("uGain"), gmul(p.gainM, p.gainR), gmul(p.gainM, p.gainG), gmul(p.gainM, p.gainB));

    const t = p.temp / 100;
    const ti = p.tint / 100;
    gl.uniform3f(u("uTemp"), 1 + t * 0.18, 1 - ti * 0.15, 1 - t * 0.18);

    gl.uniform2f(u("uHiSh"), p.highlights / 100, p.shadows / 100);
    gl.uniform1f(u("uFade"), p.fade / 100);
    gl.uniform1f(u("uVignette"), p.vignette / 100);
    gl.uniform1f(u("uGrain"), p.grain / 100);
    gl.uniform1f(u("uGray"), p.grayscale / 100);
    gl.uniform1f(u("uSepia"), p.sepia / 100);
    gl.uniform1f(u("uTime"), (opts.time ?? 0) % 60);
    gl.uniform1f(u("uSplit"), opts.split ?? -1);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }

  /** Static-image render convenience → data URL (for look tiles) */
  renderPreview(
    img: HTMLImageElement,
    patch: GradePatch,
    w: number,
    h: number,
    cacheKey?: string
  ): string | null {
    if (!this.init()) return null;
    const full = { ...DEFAULT_PROPS, ...patch } as ClipProps;
    const out = this.process(img, full, { w, h, cacheKey });
    if (!out) return null;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(out, 0, 0, w, h);
    try {
      return c.toDataURL("image/jpeg", 0.82);
    } catch {
      return null;
    }
  }
}

function glViewportSafe(gl: WebGLRenderingContext, x: number, y: number, w: number, h: number) {
  gl.viewport(x, y, w, h);
}

export const grader = new Grader();
