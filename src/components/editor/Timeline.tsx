"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Clipboard,
  ClipboardPaste,
  Eye,
  EyeOff,
  Film,
  Magnet,
  Maximize,
  Music2,
  Plus,
  Scissors,
  SplitSquareHorizontal,
  Trash2,
  Type,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  Columns3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  getClipTrackType,
  getDuration,
  hasClipboard,
  snapIfEnabled,
  useEditor,
} from "@/lib/editor/store";
import type { Clip, MediaItem, Track } from "@/lib/editor/types";
import { clamp, formatTime, formatTimeFull, niceStep } from "@/lib/editor/utils";
import { copyGrade, hasGradeClipboard, isGraded, pasteGrade } from "@/lib/editor/color";
import { ensureFilmstrip, ensureWaveform, getFilmstrip, getWaveform, isWaveLoading, waveSlice } from "@/lib/editor/thumbCache";

const TRACK_H = 56;

type DragState =
  | {
      mode: "move";
      ids: string[];
      primaryId: string;
      grabOffset: number;
      origStarts: Map<string, number>;
      pushed: boolean;
    }
  | { mode: "trim-left" | "trim-right"; clipId: string; pushed: boolean }
  | { mode: "seek" }
  | null;

export default function Timeline() {
  const tracks = useEditor((s) => s.tracks);
  const clips = useEditor((s) => s.clips);
  const media = useEditor((s) => s.media);
  const pxPerSec = useEditor((s) => s.pxPerSec);
  const snapping = useEditor((s) => s.snapping);
  const selectedIds = useEditor((s) => s.selectedIds);
  const compare = useEditor((s) => s.compare);

  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(null);
  const marqueeRef2 = useRef<{ x0: number; y0: number; active: boolean; moved: boolean } | null>(null);
  const selSetRef = useRef<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [dropTrackId, setDropTrackId] = useState<string | null>(null);

  const duration = useMemo(() => getDuration({ clips }), [clips]);
  const contentSec = Math.max(duration + 8, 30);
  const contentW = contentSec * pxPerSec;
  const selSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  useEffect(() => {
    selSetRef.current = selSet;
  }, [selSet]);

  const clipTrackType = useCallback(
    (clip: Clip) => getClipTrackType(clip, media),
    [media]
  );

  // ---- ruler ---------------------------------------------------------------

  const step = niceStep(pxPerSec);
  const ticks: number[] = [];
  for (let t = 0; t <= contentSec; t += step) ticks.push(t);

  // ---- scroll sync ----------------------------------------------------------

  const onScroll = () => {
    const sc = scrollRef.current;
    if (headerRef.current && sc) {
      headerRef.current.style.transform = `translateY(${-sc.scrollTop}px)`;
    }
  };

  // ---- playhead: ref-driven, zero re-render ----------------------------------

  useEffect(() => {
    const el = playheadRef.current;
    if (!el) return;
    const update = () => {
      const st = useEditor.getState();
      const px = st.playhead * pxPerSec;
      el.style.transform = `translateX(${px}px)`;
      // auto-follow while playing
      const sc = scrollRef.current;
      if (sc && st.playing) {
        const left = sc.scrollLeft;
        const w = sc.clientWidth;
        if (px < left || px > left + w - 40) {
          sc.scrollLeft = Math.max(0, px - w * 0.25);
        }
      }
    };
    update();
    const unsub = useEditor.subscribe(update);
    return unsub;
  }, [pxPerSec]);

  // ---- seeking on ruler -------------------------------------------------------

  const timeFromEvent = useCallback(
    (clientX: number): number => {
      const content = contentRef.current;
      if (!content) return 0;
      const rect = content.getBoundingClientRect();
      return clamp((clientX - rect.left) / pxPerSec, 0, contentSec);
    },
    [pxPerSec, contentSec]
  );

  const startSeek = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { mode: "seek" };
    setDragging(true);
    const s = useEditor.getState();
    s.setPlaying(false);
    s.setPlayhead(timeFromEvent(e.clientX));
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  // ---- clip interactions ------------------------------------------------------

  const beginDrag = useCallback((e: React.PointerEvent, clip: Clip, mode: "move" | "trim-left" | "trim-right") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useEditor.getState();
    s.setPlaying(false);
    let targetId = clip.id;

    if (mode === "move") {
      // ctrl/meta+click toggles selection without dragging
      if (e.ctrlKey || e.metaKey) {
        s.toggleSelect(clip.id);
        return;
      }
      // alt+click duplicates the clip then drags the copy
      if (e.altKey) {
        s.duplicateClip(clip.id);
        const newId = useEditor.getState().selectedClipId;
        if (newId) targetId = newId;
      }
      const current = useEditor.getState().clips.find((c) => c.id === targetId);
      if (!current) return;
      const selNow = selSetRef.current;
      const ids = selNow.has(targetId) && selNow.size > 1 ? [...selNow] : [targetId];
      if (!ids.includes(targetId)) ids.push(targetId);
      if (!selNow.has(targetId) || selNow.size <= 1) {
        s.select(targetId);
      }
      const grabOffset = timeFromEvent(e.clientX) - current.start;
      const origStarts = new Map<string, number>();
      const st = useEditor.getState();
      for (const id of ids) {
        const c = st.clips.find((cc) => cc.id === id);
        if (c) origStarts.set(id, c.start);
      }
      dragRef.current = { mode, ids, primaryId: targetId, grabOffset, origStarts, pushed: false };
    } else {
      s.select(clip.id);
      dragRef.current = { mode, clipId: clip.id, pushed: false };
    }
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [timeFromEvent]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const s = useEditor.getState();
    if (drag.mode === "seek") {
      s.setPlayhead(timeFromEvent(e.clientX));
      return;
    }

    if (drag.mode === "move") {
      if (!drag.pushed) {
        s.pushHistory();
        drag.pushed = true;
      }
      const primary = s.clips.find((c) => c.id === drag.primaryId);
      if (!primary) return;
      const origPrimary = drag.origStarts.get(drag.primaryId) ?? primary.start;

      let newStart = Math.max(0, timeFromEvent(e.clientX) - drag.grabOffset);
      // snapping applies to both edges of the primary clip
      const snapL = snapIfEnabled(newStart, [origPrimary + primary.duration]);
      const snapR = snapIfEnabled(newStart + primary.duration, [origPrimary]) - primary.duration;
      const dl = Math.abs(snapL - newStart);
      const dr = Math.abs(snapR - newStart);
      if (dl < dr) newStart = snapL;
      else newStart = Math.max(0, snapR);
      const delta = newStart - origPrimary;

      // vertical: find hovered compatible track for the primary clip
      const content = contentRef.current;
      let targetTrack = primary.trackId;
      if (content) {
        const rect = content.getBoundingClientRect();
        const y = e.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0) - TRACK_H; // minus ruler
        const idx = clamp(Math.floor(y / TRACK_H), 0, s.tracks.length - 1);
        const track = s.tracks[idx];
        const wantType = getClipTrackType(primary, s.media);
        if (track && track.type === wantType) targetTrack = track.id;
      }

      for (const id of drag.ids) {
        const c = s.clips.find((cc) => cc.id === id);
        if (!c) continue;
        const orig = drag.origStarts.get(id) ?? c.start;
        if (id === drag.primaryId) {
          s.moveClip(id, newStart, targetTrack, false);
        } else {
          s.moveClip(id, Math.max(0, orig + delta), c.trackId, false);
        }
      }
    } else if (drag.mode === "trim-left") {
      if (!drag.pushed) {
        s.pushHistory();
        drag.pushed = true;
      }
      const clip = s.clips.find((c) => c.id === drag.clipId);
      if (!clip) return;
      s.trimClip(clip.id, "left", snapIfEnabled(timeFromEvent(e.clientX), [clip.start + clip.duration - 0.1]), false);
    } else if (drag.mode === "trim-right") {
      if (!drag.pushed) {
        s.pushHistory();
        drag.pushed = true;
      }
      const clip = s.clips.find((c) => c.id === drag.clipId);
      if (!clip) return;
      s.trimClip(clip.id, "right", snapIfEnabled(timeFromEvent(e.clientX), [clip.start]), false);
    }
  }, [timeFromEvent]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  // ---- marquee selection --------------------------------------------------------

  const onLanePointerDown = useCallback((e: React.PointerEvent, lane: HTMLDivElement) => {
    if (e.button !== 0) return;
    marqueeRef2.current = { x0: e.clientX, y0: e.clientY, active: true, moved: false };
    setDragging(true);
    lane.setPointerCapture?.(e.pointerId);
  }, []);

  const onLanePointerMove = useCallback((e: React.PointerEvent) => {
    const m = marqueeRef2.current;
    if (!m?.active) return;
    const content = contentRef.current;
    const marquee = marqueeRef.current;
    if (!content || !marquee) return;
    const cRect = content.getBoundingClientRect();
    const dx = Math.abs(e.clientX - m.x0);
    const dy = Math.abs(e.clientY - m.y0);
    if (!m.moved && dx < 4 && dy < 4) return;
    m.moved = true;
    const x1 = Math.min(e.clientX, m.x0) - cRect.left;
    const x2 = Math.max(e.clientX, m.x0) - cRect.left;
    const y1 = Math.min(e.clientY, m.y0) - cRect.top;
    const y2 = Math.max(e.clientY, m.y0) - cRect.top;
    marquee.style.display = "block";
    marquee.style.left = `${x1}px`;
    marquee.style.top = `${y1}px`;
    marquee.style.width = `${x2 - x1}px`;
    marquee.style.height = `${y2 - y1}px`;
  }, []);

  const onLanePointerUp = useCallback((e: React.PointerEvent) => {
    const m = marqueeRef2.current;
    marqueeRef2.current = null;
    setDragging(false);
    const marquee = marqueeRef.current;
    if (marquee) {
      marquee.style.display = "none";
    }
    if (!m?.active) return;
    if (!m.moved) {
      // plain click on empty area → deselect
      useEditor.getState().select(null);
      return;
    }
    const content = contentRef.current;
    if (!content) return;
    const cRect = content.getBoundingClientRect();
    const x1 = Math.min(e.clientX, m.x0) - cRect.left;
    const x2 = Math.max(e.clientX, m.x0) - cRect.left;
    const y1 = Math.min(e.clientY, m.y0) - cRect.top - TRACK_H;
    const y2 = Math.max(e.clientY, m.y0) - cRect.top - TRACK_H;
    const s = useEditor.getState();
    const ids: string[] = [];
    s.tracks.forEach((track, ti) => {
      const top = ti * TRACK_H;
      const bottom = top + TRACK_H;
      if (bottom <= y1 || top >= y2) return;
      for (const c of s.clips) {
        if (c.trackId !== track.id) continue;
        const cx1 = c.start * pxPerSec;
        const cx2 = (c.start + c.duration) * pxPerSec;
        if (cx2 > x1 && cx1 < x2) ids.push(c.id);
      }
    });
    if (ids.length > 0) {
      s.selectMany(ids);
    } else {
      s.select(null);
    }
  }, [pxPerSec]);

  // ---- media drag & drop from library --------------------------------------------

  const onLaneDragOver = (e: React.DragEvent, trackId: string) => {
    if (e.dataTransfer.types.includes("text/cutpro-media")) {
      e.preventDefault();
      setDropTrackId(trackId);
    }
  };

  const onLaneDrop = (e: React.DragEvent, track: Track) => {
    e.preventDefault();
    setDropTrackId(null);
    const mediaId = e.dataTransfer.getData("text/cutpro-media");
    if (!mediaId) return;
    const s = useEditor.getState();
    const m = s.media.find((mm) => mm.id === mediaId);
    if (!m) return;
    const wantType = m.type === "audio" ? "audio" : "video";
    let trackId = track.id;
    if (track.type !== wantType) {
      // find the track under the pointer vertically that matches, else nearest match
      const content = contentRef.current;
      const rect = content?.getBoundingClientRect();
      if (rect) {
        const y = e.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0) - TRACK_H;
        const idx = clamp(Math.floor(y / TRACK_H), 0, s.tracks.length - 1);
        const hovered = s.tracks[idx];
        if (hovered && hovered.type === wantType) trackId = hovered.id;
        else {
          const compat = s.tracks.filter((t) => t.type === wantType);
          if (compat.length > 0) trackId = compat[0].id;
        }
      }
    }
    const at = timeFromEvent(e.clientX);
    s.addClipFromMedia(mediaId, { trackId, at });
    toast.success(`วาง "${m.name}" ที่ ${formatTime(at)}`);
  };

  // ---- zoom with ctrl+wheel -------------------------------------------------------

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const s = useEditor.getState();
        const content = contentRef.current;
        const rect = content?.getBoundingClientRect();
        const mx = rect ? e.clientX - rect.left : 0;
        const timeAtCursor = mx / s.pxPerSec;
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const next = clamp(s.pxPerSec * factor, 8, 400);
        s.setPxPerSec(next);
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollLeft = timeAtCursor * next - (rect ? e.clientX - (scrollRef.current?.getBoundingClientRect().left ?? 0) : 0);
        });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---- toolbar actions ------------------------------------------------------------

  const doSplit = () => {
    const s = useEditor.getState();
    const n = s.splitAtPlayhead();
    if (n === 0) toast.info("วางเคอร์เซอร์บนคลิปก่อน แล้วกดแบ่งอีกครั้ง");
    else toast.success(`แบ่งคลิป ${n} จุดแล้ว`);
  };

  const doDelete = () => {
    const s = useEditor.getState();
    if (s.selectedIds.length === 0) {
      toast.info("เลือกคลิปก่อนลบ");
      return;
    }
    s.deleteClips(s.selectedIds);
    toast.success(`ลบ ${s.selectedIds.length} คลิปแล้ว`);
  };

  const doDuplicate = () => {
    const s = useEditor.getState();
    if (!s.selectedClipId) {
      toast.info("เลือกคลิปก่อน");
      return;
    }
    s.duplicateClip(s.selectedClipId);
    toast.success("ทำสำเนาคลิปแล้ว");
  };

  const zoomFit = () => {
    const sc = scrollRef.current;
    const s = useEditor.getState();
    const dur = Math.max(getDuration(s), 1);
    const w = (sc?.clientWidth ?? 800) - 40;
    s.setPxPerSec(clamp(w / dur, 8, 400));
  };

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
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        doSplit();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (s.selectedIds.length > 0) {
          e.preventDefault();
          s.deleteClips(s.selectedIds);
        }
      } else if (mod && (e.key === "d" || e.key === "D")) {
        if (s.selectedClipId) {
          e.preventDefault();
          s.duplicateClip(s.selectedClipId);
        }
      } else if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        s.redo();
      } else if (mod && (e.key === "c" || e.key === "C")) {
        s.copySelected();
      } else if (mod && (e.key === "x" || e.key === "X")) {
        if (s.selectedIds.length > 0) {
          e.preventDefault();
          s.cutSelected();
        }
      } else if (mod && (e.key === "v" || e.key === "V")) {
        s.pasteClipboard();
      } else if (mod && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        s.selectMany(s.clips.map((c) => c.id));
      } else if (e.key === "Escape") {
        s.select(null);
      } else if (e.key === "+" || e.key === "=") {
        s.setPxPerSec(s.pxPerSec * 1.25);
      } else if (e.key === "-") {
        s.setPxPerSec(s.pxPerSec / 1.25);
      } else if (e.key === "f" || e.key === "F") {
        zoomFit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- render ---------------------------------------------------------------------

  const selCount = selectedIds.length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0d0d12]">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.06] bg-[#12121a] px-2 py-1.5">
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-zinc-200 hover:bg-white/10" onClick={doSplit} title="แบ่งคลิปที่เคอร์เซอร์ (S)">
          <Scissors className="h-3.5 w-3.5" /> แบ่ง
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-zinc-200 hover:bg-white/10" onClick={doDelete} title="ลบคลิปที่เลือก (Delete)">
          <Trash2 className="h-3.5 w-3.5" /> ลบ
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-zinc-200 hover:bg-white/10" onClick={doDuplicate} title="ทำสำเนา (Ctrl+D)">
          <Copy className="h-3.5 w-3.5" /> ทำสำเนา
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-zinc-200 hover:bg-white/10"
          onClick={() => useEditor.getState().removeGaps()}
          title="ปิดช่องว่างทุกแทร็ก"
        >
          <Columns3 className="h-3.5 w-3.5" /> ปิดช่องว่าง
        </Button>
        <Button
          variant={compare ? "secondary" : "ghost"}
          size="sm"
          className={`h-7 gap-1.5 px-2 text-xs ${compare ? "bg-fuchsia-600/30 text-fuchsia-200 hover:bg-fuchsia-600/40" : "text-zinc-400 hover:bg-white/10"}`}
          onClick={() => useEditor.getState().setCompare(!compare)}
          title="เทียบเกรดสีก่อน/หลัง (B)"
        >
          <SplitSquareHorizontal className="h-3.5 w-3.5" /> เทียบสี
        </Button>
        <div className="mx-1 h-4 w-px bg-zinc-700" />
        <Button
          variant={snapping ? "secondary" : "ghost"}
          size="sm"
          className={`h-7 gap-1.5 px-2 text-xs ${snapping ? "bg-violet-600/30 text-violet-200 hover:bg-violet-600/40" : "text-zinc-400 hover:bg-white/10"}`}
          onClick={() => useEditor.getState().toggleSnapping()}
          title="สแน็ปขอบคลิป"
        >
          <Magnet className="h-3.5 w-3.5" /> สแน็ป
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-300" onClick={zoomFit} title="ซูมพอดีจอ (F)" aria-label="ซูมพอดีจอ">
            <Maximize className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-300" onClick={() => useEditor.getState().setPxPerSec(pxPerSec / 1.3)} aria-label="ซูมออก">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <input
            type="range"
            min={8}
            max={400}
            step={1}
            value={pxPerSec}
            onChange={(e) => useEditor.getState().setPxPerSec(Number(e.target.value))}
            className="h-1 w-24 accent-violet-500"
            aria-label="ระดับการซูม"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-300" onClick={() => useEditor.getState().setPxPerSec(pxPerSec * 1.3)} aria-label="ซูมเข้า">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* tracks area */}
      <div className="relative flex min-h-0 flex-1">
        {/* headers */}
        <div className="relative z-10 w-[148px] shrink-0 overflow-hidden border-r border-white/[0.06] bg-[#12121a]">
          <div style={{ height: TRACK_H }} className="border-b border-white/[0.06]" />
          <div ref={headerRef}>
            {tracks.map((track) => (
              <TrackHeader key={track.id} track={track} />
            ))}
          </div>
          <div className="px-2 pt-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-full gap-1 text-[11px] text-zinc-400 hover:bg-white/10">
                  <Plus className="h-3 w-3" /> เพิ่มแทร็ก
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="text-xs">
                <DropdownMenuItem onClick={() => useEditor.getState().addTrack("video")}>แทร็กวิดีโอ</DropdownMenuItem>
                <DropdownMenuItem onClick={() => useEditor.getState().addTrack("audio")}>แทร็กเสียง</DropdownMenuItem>
                <DropdownMenuItem onClick={() => useEditor.getState().addTrack("text")}>แทร็กข้อความ</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* scrollable content */}
        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-auto"
          onScroll={onScroll}
        >
          <div ref={contentRef} className="relative" style={{ width: contentW, minWidth: "100%" }}>
            {/* ruler */}
            <div
              className="sticky top-0 z-20 h-[44px] cursor-pointer border-b border-white/[0.06] bg-[#12121a]/95 backdrop-blur"
              onPointerDown={startSeek}
              onPointerMove={(e) => {
                if (dragRef.current?.mode === "seek") {
                  useEditor.getState().setPlayhead(timeFromEvent(e.clientX));
                }
              }}
              onPointerUp={endDrag}
            >
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 h-full select-none" style={{ left: t * pxPerSec }}>
                  <div className="h-2.5 w-px bg-zinc-600" />
                  <span className="ml-1 font-mono text-[10px] text-zinc-400">{formatTime(t)}</span>
                </div>
              ))}
            </div>

            {/* lanes */}
            {tracks.map((track) => (
              <div
                key={track.id}
                className={`relative border-b border-white/[0.05] ${dropTrackId === track.id ? "ring-1 ring-inset ring-fuchsia-400/70" : ""}`}
                style={{
                  height: TRACK_H,
                  background:
                    track.type === "audio"
                      ? "rgba(16,185,129,0.04)"
                      : track.type === "text"
                        ? "rgba(245,158,11,0.03)"
                        : undefined,
                }}
                onDragOver={(e) => onLaneDragOver(e, track.id)}
                onDragLeave={() => setDropTrackId((cur) => (cur === track.id ? null : cur))}
                onDrop={(e) => onLaneDrop(e, track)}
              >
                <div
                  className="absolute inset-0"
                  onPointerDown={(e) => onLanePointerDown(e, e.currentTarget as HTMLDivElement)}
                  onPointerMove={onLanePointerMove}
                  onPointerUp={onLanePointerUp}
                >
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div className="absolute inset-0" />
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-56">
                      <ContextMenuItem disabled={!hasClipboard()} onClick={() => useEditor.getState().pasteClipboard()}>
                        วางคลิปที่เคอร์เซอร์ (Ctrl+V)
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => useEditor.getState().selectMany(clips.filter((c) => c.trackId === track.id).map((c) => c.id))}>
                        เลือกคลิปทั้งหมดบนแทร็กนี้
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => useEditor.getState().addTrack(track.type)}>
                        เพิ่มแทร็ก{track.type === "video" ? "วิดีโอ" : track.type === "audio" ? "เสียง" : "ข้อความ"}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => useEditor.getState().removeGaps(track.id)}>
                        ปิดช่องว่างบนแทร็กนี้
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => useEditor.getState().removeTrack(track.id)} className="text-rose-300 focus:text-rose-200">
                        ลบแทร็กนี้
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </div>

                {clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip) => {
                    const type = clipTrackType(clip);
                    return (
                      <ClipView
                        key={clip.id}
                        clip={clip}
                        mediaItem={media.find((m) => m.id === clip.mediaId)}
                        pxPerSec={pxPerSec}
                        selected={selSet.has(clip.id)}
                        primary={clip.id === (selectedIds[selectedIds.length - 1] ?? null)}
                        multi={selSet.size > 1}
                        trackType={type}
                        editing={editingTextId === clip.id}
                        onStartEdit={() => setEditingTextId(clip.id)}
                        onEndEdit={() => setEditingTextId(null)}
                        onBeginDrag={beginDrag}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                      />
                    );
                  })}
              </div>
            ))}

            {/* marquee selection box */}
            <div
              ref={marqueeRef}
              className="pointer-events-none absolute z-40 hidden rounded border border-fuchsia-400/80 bg-fuchsia-400/10"
            />

            {/* playhead — moved via ref, zero React re-render */}
            <div
              ref={playheadRef}
              className="pointer-events-none absolute top-0 z-30 h-full w-0 will-change-transform"
            >
              <div className="absolute top-0 h-full w-[2px] -translate-x-1/2 bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]" />
              <div className="absolute top-0 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-rose-500" />
            </div>
          </div>
        </div>

        {/* drag hint overlay */}
        {dragging && (
          <div className="pointer-events-none absolute right-3 top-3 z-50 rounded bg-black/60 px-2 py-1 text-[10px] text-zinc-300 backdrop-blur">
            ลากเพื่อย้าย · ลากขอบเพื่อตัด · จับคู่สแน็ปอัตโนมัติ
          </div>
        )}
      </div>

      {/* status bar */}
      <div className="flex items-center justify-between border-t border-white/[0.06] bg-[#101016] px-3 py-1 text-[10px] text-zinc-500">
        <span>
          ดับเบิลคลิกคลิปข้อความ = แก้ข้อความ · Alt+ลาก = ทำสำเนา · Ctrl+คลิก = เลือกเพิ่ม · ลากขอบคลิป = ตัดความยาว
        </span>
        <span className="font-mono tabular-nums">
          {clips.length} คลิป{selCount > 0 ? ` · เลือก ${selCount}` : ""} · ความยาว {formatTimeFull(duration)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClipView (memoized)
// ---------------------------------------------------------------------------

interface ClipViewProps {
  clip: Clip;
  mediaItem?: MediaItem;
  pxPerSec: number;
  selected: boolean;
  primary: boolean;
  multi: boolean;
  trackType: string;
  editing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onBeginDrag: (e: React.PointerEvent, clip: Clip, mode: "move" | "trim-left" | "trim-right") => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}

const ClipView = memo(function ClipView({
  clip,
  mediaItem,
  pxPerSec,
  selected,
  primary,
  multi,
  trackType,
  editing,
  onStartEdit,
  onEndEdit,
  onBeginDrag,
  onPointerMove,
  onPointerUp,
}: ClipViewProps) {
  const width = Math.max(8, clip.duration * pxPerSec);
  const graded = clip.kind === "media" && isGraded(clip.props);
  const color =
    clip.kind === "text"
      ? "border-amber-300/40 text-amber-50"
      : trackType === "audio"
        ? "border-emerald-300/30 text-emerald-50"
        : "border-violet-300/30 text-violet-50";
  const bg =
    clip.kind === "text"
      ? "bg-gradient-to-b from-amber-500/80 to-amber-600/80"
      : trackType === "audio"
        ? "bg-gradient-to-b from-emerald-700/70 to-emerald-800/70"
        : "bg-gradient-to-b from-violet-700/70 to-violet-800/70";

  const handleDoubleClick = () => {
    if (clip.kind === "text") {
      onStartEdit();
    } else {
      const s = useEditor.getState();
      s.select(clip.id);
      s.setPlayhead(clip.start + 0.01);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          aria-label={`คลิป ${clip.name}`}
          className={`group absolute top-1 flex h-[calc(100%-8px)] cursor-grab select-none items-center overflow-hidden rounded-md border ${color} ${bg} ${
            selected ? "ring-2 ring-fuchsia-300 ring-offset-1 ring-offset-[#0d0d12]" : ""
          } ${primary && multi ? "ring-1 ring-fuchsia-300/60" : ""} transition-shadow`}
          style={{ left: clip.start * pxPerSec, width }}
          onPointerDown={(e) => onBeginDrag(e, clip, "move")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={handleDoubleClick}
          onKeyDown={(e) => {
            if (e.key === "Enter") useEditor.getState().select(clip.id);
          }}
        >
          {/* trim handles */}
          <div
            className="absolute left-0 top-0 z-10 h-full w-2.5 cursor-col-resize bg-white/0 transition-colors hover:bg-white/30"
            onPointerDown={(e) => onBeginDrag(e, clip, "trim-left")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          <div
            className="absolute right-0 top-0 z-10 h-full w-2.5 cursor-col-resize bg-white/0 transition-colors hover:bg-white/30"
            onPointerDown={(e) => onBeginDrag(e, clip, "trim-right")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />

          {/* visuals */}
          {clip.kind === "media" && trackType === "video" && mediaItem && (
            <Filmstrip
              media={mediaItem}
              width={width}
              height={TRACK_H - 8}
              inPoint={clip.inPoint}
              srcDur={clip.duration * clip.props.speed}
            />
          )}
          {clip.kind === "media" && trackType === "audio" && mediaItem && (
            <Waveform
              media={mediaItem}
              width={width}
              height={TRACK_H - 8}
              inPoint={clip.inPoint}
              srcDur={clip.duration * clip.props.speed}
            />
          )}

          {/* label */}
          <div className="pointer-events-none relative z-[5] flex min-w-0 flex-1 items-center gap-1.5 bg-gradient-to-r from-black/55 via-black/25 to-transparent px-3 py-0.5">
            {clip.kind === "text" ? (
              <Type className="h-3 w-3 shrink-0" />
            ) : trackType === "audio" ? (
              <Music2 className="h-3 w-3 shrink-0" />
            ) : (
              <Film className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate text-[11px] font-medium">{clip.name}</span>
            {graded && (
              <span className="shrink-0 rounded bg-fuchsia-500/80 px-1 text-[8px] font-bold uppercase text-white">
                สี
              </span>
            )}
            <span className="ml-auto shrink-0 font-mono text-[9px] opacity-80">
              {clip.duration.toFixed(1)}s
            </span>
          </div>

          {/* fade indicators */}
          {clip.props.fadeIn > 0 && (
            <div
              className="pointer-events-none absolute left-0 top-0 z-[4] h-full bg-gradient-to-r from-white/40 to-transparent"
              style={{ width: clip.props.fadeIn * pxPerSec }}
            />
          )}
          {clip.props.fadeOut > 0 && (
            <div
              className="pointer-events-none absolute right-0 top-0 z-[4] h-full bg-gradient-to-l from-white/40 to-transparent"
              style={{ width: clip.props.fadeOut * pxPerSec }}
            />
          )}

          {/* inline text editor */}
          {editing && (
            <div
              className="absolute inset-x-1 top-1 z-30"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <textarea
                autoFocus
                defaultValue={clip.props.text}
                rows={2}
                className="w-full resize-none rounded border border-amber-300/60 bg-zinc-900/95 p-1.5 text-[11px] text-zinc-100 outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    useEditor.getState().updateClipProps(clip.id, { text: (e.target as HTMLTextAreaElement).value });
                    onEndEdit();
                  } else if (e.key === "Escape") {
                    onEndEdit();
                  }
                }}
                onBlur={(e) => {
                  useEditor.getState().updateClipProps(clip.id, { text: e.target.value });
                  onEndEdit();
                }}
              />
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ClipMenu clip={clip} />
    </ContextMenu>
  );
});

/** Context menu content for a clip (isolated so memo stays cheap) */
function ClipMenu({ clip }: { clip: Clip }) {
  const media = useEditor((s) => s.media);
  const selCount = useEditor((s) => s.selectedIds.length);
  const isVideoWithAudio = clip.kind === "media" && media.find((m) => m.id === clip.mediaId)?.type === "video";
  const idsForAction = selCount > 1 ? undefined : [clip.id];

  const act = () => {
    const st = useEditor.getState();
    return idsForAction ?? st.selectedIds;
  };

  return (
    <ContextMenuContent className="w-64">
      <ContextMenuItem
        onClick={() => {
          const st = useEditor.getState();
          const n = st.splitAtPlayhead();
          if (n === 0) toast.info("วางเคอร์เซอร์บนคลิปก่อน แล้วแบ่งอีกครั้ง");
        }}
        className="gap-2"
      >
        <Scissors className="h-3.5 w-3.5" /> แบ่งที่เคอร์เซอร์
        <span className="ml-auto text-[10px] text-zinc-500">S</span>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => {
          const st = useEditor.getState();
          st.select(clip.id);
          st.copySelected();
          toast.success("คัดลอกคลิปแล้ว — Ctrl+V เพื่อวาง");
        }}
        className="gap-2"
      >
        <Clipboard className="h-3.5 w-3.5" /> คัดลอกคลิป
      </ContextMenuItem>
      <ContextMenuItem onClick={() => useEditor.getState().duplicateClip(clip.id)} className="gap-2">
        <Copy className="h-3.5 w-3.5" /> ทำสำเนาต่อท้าย
        <span className="ml-auto text-[10px] text-zinc-500">Ctrl+D</span>
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!hasClipboard()}
        onClick={() => useEditor.getState().pasteClipboard()}
        className="gap-2"
      >
        <ClipboardPaste className="h-3.5 w-3.5" /> วางคลิปที่เคอร์เซอร์
        <span className="ml-auto text-[10px] text-zinc-500">Ctrl+V</span>
      </ContextMenuItem>
      <ContextMenuSeparator />
      {isVideoWithAudio && (
        <ContextMenuItem
          onClick={() => {
            useEditor.getState().detachAudio(clip.id);
            toast.success("แยกเสียงออกเป็นแทร็กเสียงแล้ว");
          }}
          className="gap-2"
        >
          <Music2 className="h-3.5 w-3.5" /> แยกเสียงออกจากวิดีโอ
        </ContextMenuItem>
      )}
      {clip.kind === "media" && (
        <>
          <ContextMenuItem
            onClick={() => {
              useEditor.getState().updateClipProps(clip.id, { fadeIn: 1 });
              toast.success("เฟดเข้า 1 วินาที");
            }}
          >
            ใส่เฟดเข้า 1 วินาที
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              useEditor.getState().updateClipProps(clip.id, { fadeOut: 1 });
              toast.success("เฟดออก 1 วินาที");
            }}
          >
            ใส่เฟดออก 1 วินาที
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              useEditor.getState().updateClipProps(clip.id, { muted: !clip.props.muted });
            }}
          >
            {clip.props.muted ? "เปิดเสียงคลิปนี้" : "ปิดเสียงคลิปนี้"}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              useEditor.getState().updateClipProps(clip.id, { speed: clip.props.speed === 1 ? 1.5 : 1 });
              toast.success(clip.props.speed === 1 ? "ความเร็ว 1.5×" : "กลับเป็น 1×");
            }}
          >
            สลับความเร็ว 1× ↔ 1.5×
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      {clip.kind === "media" && (
        <>
          <ContextMenuItem
            onClick={() => {
              copyGrade(clip.props);
              toast.success("คัดลอกเกรดสีแล้ว — คลิกขวาคลิปอื่นเพื่อวาง");
            }}
          >
            คัดลอกเกรดสี
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!hasGradeClipboard()}
            onClick={() => {
              const g = pasteGrade();
              if (g) {
                useEditor.getState().updateClipProps(clip.id, g);
                toast.success("วางเกรดสีแล้ว");
              }
            }}
          >
            วางเกรดสี
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!isGraded(clip.props)}
            onClick={() => {
              useEditor.getState().updateClipProps(clip.id, {
                brightness: 100, contrast: 100, saturation: 100, hue: 0, grayscale: 0, sepia: 0,
                liftM: 0, liftR: 0, liftG: 0, liftB: 0, gammaM: 0, gammaR: 0, gammaG: 0, gammaB: 0,
                gainM: 0, gainR: 0, gainG: 0, gainB: 0, temp: 0, tint: 0, highlights: 0, shadows: 0,
                fade: 0, vignette: 0, grain: 0, sharpen: 0, curves: null,
              });
              toast.success("รีเซ็ตเกรดสีแล้ว");
            }}
          >
            รีเซ็ตเกรดสี
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => useEditor.getState().deleteClips(act())}
        className="gap-2 text-rose-300 focus:text-rose-200"
      >
        <Trash2 className="h-3.5 w-3.5" /> ลบคลิป
        <span className="ml-auto text-[10px] text-zinc-500">Del</span>
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          const st = useEditor.getState();
          const ids = st.selectedIds.includes(clip.id) && st.selectedIds.length > 1 ? st.selectedIds : [clip.id];
          st.deleteClips(ids, true);
          toast.success("ลบแล้วเลื่อนคลิปหลังมาแทน");
        }}
      >
        ลบแล้วรื้อ (Ripple Delete)
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

