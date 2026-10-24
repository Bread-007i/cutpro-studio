"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronFirst,
  ChevronDown,
  ChevronLast,
  Crop,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  clearImportedFonts,
  fontFamilyName,
  loadImportedFont,
  removeUnusedImportedFonts,
} from "@/lib/editor/fontManager";
import { toast } from "sonner";

type MediaEl = HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
type CropRect = { x: number; y: number; width: number; height: number };
type SelectionBounds = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  offsetX: number;
};

function waitForExportDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Export cancelled", "AbortError"));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

function throwIfExportAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
}

function getSelectionBounds(
  clip: Clip,
  media: { width: number; height: number } | undefined,
  W: number,
  H: number,
  sourceDimensions?: { width: number; height: number }
): SelectionBounds | null {
  const p = clip.props;
  const centerX = W / 2 + p.x * W;
  const centerY = H / 2 + p.y * H;

  if (clip.kind === "text") {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return null;
    const fontSize = p.fontSize * (H / 1080);
    const fontFamily = p.fontFamily ? `"${fontFamilyName(p.fontFamily)}", ` : "";
    context.font = `${p.fontWeight} ${fontSize}px ${fontFamily}"Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif`;
    const lines = (p.text || "").split("\n");
    const textWidth = Math.max(...lines.map((line) => context.measureText(line).width), 1);
    const padX = p.textBg > 0 ? fontSize * 0.35 : 0;
    const padY = p.textBg > 0 ? fontSize * 0.22 : 0;
    const stroke = p.stroke ? fontSize * 0.05 : 0;
    const width = textWidth + padX * 2 + stroke * 2;
    const height = fontSize * 1.3 * lines.length + padY * 2 + stroke * 2;
    return {
      centerX,
      centerY,
      width,
      height,
      offsetX: p.align === "left" ? textWidth / 2 : p.align === "right" ? -textWidth / 2 : 0,
    };
  }

  const mw = sourceDimensions?.width || media?.width || 0;
  const mh = sourceDimensions?.height || media?.height || 0;
  if (!mw || !mh) return null;
  const fit = p.fit === "cover" ? Math.max(W / mw, H / mh) : Math.min(W / mw, H / mh);
  let width = mw * fit;
  let height = mh * fit;
  let cropOffsetX = 0;
  let cropOffsetY = 0;
  const crop = getCropRect(clip);
  if (crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1) {
    const cropScale = Math.max(1 / crop.width, 1 / crop.height);
    cropOffsetX = W / 2 + cropScale * (centerX - (crop.x + crop.width / 2) * W) - centerX;
    cropOffsetY = H / 2 + cropScale * (centerY - (crop.y + crop.height / 2) * H) - centerY;
    width *= cropScale;
    height *= cropScale;
  }
  return {
    centerX: centerX + cropOffsetX,
    centerY: centerY + cropOffsetY,
    width,
    height,
    offsetX: 0,
  };
}

function getCropRect(clip: Clip): CropRect {
  const x = clamp(clip.props.cropX ?? 0, 0, 0.999);
  const y = clamp(clip.props.cropY ?? 0, 0, 0.999);
  return {
    x,
    y,
    width: clamp(clip.props.cropWidth ?? 1, 0.01, 1 - x),
    height: clamp(clip.props.cropHeight ?? 1, 0.01, 1 - y),
  };
}

