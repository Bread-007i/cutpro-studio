"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronFirst,
  ChevronLast,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { audioGraph } from "@/lib/editor/audioGraph";
import fixWebm from "webm-duration-fix";
import { playerBus } from "@/lib/editor/playerBus";
import { getDuration, useEditor } from "@/lib/editor/store";
import type { AspectRatio, Clip } from "@/lib/editor/types";
import { ASPECT_DIMS } from "@/lib/editor/types";
import { clamp, fadeFactor, formatTimeFull } from "@/lib/editor/utils";
import { cssApprox, isGraded, copyGrade, NEUTRAL_GRADE } from "@/lib/editor/color";
import { grader } from "@/lib/editor/glGrade";
import { toast } from "sonner";

type MediaEl = HTMLVideoElement | HTMLAudioElement | HTMLImageElement;

export default function PreviewPlayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timeLabelRef = useRef<HTMLSpanElement>(null);
  const elementsRef = useRef<Map<string, MediaEl>>(new Map());

  // refs mirroring store for the rAF loop
  const timeRef = useRef(0);
  const lastTsRef = useRef(0);
  const lastPushRef = useRef(0);
  const exportingRef = useRef(false);
  const renderSizeRef = useRef({ w: 1920, h: 1080 });

  const playing = useEditor((s) => s.playing);
  const aspect = useEditor((s) => s.aspect);
  const duration = useEditor(getDuration);
  const [glOk, setGlOk] = useState<boolean | null>(null);

  // probe WebGL once on mount for the fallback badge
  useEffect(() => {
    setGlOk(grader.warmup());
  }, []);

  // ---- dynamic render resolution ---------------------------------------------

  const applyRenderSize = useCallback(
    (fullRes = false) => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas) return;
      const dims = ASPECT_DIMS[useEditor.getState().aspect];
      if (fullRes || exportingRef.current) {
        canvas.width = dims.w;
        canvas.height = dims.h;
        renderSizeRef.current = { w: dims.w, h: dims.h };
        return;
      }
      const rect = wrap?.getBoundingClientRect();
      const availW = Math.max(200, (rect?.width ?? 640) - 20);
      const availH = Math.max(120, (rect?.height ?? 360) - 20);
      const fit = Math.min(availW / dims.w, availH / dims.h);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.round(dims.w * fit * dpr);
      const w = Math.max(320, Math.min(1920, targetW));
      const h = Math.round((w * dims.h) / dims.w);
      canvas.width = w;
      canvas.height = h;
      renderSizeRef.current = { w, h };
    },
    []
  );

  useEffect(() => {
    applyRenderSize();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applyRenderSize());
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [applyRenderSize]);

  // re-render sizing when aspect changes
  useEffect(() => {
    if (!exportingRef.current) applyRenderSize();
  }, [aspect, applyRenderSize]);

  // when paused, external playhead changes should be reflected
  useEffect(() => {
    if (!playing && !exportingRef.current) {
      timeRef.current = useEditor.getState().playhead;
    }
  }, [playing]);

  // register canvas for scopes (histogram)
  useEffect(() => {
    playerBus.canvas = canvasRef.current;
    return () => {
      if (playerBus.canvas === canvasRef.current) playerBus.canvas = null;
    };
  }, []);

  // ---- element management -----------------------------------------------------

  const ensureElement = useCallback((clip: Clip): MediaEl | undefined => {
    const s = useEditor.getState();
    const media = s.media.find((m) => m.id === clip.mediaId);
    if (!media && clip.kind !== "text") return undefined;
    let el = elementsRef.current.get(clip.id);
    if (el) return el;
    if (clip.kind === "text") return undefined;
    if (!media) return undefined;
    if (media.type === "image") {
      const img = new Image();
      img.src = media.url;
      el = img;
    } else if (media.type === "audio") {
      const a = document.createElement("audio");
      a.src = media.url;
      a.preload = "auto";
      el = a;
    } else {
      const v = document.createElement("video");
      v.src = media.url;
      v.preload = "auto";
      v.playsInline = true;
      el = v;
    }
    elementsRef.current.set(clip.id, el);
    return el;
  }, []);

  // cleanup elements of deleted clips
  useEffect(() => {
    const s = useEditor.getState();
    const ids = new Set(s.clips.map((c) => c.id));
    for (const [clipId, el] of elementsRef.current) {
      if (!ids.has(clipId)) {
        if (!(el instanceof HTMLImageElement)) el.pause();
        elementsRef.current.delete(clipId);
        audioGraph.drop(clipId);
      }
    }
  });

  // ---- sync + draw -----------------------------------------------------------

  const syncMedia = useCallback((t: number, isPlaying: boolean) => {
    const s = useEditor.getState();
    const active = s.clips.filter((c) => t >= c.start && t < c.start + c.duration);
    const activeIds = new Set(active.map((c) => c.id));

    for (const [clipId, el] of elementsRef.current) {
      if (!activeIds.has(clipId)) {
        if (!(el instanceof HTMLImageElement) && !el.paused) el.pause();
        audioGraph.setGain(clipId, 0);
      }
    }

    for (const clip of active) {
      if (clip.kind === "text") continue;
      const el = ensureElement(clip);
      if (!el || el instanceof HTMLImageElement) continue;
      if (el.readyState < 1) continue;

      const local = clip.inPoint + (t - clip.start) * clip.props.speed;
      const drift = Math.abs(el.currentTime - local);
      if (drift > (isPlaying ? 0.14 : 0.033)) {
        try {
          el.currentTime = local;
        } catch {
          /* noop */
        }
      }
      const rate = clamp(clip.props.speed, 0.1, 8);
      if (el.playbackRate !== rate) el.playbackRate = rate;

      const track = s.tracks.find((tr) => tr.id === clip.trackId);
      const muted = clip.props.muted || track?.muted || false;
      const fade = fadeFactor(clip, t);
      const gain = muted ? 0 : clamp(clip.props.volume * fade, 0, 2);

      audioGraph.ensure(clip.id, el);
      audioGraph.setGain(clip.id, gain);
      // fallback when WebAudio unavailable
      if (!audioGraph.context) el.volume = clamp(gain, 0, 1);

      if (isPlaying) {
        if (el.paused) el.play().catch(() => {});
      } else if (!el.paused) {
        el.pause();
      }
    }
  }, [ensureElement]);

  const drawClip = useCallback((ctx: CanvasRenderingContext2D, clip: Clip, t: number, W: number, H: number, split: number) => {
    const p = clip.props;
    const fade = fadeFactor(clip, t);
    const alpha = clamp(p.opacity * fade, 0, 1);
    if (alpha <= 0.001) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    const scaleF = H / 1080;

    if (clip.kind === "text") {
      const fontSize = p.fontSize * scaleF;
      ctx.font = `${p.fontWeight} ${fontSize}px "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif`;
      ctx.textAlign = p.align;
      ctx.textBaseline = "middle";
      const cx = W / 2 + p.x * W;
      const cy = H / 2 + p.y * H;
      const lines = (p.text || "").split("\n");
      const lineHeight = fontSize * 1.3;
      const totalH = lineHeight * lines.length;
      const widths = lines.map((l) => ctx.measureText(l).width);
      const maxW = Math.max(...widths, 1);

      if (p.textBg > 0) {
        const padX = fontSize * 0.35;
        const padY = fontSize * 0.22;
        let bgX = cx - maxW / 2 - padX;
        if (p.align === "left") bgX = cx - padX;
        if (p.align === "right") bgX = cx - maxW - padX;
        ctx.fillStyle = `rgba(0,0,0,${p.textBg})`;
        ctx.fillRect(bgX, cy - totalH / 2 - padY, maxW + padX * 2, totalH + padY * 2);
      }

      lines.forEach((line, i) => {
        const y = cy - totalH / 2 + lineHeight * (i + 0.5);
        if (p.stroke) {
          ctx.lineWidth = fontSize * 0.09;
          ctx.strokeStyle = "rgba(0,0,0,0.85)";
          ctx.lineJoin = "round";
          ctx.strokeText(line, cx, y);
        }
        ctx.fillStyle = p.color;
        ctx.fillText(line, cx, y);
      });
      ctx.restore();
      return;
    }

    const el = elementsRef.current.get(clip.id);
    if (!el) {
      ctx.restore();
      return;
    }
    if (el instanceof HTMLImageElement) {
      if (!el.complete || el.naturalWidth === 0) {
        ctx.restore();
        return;
      }
    } else if (el instanceof HTMLVideoElement && el.readyState < 2) {
      ctx.restore();
      return;
    }

    const mw = el instanceof HTMLImageElement ? el.naturalWidth : (el as HTMLVideoElement).videoWidth;
    const mh = el instanceof HTMLImageElement ? el.naturalHeight : (el as HTMLVideoElement).videoHeight;
    if (!mw || !mh) {
      ctx.restore();
      return;
    }

    const base = p.fit === "cover" ? Math.max(W / mw, H / mh) : Math.min(W / mw, H / mh);
    const dw = mw * base * p.scale;
    const dh = mh * base * p.scale;

    ctx.translate(W / 2 + p.x * W, H / 2 + p.y * H);
    ctx.rotate((p.rotation * Math.PI) / 180);

    const media = useEditor.getState().media.find((m) => m.id === clip.mediaId);
    const cacheKey = el instanceof HTMLImageElement ? media?.id : undefined;
    const graded = grader.available
      ? grader.process(el as Exclude<MediaEl, HTMLAudioElement>, p, {
          w: W,
          h: H,
          split,
          time: t,
          cacheKey,
        })
      : null;

    if (graded) {
      if (p.blur > 0) ctx.filter = `blur(${(p.blur * scaleF).toFixed(2)}px)`;
      try {
        ctx.drawImage(graded, -dw / 2, -dh / 2, dw, dh);
      } catch {
        /* frame not ready */
      }
    } else {
      // WebGL unavailable — CSS approximation fallback
      const css: string[] = [];
      const approx = cssApprox(p);
      if (approx) css.push(approx);
      if (p.blur > 0) css.push(`blur(${(p.blur * scaleF).toFixed(2)}px)`);
      ctx.filter = css.length ? css.join(" ") : "none";
      try {
        ctx.drawImage(el as CanvasImageSource, -dw / 2, -dh / 2, dw, dh);
      } catch {
        /* frame not ready */
      }
    }
    ctx.restore();
  }, []);

  const draw = useCallback((t: number, split: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const s = useEditor.getState();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const videoTracks = s.tracks.filter((tr) => tr.type === "video" && !tr.hidden);
    const textTracks = s.tracks.filter((tr) => tr.type === "text" && !tr.hidden);

    // draw bottom lanes first so top lanes overlay them
    for (let i = videoTracks.length - 1; i >= 0; i--) {
      const track = videoTracks[i];
      const clips = s.clips
        .filter((c) => c.trackId === track.id && t >= c.start && t < c.start + c.duration)
        .sort((a, b) => a.start - b.start);
      for (const clip of clips) drawClip(ctx, clip, t, W, H, split);
    }
    for (let i = textTracks.length - 1; i >= 0; i--) {
      const track = textTracks[i];
      const clips = s.clips
        .filter((c) => c.trackId === track.id && t >= c.start && t < c.start + c.duration)
        .sort((a, b) => a.start - b.start);
      for (const clip of clips) drawClip(ctx, clip, t, W, H, split);
    }

    // before/after divider
    if (split >= 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      const x = Math.round(W * split);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(1, Math.round(H / 540));
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      const fs = Math.max(11, Math.round(H * 0.028));
      ctx.font = `600 ${fs}px "Noto Sans Thai", sans-serif`;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x + 6, 6, fs * 4.6, fs * 1.6);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("ก่อนเกรด", x + 6 + fs * 0.3, 6 + fs * 0.28);
    }
  }, [drawClip]);

  // ---- main loop -------------------------------------------------------------

  useEffect(() => {
    let raf = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      const s = useEditor.getState();
      const isPlaying = (s.playing || exportingRef.current) && lastTsRef.current > 0;
      const dt = lastTsRef.current > 0 ? (ts - lastTsRef.current) / 1000 : 0;
      lastTsRef.current = ts;

      if (isPlaying && dt > 0 && dt < 0.5) {
        let t = timeRef.current + dt;
        const dur = getDuration(s);
        if (t >= dur) {
          t = dur;
          timeRef.current = t;
          if (exportingRef.current) {
            // let the export loop handle stopping
          } else {
            s.setPlaying(false);
            s.setPlayhead(t);
            updateTimeLabel(t);
          }
        } else {
          timeRef.current = t;
          if (ts - lastPushRef.current > 33) {
            lastPushRef.current = ts;
            s.setPlayhead(t);
            updateTimeLabel(t);
          }
        }
      }

      const drawT = exportingRef.current || s.playing ? timeRef.current : s.playhead;
      if (!s.playing && !exportingRef.current) timeRef.current = s.playhead;
      syncMedia(drawT, s.playing || exportingRef.current);
      draw(drawT, s.compare && !exportingRef.current ? 0.5 : -1);
    };
    const updateTimeLabel = (t: number) => {
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = formatTimeFull(t);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw, syncMedia]);

  // ---- transport controls ------------------------------------------------------

  const togglePlay = () => {
    const s = useEditor.getState();
    const dur = getDuration(s);
    if (!s.playing && s.playhead >= dur - 0.01) {
      s.setPlayhead(0);
      timeRef.current = 0;
    }
    // wake WebAudio inside the user gesture
    const dummy = document.createElement("audio");
    audioGraph.ensure("wake", dummy);
    audioGraph.drop("wake");
    s.togglePlay();
  };

  const seek = (t: number) => {
    const s = useEditor.getState();
    const dur = getDuration(s);
    const nt = clamp(t, 0, dur);
    s.setPlayhead(nt);
    timeRef.current = nt;
    if (timeLabelRef.current) timeLabelRef.current.textContent = formatTimeFull(nt);
  };

  const snapshotFrame = (copy: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        if (copy) {
          try {
            const item = new ClipboardItem({ "image/png": blob });
            await navigator.clipboard.write([item]);
            toast.success("คัดลอกเฟรมไปคลิปบอร์ดแล้ว");
          } catch {
            toast.error("เบราว์เซอร์ไม่อนุญาตให้คัดลอกรูป ลองบันทึกเป็นไฟล์แทน");
          }
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `frame-${formatTimeFull(useEditor.getState().playhead).replace(/[:]/g, "-")}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          toast.success("บันทึกเฟรมเป็นภาพ PNG แล้ว");
        }
      }, "image/png");
    } catch {
      toast.error("บันทึกเฟรมไม่สำเร็จ");
    }
  };

  // register player controls for export
  useEffect(() => {
    playerBus.controls = {
      seekTo: (t) => seek(t),
      exportVideo: async (opts, onProgress) => {
        const s = useEditor.getState();
        const dur = getDuration(s);
        if (dur <= 0) throw new Error("ไทม์ไลน์ว่างเปล่า ไม่มีอะไรให้ส่งออก");
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Canvas ไม่พร้อมใช้งาน");

        const dims = ASPECT_DIMS[useEditor.getState().aspect];
        canvas.width = Math.round(dims.w * opts.scale);
        canvas.height = Math.round(dims.h * opts.scale);
        renderSizeRef.current = { w: canvas.width, h: canvas.height };

        // wake audio context (user gesture happened on button click)
        const dummy = document.createElement("audio");
        audioGraph.ensure("wake", dummy);
        audioGraph.drop("wake");

        exportingRef.current = true;
        try {
          // seek to 0 and settle
          seek(0);
          syncMedia(0, false);
          await new Promise((r) => setTimeout(r, 350));

          const videoStream = canvas.captureStream(opts.fps);
          const audioStream = audioGraph.stream();
          const videoTracks = [...videoStream.getVideoTracks()];
          const audioTracks = audioStream ? [...audioStream.getAudioTracks()] : [];

          // Probe: some environments (e.g. headless Chrome without audio output)
          // silently record 0 bytes when an AudioContext track is mixed in.
          let recTracks = videoTracks;
          if (audioTracks.length > 0) {
            try {
              const probeMixed = new MediaStream([...videoTracks, ...audioTracks]);
              const probe = new MediaRecorder(probeMixed);
              const pChunks: Blob[] = [];
              probe.ondataavailable = (e) => {
                if (e.data.size > 0) pChunks.push(e.data);
              };
              probe.start(100);
              await new Promise((r) => setTimeout(r, 450));
              probe.stop();
              await new Promise<void>((resolve) => {
                probe.onstop = () => resolve();
                setTimeout(resolve, 1500);
              });
              if (pChunks.reduce((a, b) => a + b.size, 0) > 0) {
                recTracks = [...videoTracks, ...audioTracks];
                console.info("[export] audio mixing supported");
              } else {
                console.warn("[export] mixed stream records 0 bytes — falling back to video-only");
              }
            } catch {
              console.warn("[export] probe failed — falling back to video-only");
            }
          }

          const recStream = new MediaStream(recTracks);

          const mimeCandidates = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
          ];
          const mimeType =
            mimeCandidates.find((m) =>
              typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)
            ) ?? "";
          const rec = new MediaRecorder(recStream, {
            ...(mimeType ? { mimeType } : {}),
            videoBitsPerSecond: Math.round((opts.bitrate ?? 6_000_000) * opts.scale * opts.scale),
          });
          const chunks: Blob[] = [];
          rec.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };

          const done = new Promise<Blob>((resolve) => {
            rec.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
          });

          rec.start(250);
          timeRef.current = 0;

          await new Promise<void>((resolve) => {
            const step = () => {
              const st = useEditor.getState();
              const durNow = getDuration(st);
              if (!exportingRef.current || timeRef.current >= durNow - 0.001) {
                resolve();
                return;
              }
              onProgress(clamp(timeRef.current / durNow, 0, 1));
              st.setPlayhead(timeRef.current);
              requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          });

          await new Promise((r) => setTimeout(r, 250));
          rec.stop();
          const rawBlob = await done;
          onProgress(1);
          if (rawBlob.size === 0) {
            throw new Error(
              "เบราว์เซอร์นี้บันทึกไม่ได้ (ไม่ได้รับเฟรมจาก canvas) ลองใช้ Chrome เวอร์ชันล่าสุดบนเดสก์ท็อป"
            );
          }
          // repair missing duration metadata from MediaRecorder WebM
          let outBlob = rawBlob;
          try {
            const fixed = await fixWebm(rawBlob);
            if (fixed && fixed.size > 1000 && fixed.size >= rawBlob.size * 0.5) {
              outBlob = fixed;
            }
          } catch (e) {
            console.warn("[export] duration fix failed:", e);
            outBlob = rawBlob;
          }
          return outBlob;
        } finally {
          exportingRef.current = false;
          applyRenderSize();
          seek(0);
        }
      },
    };
    return () => {
      playerBus.controls = null;
    };
  }, [applyRenderSize, syncMedia]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      )
        return;
      const s = useEditor.getState();
      const dur = getDuration(s);
      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seek(s.playhead - (e.shiftKey ? 1 : 1 / 30));
          break;
        case "ArrowRight":
          e.preventDefault();
          seek(s.playhead + (e.shiftKey ? 1 : 1 / 30));
          break;
        case "Home":
          seek(0);
          break;
        case "End":
          seek(dur);
          break;
        case "b":
        case "B":
          s.setCompare(!s.compare);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const compare = useEditor((s) => s.compare);
  const hasSelection = useEditor((s) => !!s.selectedClipId);
  const selectedGraded = useEditor((s) => {
    const c = s.clips.find((x) => x.id === s.selectedClipId);
    return c ? isGraded(c.props) : false;
  });

  const resetGradeSelected = () => {
    const s = useEditor.getState();
    if (!s.selectedClipId) return;
    s.updateClipProps(s.selectedClipId, NEUTRAL_GRADE);
    toast.success("รีเซ็ตเกรดสีคลิปที่เลือกแล้ว");
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0a0e]">
      <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-3">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="relative max-h-full overflow-hidden rounded-lg ring-1 ring-white/10"
              style={{
                aspectRatio: `${ASPECT_DIMS[aspect].w} / ${ASPECT_DIMS[aspect].h}`,
                maxWidth: "100%",
                width: aspect === "9:16" || aspect === "4:5" ? "auto" : "100%",
                height: aspect === "9:16" || aspect === "4:5" ? "100%" : "auto",
              }}
            >
              <canvas
                ref={canvasRef}
                className="h-full w-full bg-black object-contain shadow-2xl"
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            <ContextMenuItem onClick={() => snapshotFrame(false)}>
              บันทึกเฟรมนี้เป็นภาพ PNG
            </ContextMenuItem>
            <ContextMenuItem onClick={() => snapshotFrame(true)}>
              คัดลอกเฟรมไปคลิปบอร์ด
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => useEditor.getState().setCompare(!compare)}>
              {compare ? "ปิดเทียบเกรดสี" : "เทียบเกรดสี ก่อน/หลัง"} (B)
            </ContextMenuItem>
            <ContextMenuItem disabled={!hasSelection} onClick={resetGradeSelected}>
              รีเซ็ตเกรดสีคลิปที่เลือก
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!hasSelection}
              onClick={() => {
                const s = useEditor.getState();
                const c = s.clips.find((x) => x.id === s.selectedClipId);
                if (c) copyGrade(c.props);
              }}
            >
              คัดลอกเกรดสีคลิปที่เลือก
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
      <div className="flex items-center justify-center gap-1 border-t border-white/[0.06] bg-[#101015] px-3 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300" onClick={() => seek(0)} aria-label="ไปต้นคลิป">
          <ChevronFirst className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300" onClick={() => seek((useEditor.getState().playhead) - 1)} aria-label="ย้อน 1 วินาที">
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          className="h-9 w-9 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_0_16px_rgba(168,85,247,0.45)] hover:from-violet-400 hover:to-fuchsia-400"
          onClick={togglePlay}
          aria-label={playing ? "หยุดชั่วคราว" : "เล่น"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300" onClick={() => seek((useEditor.getState().playhead) + 1)} aria-label="ไปข้างหน้า 1 วินาที">
          <SkipForward className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-300"
          onClick={() => seek(duration)}
          aria-label="ไปท้ายคลิป"
        >
          <ChevronLast className="h-4 w-4" />
        </Button>
        <span className="ml-3 font-mono text-xs tabular-nums text-zinc-400">
          <span ref={timeLabelRef} className="text-fuchsia-300">{formatTimeFull(useEditor.getState().playhead)}</span> / {formatTimeFull(duration)}
        </span>
        {!grader.available && glOk === false && (
          <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-300">
            โหมดสีพื้นฐาน (ไม่มี WebGL)
          </span>
        )}
      </div>
    </div>
  );
}