// ---------------------------------------------------------------------------
// Filmstrip / Waveform canvases
// ---------------------------------------------------------------------------

function Filmstrip({ media, width, height, inPoint, srcDur }: {
  media: MediaItem;
  width: number;
  height: number;
  inPoint: number;
  srcDur: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tiles, setTiles] = useState<string[] | undefined>(() => getFilmstrip(media.id));

  useEffect(() => {
    let alive = true;
    if (!getFilmstrip(media.id) && !isWaveLoading(media.id)) {
      ensureFilmstrip(media).then((t) => {
        if (alive) setTiles(t);
      });
    }
    return () => {
      alive = false;
    };
  }, [media]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    if (!tiles || tiles.length === 0 || !media.duration) {
      const g = ctx.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, "rgba(139,92,246,0.35)");
      g.addColorStop(1, "rgba(76,29,149,0.35)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      return;
    }
    const imgs = tiles.map((t) => {
      const img = new Image();
      img.src = t;
      return img;
    });
    const draw = () => {
      const tileDur = media.duration / tiles.length;
      const clipSrcDur = Math.max(0.01, srcDur);
      let prevEdge = -1;
      for (let i = 0; i < tiles.length; i++) {
        const t0 = i * tileDur;
        const t1 = (i + 1) * tileDur;
        if (t1 <= inPoint || t0 >= inPoint + clipSrcDur) continue;
        const x0 = Math.max(0, ((t0 - inPoint) / clipSrcDur) * width);
        const x1 = Math.min(width, ((t1 - inPoint) / clipSrcDur) * width);
        const w = x1 - x0;
        if (w <= 0) continue;
        const img = imgs[i];
        if (img.complete && img.naturalWidth > 0) {
          // cover-crop the tile into the slice
          const sliceAspect = w / height;
          const imgAspect = img.naturalWidth / img.naturalHeight;
          let sw = img.naturalWidth;
          let sh = img.naturalHeight;
          let sx = 0;
          let sy = 0;
          if (imgAspect > sliceAspect) {
            sw = img.naturalHeight * sliceAspect;
            sx = (img.naturalWidth - sw) / 2;
          } else {
            sh = img.naturalWidth / sliceAspect;
            sy = (img.naturalHeight - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, x0, 0, w, height);
        }
        if (x0 > prevEdge + 0.5) {
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(x0, 0, 1, height);
        }
        prevEdge = x1;
      }
    };
    if (imgs.every((im) => im.complete)) {
      draw();
    } else {
      let remaining = imgs.length;
      const onOne = () => {
        remaining -= 1;
        if (remaining <= 0) draw();
      };
      for (const im of imgs) {
        im.onload = onOne;
        im.onerror = onOne;
      }
      setTimeout(draw, 400);
    }
  }, [tiles, width, height, inPoint, srcDur, media.duration]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{ width: "100%", height: "100%" }} />;
}