function getCropStyle(rect: CropRect): React.CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${Math.min(rect.width, 1 - rect.x) * 100}%`,
    height: `${Math.min(rect.height, 1 - rect.y) * 100}%`,
  };
}

function makeCropRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  aspectRatio: number | null,
  frameAspectRatio: number
): CropRect {
  const directionX = endX < startX ? -1 : 1;
  const directionY = endY < startY ? -1 : 1;
  let width = Math.abs(endX - startX);
  let height = Math.abs(endY - startY);

  if (aspectRatio) {
    const normalizedRatio = aspectRatio / frameAspectRatio;
    if (width / Math.max(height, 0.001) > normalizedRatio) {
      height = width / normalizedRatio;
    } else {
      width = height * normalizedRatio;
    }
  }

  const availableWidth = directionX < 0 ? startX : 1 - startX;
  const availableHeight = directionY < 0 ? startY : 1 - startY;
  const fit = Math.min(
    1,
    availableWidth / Math.max(width, 0.001),
    availableHeight / Math.max(height, 0.001)
  );
  width = Math.max(0.01, width * fit);
  height = Math.max(0.01, height * fit);

  return {
    x: directionX < 0 ? startX - width : startX,
    y: directionY < 0 ? startY - height : startY,
    width,
    height,
  };
}

export default function PreviewPlayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const timeLabelRef = useRef<HTMLSpanElement>(null);
  const elementsRef = useRef<Map<string, MediaEl>>(new Map());
  const canvasDragRef = useRef<{
    clipId: string;
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    pushed: boolean;
  } | null>(null);
  const transformDragRef = useRef<{
    clipId: string;
    pointerId: number;
    mode: "resize" | "rotate";
    originX: number;
    originY: number;
    startDistance: number;
    startAngle: number;
    scale: number;
    rotation: number;
    pushed: boolean;
  } | null>(null);
  const cropDragRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const draftCropRef = useRef<CropRect | null>(null);

  // refs mirroring store for the rAF loop
  const timeRef = useRef(0);
  const lastTsRef = useRef(0);
  const lastPushRef = useRef(0);
  const exportingRef = useRef(false);
  const lastRenderTsRef = useRef(0);
  const renderSizeRef = useRef({ w: 1920, h: 1080 });

  const playing = useEditor((s) => s.playing);
  const aspect = useEditor((s) => s.aspect);
  const duration = useEditor(getDuration);
  const mediaItems = useEditor((s) => s.media);
  const selectedClip = useEditor((s) => s.clips.find((clip) => clip.id === s.selectedClipId) ?? null);
  const selectedTrack = useEditor((s) => s.tracks.find((track) => track.id === s.clips.find((clip) => clip.id === s.selectedClipId)?.trackId));
  const playhead = useEditor((s) => s.playhead);
  const [glOk, setGlOk] = useState<boolean | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cropModeClipId, setCropModeClipId] = useState<string | null>(null);
  const [draftCrop, setDraftCrop] = useState<CropRect | null>(null);
  const [cropAspect, setCropAspect] = useState("free");

  useEffect(() => {
    const fonts = mediaItems.filter((media) => media.type === "font");
    removeUnusedImportedFonts(new Set(fonts.map((font) => font.id)));
    for (const font of fonts) {
      void loadImportedFont(font.id, font.url).catch((error: unknown) => {
        console.error(`[player] font load failed: ${font.name}`, error);
        toast.error(`โหลดฟอนต์ ${font.name} ไม่สำเร็จ`);
      });
    }
  }, [mediaItems]);

  useEffect(() => () => clearImportedFonts(), []);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const request = document.fullscreenElement === player
      ? document.exitFullscreen()
      : player.requestFullscreen();
    void request.catch((error: unknown) => {
      console.error("[player] fullscreen change failed", error);
      toast.error("เปิดหรือปิดโหมดเต็มจอไม่สำเร็จ");
    });
  }, []);

  const beginCanvasDrag = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const s = useEditor.getState();
    const t = s.playhead;
    const active = s.clips.filter((clip) => {
      const track = s.tracks.find((item) => item.id === clip.trackId);
      return track && !track.hidden && track.type !== "audio" &&
        t >= clip.start && t < clip.start + clip.duration;
    });
    const selected = active.find((clip) => clip.id === s.selectedClipId);
    const clip = selected ?? active.sort((a, b) => {
      const trackA = s.tracks.findIndex((track) => track.id === a.trackId);
      const trackB = s.tracks.findIndex((track) => track.id === b.trackId);
      const textA = a.kind === "text" ? 0 : 1;
      const textB = b.kind === "text" ? 0 : 1;
      return textA - textB || trackA - trackB;
    })[0];
    const canvas = canvasRef.current;
    if (!clip || !canvas) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    s.select(clip.id);
    canvasDragRef.current = {
      clipId: clip.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: clip.props.x,
      y: clip.props.y,
      pushed: false,
    };
  }, []);

  const moveCanvasDrag = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = canvasDragRef.current;
    const canvas = canvasRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = drag.x + (e.clientX - drag.startX) / rect.width;
    const y = drag.y + (e.clientY - drag.startY) / rect.height;
    if (!drag.pushed && (Math.abs(x - drag.x) > 0.001 || Math.abs(y - drag.y) > 0.001)) {
      useEditor.getState().pushHistory();
      drag.pushed = true;
    }
    useEditor.getState().updateClipProps(drag.clipId, {
      x: clamp(x, -2, 2),
      y: clamp(y, -2, 2),
    });
  }, []);

  const beginTransform = useCallback((
    e: React.PointerEvent<SVGCircleElement>,
    mode: "resize" | "rotate"
  ) => {
    if (e.button !== 0 || !selectedClip) return;
    const canvas = canvasRef.current;
    const svg = e.currentTarget.ownerSVGElement;
    if (!canvas || !svg) return;
    e.preventDefault();
    e.stopPropagation();
    svg.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const { w, h } = ASPECT_DIMS[aspect];
    const media = selectedClip.kind === "media"
      ? useEditor.getState().media.find((item) => item.id === selectedClip.mediaId)
      : undefined;
    const source = elementsRef.current.get(selectedClip.id);
    const sourceDimensions = source instanceof HTMLImageElement
      ? { width: source.naturalWidth, height: source.naturalHeight }
      : source instanceof HTMLVideoElement && source.videoWidth
        ? { width: source.videoWidth, height: source.videoHeight }
        : undefined;
    const bounds = getSelectionBounds(selectedClip, media, w, h, sourceDimensions);
    const originX = bounds?.centerX ?? w / 2 + selectedClip.props.x * w;
    const originY = bounds?.centerY ?? h / 2 + selectedClip.props.y * h;
    const pointX = (e.clientX - rect.left) * (w / rect.width);
    const pointY = (e.clientY - rect.top) * (h / rect.height);
    transformDragRef.current = {
      clipId: selectedClip.id,
      pointerId: e.pointerId,
      mode,
      originX,
      originY,
      startDistance: Math.hypot(pointX - originX, pointY - originY),
      startAngle: Math.atan2(pointY - originY, pointX - originX),
      scale: selectedClip.props.scale,
      rotation: selectedClip.props.rotation,
      pushed: false,
    };
  }, [aspect, selectedClip]);

  const moveTransform = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const drag = transformDragRef.current;
    const canvas = canvasRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { w, h } = ASPECT_DIMS[aspect];
    const pointX = (e.clientX - rect.left) * (w / rect.width);
    const pointY = (e.clientY - rect.top) * (h / rect.height);
    let patch: { scale?: number; rotation?: number };
    if (drag.mode === "resize") {
      const distance = Math.hypot(pointX - drag.originX, pointY - drag.originY);
      const scale = drag.scale * distance / Math.max(1, drag.startDistance);
      patch = { scale: clamp(Math.round(scale * 100) / 100, 0.1, 10) };
    } else {
      const angle = Math.atan2(pointY - drag.originY, pointX - drag.originX);
      const degrees = drag.rotation + ((angle - drag.startAngle) * 180) / Math.PI;
      patch = { rotation: Math.round(((degrees + 180) % 360 + 360) % 360 - 180) };
    }
    const changed = drag.mode === "resize"
      ? Math.abs((patch.scale ?? drag.scale) - drag.scale) > 0.001
      : Math.abs((patch.rotation ?? drag.rotation) - drag.rotation) > 0.1;
    const state = useEditor.getState();
    if (!drag.pushed && changed) {
      state.pushHistory();
      drag.pushed = true;
    }
    state.updateClipProps(drag.clipId, patch);
  }, [aspect]);

  const endTransform = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (transformDragRef.current?.pointerId === e.pointerId) transformDragRef.current = null;
  }, []);

  const endCanvasDrag = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (canvasDragRef.current?.pointerId === e.pointerId) canvasDragRef.current = null;
  }, []);

  const cropMedia = selectedClip?.kind === "media"
    ? mediaItems.find((media) => media.id === selectedClip.mediaId)
    : undefined;
  const canCropSelected = !!selectedClip && selectedClip.kind === "media" &&
    (cropMedia?.type === "video" || cropMedia?.type === "image");
  const cropMode = cropModeClipId !== null && cropModeClipId === selectedClip?.id;
  const transformMedia = selectedClip?.kind === "media"
    ? mediaItems.find((media) => media.id === selectedClip.mediaId)
    : undefined;
  const canTransformSelected = !!selectedClip && (
    selectedClip.kind === "text" || transformMedia?.type === "image" || transformMedia?.type === "video"
  );
  const selectedClipIsActive = !!selectedClip && playhead >= selectedClip.start &&
    playhead < selectedClip.start + selectedClip.duration && !selectedTrack?.hidden;
  const selectionBounds = canTransformSelected && selectedClipIsActive && selectedClip
    ? getSelectionBounds(
        selectedClip,
        transformMedia,
        ASPECT_DIMS[aspect].w,
        ASPECT_DIMS[aspect].h
      )
    : null;

  const toggleCropMode = useCallback(() => {
    if (!selectedClip || !canCropSelected) return;
    if (cropMode) {
      setCropModeClipId(null);
      draftCropRef.current = null;
      setDraftCrop(null);
      return;
    }
    const state = useEditor.getState();
    state.setPlaying(false);
    if (
      state.playhead < selectedClip.start ||
      state.playhead >= selectedClip.start + selectedClip.duration
    ) {
      state.setPlayhead(selectedClip.start);
      timeRef.current = selectedClip.start;
    }
    const initialCrop = getCropRect(selectedClip);
    draftCropRef.current = initialCrop;
    setDraftCrop(initialCrop);
    setCropModeClipId(selectedClip.id);
  }, [canCropSelected, cropMode, selectedClip]);

  const updateCropDraft = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clamp((drag.startX - rect.left) / rect.width, 0, 1);
    const y = clamp((drag.startY - rect.top) / rect.height, 0, 1);
    const currentX = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const currentY = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const frame = ASPECT_DIMS[useEditor.getState().aspect];
    const ratio = cropAspect === "free"
      ? null
      : cropAspect === "project"
        ? frame.w / frame.h
        : Number(cropAspect);
    const crop = makeCropRect(x, y, currentX, currentY, ratio, frame.w / frame.h);
    draftCropRef.current = crop;
    setDraftCrop(crop);
  }, [cropAspect]);

  const startCropDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    cropDragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    const frame = ASPECT_DIMS[useEditor.getState().aspect];
    const ratio = cropAspect === "free"
      ? null
      : cropAspect === "project"
        ? frame.w / frame.h
        : Number(cropAspect);
    const crop = makeCropRect(x, y, x + 0.01, y + 0.01, ratio, frame.w / frame.h);
    draftCropRef.current = crop;
    setDraftCrop(crop);
  }, [cropAspect]);

  const finishCropDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (cropDragRef.current?.pointerId !== e.pointerId) return;
    cropDragRef.current = null;
    const state = useEditor.getState();
    const clip = state.clips.find((item) => item.id === cropModeClipId);
    const crop = draftCropRef.current;
    if (!clip || !crop) return;
    if (crop.width < 0.02 || crop.height < 0.02) {
      const savedCrop = getCropRect(clip);
      draftCropRef.current = savedCrop;
      setDraftCrop(savedCrop);
      return;
    }
    state.pushHistory();
    state.updateClipProps(clip.id, {
      cropX: crop.x,
      cropY: crop.y,
      cropWidth: crop.width,
      cropHeight: crop.height,
    });
  }, [cropModeClipId, draftCrop]);

  const resetCrop = useCallback(() => {
    if (!selectedClip || !cropMode) return;
    const state = useEditor.getState();
    const crop = getCropRect(selectedClip);
    if (crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1) return;
    state.pushHistory();
    state.updateClipProps(selectedClip.id, { cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 });
    const resetCrop = { x: 0, y: 0, width: 1, height: 1 };
    draftCropRef.current = resetCrop;
    setDraftCrop(resetCrop);
  }, [cropMode, selectedClip]);

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
      const pixelScale = Math.min(
        fit * dpr,
        1920 / dims.w,
        1920 / dims.h,
        Math.sqrt(4_000_000 / (dims.w * dims.h))
      );
      const w = Math.max(1, Math.round(dims.w * pixelScale));
      const h = Math.max(1, Math.round(dims.h * pixelScale));
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
      const drift = local - el.currentTime;
      if (Math.abs(drift) > (isPlaying ? 0.35 : 0.033)) {
        try {
          el.currentTime = local;
        } catch {
          /* noop */
        }
      }
      const rate = clamp(clip.props.speed * (isPlaying ? 1 + clamp(drift * 0.08, -0.04, 0.04) : 1), 0.1, 8);
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

  const drawClip = useCallback((
    ctx: CanvasRenderingContext2D,
    clip: Clip,
    t: number,
    W: number,
    H: number,
    split: number,
    cropEditClipId: string | null
  ) => {
    const p = clip.props;
    const fade = fadeFactor(clip, t);
    const alpha = clamp(p.opacity * fade, 0, 1);
    if (alpha <= 0.001) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    const scaleF = H / 1080;

    if (clip.kind === "text") {
      const fontSize = p.fontSize * scaleF;
      const fontFamily = p.fontFamily ? `"${fontFamilyName(p.fontFamily)}", ` : "";
      ctx.font = `${p.fontWeight} ${fontSize}px ${fontFamily}"Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif`;
      ctx.textAlign = p.align;
      ctx.textBaseline = "middle";
      ctx.translate(W / 2 + p.x * W, H / 2 + p.y * H);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.scale(p.scale, p.scale);
      const cx = 0;
      const cy = 0;
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

    if (clip.id !== cropEditClipId) {
      const crop = getCropRect(clip);
      if (crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1) {
        const scale = Math.max(1 / crop.width, 1 / crop.height);
        const centerX = crop.x + crop.width / 2;
        const centerY = crop.y + crop.height / 2;
        ctx.translate(W / 2, H / 2);
        ctx.scale(scale, scale);
        ctx.translate(-centerX * W, -centerY * H);
      }
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

  const draw = useCallback((t: number, split: number, cropEditClipId: string | null) => {
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
      for (const clip of clips) drawClip(ctx, clip, t, W, H, split, cropEditClipId);
    }
    for (let i = textTracks.length - 1; i >= 0; i--) {
      const track = textTracks[i];
      const clips = s.clips
        .filter((c) => c.trackId === track.id && t >= c.start && t < c.start + c.duration)
        .sort((a, b) => a.start - b.start);
      for (const clip of clips) drawClip(ctx, clip, t, W, H, split, cropEditClipId);
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
      if (ts - lastRenderTsRef.current < 1000 / 30) return;
      lastRenderTsRef.current = ts;
      draw(
        drawT,
        s.compare && !exportingRef.current ? 0.5 : -1,
        exportingRef.current ? null : cropModeClipId
      );
    };
    const updateTimeLabel = (t: number) => {
      if (timeLabelRef.current) {
        timeLabelRef.current.textContent = formatTimeFull(t);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cropModeClipId, draw, syncMedia]);

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
      exportVideo: async (opts, onProgress, signal) => {
        const s = useEditor.getState();
        const dur = getDuration(s);
        if (dur <= 0) throw new Error("ไทม์ไลน์ว่างเปล่า ไม่มีอะไรให้ส่งออก");
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("Canvas ไม่พร้อมใช้งาน");

        throwIfExportAborted(signal);
        const originalPlayhead = s.playhead;
        const wasPlaying = s.playing;
        let recorder: MediaRecorder | null = null;
        let probeRecorder: MediaRecorder | null = null;
        const streams: MediaStream[] = [];
        let exportRaf = 0;
        const dims = ASPECT_DIMS[useEditor.getState().aspect];
        canvas.width = Math.round(dims.w * opts.scale);
        canvas.height = Math.round(dims.h * opts.scale);
        renderSizeRef.current = { w: canvas.width, h: canvas.height };

        // wake audio context (user gesture happened on button click)
        const dummy = document.createElement("audio");
        audioGraph.ensure("wake", dummy);
        audioGraph.drop("wake");

        exportingRef.current = true;
        s.setPlaying(false);
        try {
          // seek to 0 and settle
          seek(0);
          syncMedia(0, false);
          await waitForExportDelay(350, signal);

          const videoStream = canvas.captureStream(opts.fps);
          streams.push(videoStream);
          const audioStream = audioGraph.stream();
          if (audioStream) streams.push(audioStream);
          const videoTracks = [...videoStream.getVideoTracks()];
          const audioTracks = audioStream ? [...audioStream.getAudioTracks()] : [];

          // Probe: some environments (e.g. headless Chrome without audio output)
          // silently record 0 bytes when an AudioContext track is mixed in.
          let recTracks = videoTracks;
          if (audioTracks.length > 0) {
            try {
              const probeMixed = new MediaStream([...videoTracks, ...audioTracks]);
              const probe = new MediaRecorder(probeMixed);
              probeRecorder = probe;
              streams.push(probeMixed);
              const pChunks: Blob[] = [];
              probe.ondataavailable = (e) => {
                if (e.data.size > 0) pChunks.push(e.data);
              };
              probe.start(100);
              await waitForExportDelay(450, signal);
              if (probe.state !== "inactive") probe.stop();
              await waitForExportDelay(100, signal);
              if (pChunks.reduce((a, b) => a + b.size, 0) > 0) {
                recTracks = [...videoTracks, ...audioTracks];
                console.info("[export] audio mixing supported");
              } else {
                console.warn("[export] mixed stream records 0 bytes — falling back to video-only");
              }
            } catch {
              if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
              console.warn("[export] probe failed — falling back to video-only");
            }
          }
          throwIfExportAborted(signal);

          const recStream = new MediaStream(recTracks);
          streams.push(recStream);

          const mimeCandidates = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
          ];
          const mimeType =
            mimeCandidates.find((m) =>
              typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)
            ) ?? "";
          const recording = new MediaRecorder(recStream, {
            ...(mimeType ? { mimeType } : {}),
            videoBitsPerSecond: Math.round((opts.bitrate ?? 6_000_000) * opts.scale * opts.scale),
          });
          recorder = recording;
          const chunks: Blob[] = [];
          recording.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };

          const done = new Promise<Blob>((resolve, reject) => {
            recording.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
            recording.onerror = () => reject(new Error("บันทึกวิดีโอไม่สำเร็จ"));
          });

          recording.start(250);
          timeRef.current = 0;

          await new Promise<void>((resolve) => {
            const cancel = () => {
              cancelAnimationFrame(exportRaf);
              resolve();
            };
            signal.addEventListener("abort", cancel, { once: true });
            const step = () => {
              const st = useEditor.getState();
              const durNow = getDuration(st);
              if (signal.aborted || timeRef.current >= durNow - 0.001) {
                signal.removeEventListener("abort", cancel);
                resolve();
                return;
              }
              onProgress(clamp(timeRef.current / durNow, 0, 1));
              st.setPlayhead(timeRef.current);
              exportRaf = requestAnimationFrame(step);
            };
            exportRaf = requestAnimationFrame(step);
          });

          throwIfExportAborted(signal);
          await waitForExportDelay(250, signal);
          if (recording.state !== "inactive") recording.stop();
          const rawBlob = await done;
          throwIfExportAborted(signal);
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
          cancelAnimationFrame(exportRaf);
          if (probeRecorder && probeRecorder.state !== "inactive") probeRecorder.stop();
          if (recorder && recorder.state !== "inactive") recorder.stop();
          for (const stream of streams) {
            for (const track of stream.getTracks()) track.stop();
          }
          exportingRef.current = false;
          applyRenderSize();
          seek(originalPlayhead);
          useEditor.getState().setPlaying(wasPlaying);
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
    <div
      ref={playerRef}
      className="flex h-full min-h-0 flex-col bg-[#0a0a0e]"
      style={isFullscreen ? { width: "100vw", height: "100vh" } : undefined}
    >
      <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-3">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="relative h-full max-h-full w-auto max-w-full overflow-hidden rounded-lg ring-1 ring-white/10"
              style={{
                aspectRatio: `${ASPECT_DIMS[aspect].w} / ${ASPECT_DIMS[aspect].h}`,
              }}
            >
              <canvas
                ref={canvasRef}
                className="h-full w-full touch-none bg-black object-contain shadow-2xl"
                onPointerDown={beginCanvasDrag}
                onPointerMove={moveCanvasDrag}
                onPointerUp={endCanvasDrag}
                onPointerCancel={endCanvasDrag}
                aria-label="ลากวัตถุที่เลือกเพื่อปรับตำแหน่งบนภาพ"
              />
              {selectionBounds && selectedClip && !cropMode && (
                <>
                  <svg
                    className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible"
                    viewBox={`0 0 ${ASPECT_DIMS[aspect].w} ${ASPECT_DIMS[aspect].h}`}
                    onPointerMove={moveTransform}
                    onPointerUp={endTransform}
                    onPointerCancel={endTransform}
                    aria-label="กรอบปรับขนาดและหมุนวัตถุที่เลือก"
                  >
                    {(() => {
                      const { h } = ASPECT_DIMS[aspect];
                      const radius = h * 0.009;
                      const scale = selectedClip.props.scale;
                      const left = (selectionBounds.offsetX - selectionBounds.width / 2) * scale;
                      const right = (selectionBounds.offsetX + selectionBounds.width / 2) * scale;
                      const top = -selectionBounds.height * scale / 2;
                      const bottom = selectionBounds.height * scale / 2;
                      const rotateY = top - radius * 4;
                      const corners = [
                        { x: left, y: top, cursor: "cursor-nwse-resize", name: "ปรับขนาดมุมซ้ายบน" },
                        { x: right, y: top, cursor: "cursor-nesw-resize", name: "ปรับขนาดมุมขวาบน" },
                        { x: right, y: bottom, cursor: "cursor-nwse-resize", name: "ปรับขนาดมุมขวาล่าง" },
                        { x: left, y: bottom, cursor: "cursor-nesw-resize", name: "ปรับขนาดมุมซ้ายล่าง" },
                      ];
                      return (
                        <g
                          transform={`translate(${selectionBounds.centerX} ${selectionBounds.centerY}) rotate(${selectedClip.props.rotation})`}
                          className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
                          pointerEvents="visiblePainted"
                        >
                          <rect
                            x={left}
                            y={top}
                            width={Math.max(1, right - left)}
                            height={Math.max(1, bottom - top)}
                            fill="none"
                            stroke="#c084fc"
                            strokeWidth={Math.max(2, h / 540)}
                            strokeDasharray={`${h / 90} ${h / 135}`}
                            pointerEvents="none"
                          />
                          <line
                            x1={(left + right) / 2}
                            y1={top}
                            x2={(left + right) / 2}
                            y2={rotateY}
                            stroke="#e9d5ff"
                            strokeWidth={Math.max(2, h / 540)}
                            pointerEvents="none"
                          />
                          {corners.map((corner) => (
                            <circle
                              key={corner.name}
                              cx={corner.x}
                              cy={corner.y}
                              r={radius}
                              fill="#fff"
                              stroke="#a855f7"
                              strokeWidth={Math.max(3, h / 360)}
                              className={`pointer-events-auto ${corner.cursor}`}
                              data-transform-handle="resize"
                              aria-label={corner.name}
                              pointerEvents="all"
                              onPointerDown={(event) => beginTransform(event, "resize")}
                            >
                              <title>{corner.name}</title>
                            </circle>
                          ))}
                          <circle
                            cx={(left + right) / 2}
                            cy={rotateY}
                            r={radius}
                            fill="#d946ef"
                            stroke="#fff"
                            strokeWidth={Math.max(3, h / 360)}
                            className="pointer-events-auto cursor-grab active:cursor-grabbing"
                            data-transform-handle="rotate"
                            aria-label="ลากเพื่อหมุนวัตถุ"
                            pointerEvents="all"
                            onPointerDown={(event) => beginTransform(event, "rotate")}
                          >
                            <title>ลากเพื่อหมุนวัตถุ</title>
                          </circle>
                        </g>
                      );
                    })()}
                  </svg>
                  <div className="pointer-events-none absolute bottom-2 left-2 z-[6] rounded-md border border-white/10 bg-black/70 px-2 py-1 text-[10px] text-zinc-200 backdrop-blur-sm">
                    ลากวัตถุเพื่อย้าย · ลากมุมเพื่อย่อ/ขยาย · จุดบนเพื่อหมุน
                  </div>
                </>
              )}
              {cropMode && draftCrop && (
                <div
                  className="absolute inset-0 z-10 cursor-crosshair touch-none"
                  aria-label="ลากเพื่อเลือกพื้นที่ครอป"
                  onPointerDown={startCropDrag}
                  onPointerMove={updateCropDraft}
                  onPointerUp={finishCropDrag}
                  onPointerCancel={finishCropDrag}
                >
                  <div
                    className="pointer-events-none absolute left-0 top-0 w-full bg-black/55"
                    style={{ height: `${draftCrop.y * 100}%` }}
                  />
                  <div
                    className="pointer-events-none absolute left-0 w-full bg-black/55"
                    style={{
                      top: `${(draftCrop.y + draftCrop.height) * 100}%`,
                      height: `${Math.max(0, 1 - draftCrop.y - draftCrop.height) * 100}%`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute bg-black/55"
                    style={{
                      left: 0,
                      top: `${draftCrop.y * 100}%`,
                      width: `${draftCrop.x * 100}%`,
                      height: `${draftCrop.height * 100}%`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute bg-black/55"
                    style={{
                      left: `${(draftCrop.x + draftCrop.width) * 100}%`,
                      top: `${draftCrop.y * 100}%`,
                      width: `${Math.max(0, 1 - draftCrop.x - draftCrop.width) * 100}%`,
                      height: `${draftCrop.height * 100}%`,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute border-2 border-dashed border-white shadow-[0_0_0_1px_rgba(0,0,0,0.7)]"
                    style={getCropStyle(draftCrop)}
                  >
                    <span className="absolute left-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">
                      ลากเพื่อกำหนดกรอบครอป
                    </span>
                  </div>
                </div>
              )}
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={cropMode ? "secondary" : "ghost"}
              size="sm"
              className={`h-8 gap-1 px-2 ${cropMode ? "bg-fuchsia-600/30 text-fuchsia-200" : "text-zinc-300"}`}
              disabled={!canCropSelected}
              aria-label="เมนูครอป"
              title="เลือกสัดส่วนและพื้นที่ครอป"
            >
              <Crop className="h-4 w-4" />
              <span className="text-[10px]">ครอป</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 border-white/10 bg-[#17171f] text-zinc-200">
            <DropdownMenuLabel className="text-[10px] text-zinc-400">สัดส่วนกรอบครอป</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={cropAspect} onValueChange={setCropAspect}>
              <DropdownMenuRadioItem value="free" className="text-xs">อิสระ</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="project" className="text-xs">ตามเฟรมโปรเจกต์ ({aspect})</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="1.7777778" className="text-xs">16:9</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="0.5625" className="text-xs">9:16</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="1" className="text-xs">1:1</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="0.8" className="text-xs">4:5</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem className="text-xs" onSelect={toggleCropMode}>
              {cropMode ? "เสร็จสิ้นการครอป" : "เลือกพื้นที่ที่จะแสดง"}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" disabled={!cropMode} onSelect={resetCrop}>
              <RotateCcw className="h-3.5 w-3.5" />
              รีเซ็ตพื้นที่ครอป
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
        <Button
          variant="ghost"
          size="icon"
          className="ml-2 h-8 w-8 text-zinc-300"
          onClick={toggleFullscreen}
          title="เต็มจอ"
          aria-label={isFullscreen ? "ออกจากเต็มจอ" : "เต็มจอ"}
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </Button>
        {!grader.available && glOk === false && (
          <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-300">
            โหมดสีพื้นฐาน (ไม่มี WebGL)
          </span>
        )}
      </div>
    </div>
  );
}