function Waveform({ media, width, height, inPoint, srcDur }: {
  media: MediaItem;
  width: number;
  height: number;
  inPoint: number;
  srcDur: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | undefined>(() => getWaveform(media.id));

  useEffect(() => {
    let alive = true;
    if (!getWaveform(media.id) && !isWaveLoading(media.id)) {
      ensureWaveform(media).then((p) => {
        if (alive) setPeaks(p ?? undefined);
      });
    }
    return () => {
      alive = false;
    };
  }, [media]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(16,185,129,0.12)";
    ctx.fillRect(0, 0, width, height);
    if (!peaks) return;
    const mid = height / 2;
    const slice = waveSlice(peaks, media.duration, inPoint, inPoint + Math.max(0.01, srcDur), Math.floor(width));
    ctx.fillStyle = "rgba(110,231,183,0.85)";
    for (let x = 0; x < slice.length; x++) {
      const h = Math.max(1, slice[x] * (height * 0.85));
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
  }, [peaks, width, height, inPoint, srcDur, media.duration]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{ width: "100%", height: "100%" }} />;
}

// ---------------------------------------------------------------------------
// Track header
// ---------------------------------------------------------------------------

function TrackHeader({ track }: { track: Track }) {
  const updateTrack = useEditor((s) => s.updateTrack);
  const removeTrack = useEditor((s) => s.removeTrack);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="flex items-center gap-1 border-b border-white/[0.05] px-2"
          style={{ height: TRACK_H }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium text-zinc-200">{track.name}</div>
            <div className="text-[9px] text-zinc-500">
              {track.type === "video" ? "วิดีโอ" : track.type === "audio" ? "เสียง" : "ข้อความ"}
            </div>
          </div>
          {track.type !== "text" && (
            <button
              className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              title={track.muted ? "ปิดเสียงอยู่ — กดเปิด" : "เปิดเสียงอยู่ — กดปิด"}
              onClick={() => updateTrack(track.id, { muted: !track.muted })}
            >
              {track.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          )}
          {track.type === "video" && (
            <button
              className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              title={track.hidden ? "ซ่อนอยู่ — กดแสดง" : "แสดงอยู่ — กดซ่อน"}
              onClick={() => updateTrack(track.id, { hidden: !track.hidden })}
            >
              {track.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-rose-300"
            title="ลบแทร็กนี้"
            onClick={() => removeTrack(track.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          onClick={() => {
            const name = prompt("ชื่อแทร็ก", track.name);
            if (name !== null && name.trim()) {
              updateTrack(track.id, { name: name.trim() });
            }
          }}
        >
          เปลี่ยนชื่อแทร็ก
        </ContextMenuItem>
        {track.type !== "text" && (
          <ContextMenuItem onClick={() => updateTrack(track.id, { muted: !track.muted })}>
            {track.muted ? "เปิดเสียงแทร็ก" : "ปิดเสียงแทร็ก"}
          </ContextMenuItem>
        )}
        {track.type === "video" && (
          <ContextMenuItem onClick={() => updateTrack(track.id, { hidden: !track.hidden })}>
            {track.hidden ? "แสดงแทร็ก" : "ซ่อนแทร็ก"}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => useEditor.getState().addTrack(track.type)}>
          เพิ่มแทร็ก{track.type === "video" ? "วิดีโอ" : track.type === "audio" ? "เสียง" : "ข้อความ"}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => removeTrack(track.id)}
          className="text-rose-300 focus:text-rose-200"
        >
          ลบแทร็กนี้
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
