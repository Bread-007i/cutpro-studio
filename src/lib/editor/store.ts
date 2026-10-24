"use client";

import { create } from "zustand";
import type { AspectRatio, Clip, ClipProps, MediaItem, Track, TrackType } from "./types";
import { DEFAULT_PROPS, IMAGE_DEFAULT_DURATION } from "./types";
import { clamp, snapTime, trackEnd, uid } from "./utils";

interface Snapshot {
  media: MediaItem[];
  tracks: Track[];
  clips: Clip[];
}

export interface EditorState {
  media: MediaItem[];
  tracks: Track[];
  clips: Clip[];
  selectedIds: string[];
  selectedClipId: string | null; // primary selection (first)
  playhead: number;
  playing: boolean;
  pxPerSec: number;
  snapping: boolean;
  aspect: AspectRatio;
  compare: boolean; // before/after grade split
  past: Snapshot[];
  future: Snapshot[];

  // media
  addMedia: (m: MediaItem) => void;
  removeMedia: (id: string) => void;
  renameMedia: (id: string, name: string) => void;

  // clips
  addClipFromMedia: (mediaId: string, opts?: { trackId?: string; at?: number }) => string | null;
  addTextClip: (preset?: Partial<ClipProps>, at?: number, record?: boolean) => string | null;
  splitAtPlayhead: () => number;
  splitClipAtTimes: (clipId: string, mediaTimes: number[]) => void;
  deleteClip: (id: string, ripple?: boolean) => void;
  deleteClips: (ids: string[], ripple?: boolean) => void;
  duplicateClip: (id: string) => void;
  moveClip: (id: string, start: number, trackId: string, record?: boolean) => void;
  trimClip: (id: string, edge: "left" | "right", time: number, record?: boolean) => void;
  updateClipProps: (id: string, patch: Partial<ClipProps>) => void;
  updateClipsProps: (ids: string[], patch: Partial<ClipProps>) => void;
  removeGaps: (trackId?: string) => void;
  replaceSegments: (clipId: string, segments: { inPoint: number; duration: number }[]) => void;
  detachAudio: (clipId: string) => void;

  // clipboard
  copySelected: () => void;
  cutSelected: () => void;
  pasteClipboard: () => void;

  // tracks
  addTrack: (type: TrackType, opts?: { beforeTrackId?: string }) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  removeTrack: (id: string) => void;

  // transport / ui
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  togglePlay: () => void;
  setPxPerSec: (n: number) => void;
  toggleSnapping: () => void;
  setAspect: (a: AspectRatio) => void;
  select: (id: string | null) => void;
  toggleSelect: (id: string) => void;
  selectMany: (ids: string[]) => void;
  setCompare: (v: boolean) => void;
  clearProject: () => void;
  newProject: () => void;

  // history
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
}

/** Module-level clip clipboard (not part of history) */
let clipClipboard: Clip[] = [];

function defaultTracks(): Track[] {
  return [
    { id: uid(), type: "text", name: "ข้อความ", muted: false, hidden: false },
    { id: uid(), type: "video", name: "วิดีโอ 1", muted: false, hidden: false },
    { id: uid(), type: "video", name: "วิดีโอ 2", muted: false, hidden: false },
    { id: uid(), type: "audio", name: "เสียง 1", muted: false, hidden: false },
  ];
}

function cloneState(s: EditorState): Snapshot {
  return {
    media: s.media.map((m) => ({ ...m })),
    tracks: s.tracks.map((t) => ({ ...t })),
    clips: s.clips.map((c) => ({ ...c, props: { ...c.props } })),
  };
}

export function getDuration(s: { clips: Clip[] }): number {
  let d = 0;
  for (const c of s.clips) d = Math.max(d, c.start + c.duration);
  return d;
}

export function getClipTrackType(clip: Clip, media: MediaItem[]): TrackType {
  if (clip.kind === "text") return "text";
  const m = media.find((mm) => mm.id === clip.mediaId);
  return m?.type === "audio" ? "audio" : "video";
}

export function hasClipboard(): boolean {
  return clipClipboard.length > 0;
}

export const useEditor = create<EditorState>((set, get) => ({
  media: [],
  tracks: defaultTracks(),
  clips: [],
  selectedIds: [],
  selectedClipId: null,
  playhead: 0,
  playing: false,
  pxPerSec: 60,
  snapping: true,
  aspect: "16:9",
  compare: false,
  past: [],
  future: [],

  pushHistory: () => {
    const s = get();
    const snap = cloneState(s);
    set({ past: [...s.past.slice(-59), snap], future: [] });
  },

  undo: () => {
    const s = get();
    if (s.past.length === 0) return;
    const prev = s.past[s.past.length - 1];
    const cur = cloneState(s);
    set({
      past: s.past.slice(0, -1),
      future: [...s.future, cur],
      tracks: prev.tracks,
      clips: prev.clips,
      media: prev.media,
      playing: false,
      selectedIds: s.selectedIds.filter((id) => prev.clips.some((c) => c.id === id)),
      selectedClipId: prev.clips.find((c) => c.id === s.selectedClipId)?.id ?? null,
    });
  },

  redo: () => {
    const s = get();
    if (s.future.length === 0) return;
    const next = s.future[s.future.length - 1];
    const cur = cloneState(s);
    set({
      future: s.future.slice(0, -1),
      past: [...s.past, cur],
      tracks: next.tracks,
      clips: next.clips,
      media: next.media,
      playing: false,
      selectedIds: s.selectedIds.filter((id) => next.clips.some((c) => c.id === id)),
      selectedClipId: next.clips.find((c) => c.id === s.selectedClipId)?.id ?? null,
    });
  },

  addMedia: (m) => {
    get().pushHistory();
    set((s) => ({ media: [...s.media, m] }));
  },

  removeMedia: (id) => {
    const s = get();
    s.pushHistory();
    set((st) => {
      const removedClipIds = st.clips.filter((c) => c.mediaId === id).map((c) => c.id);
      return {
        media: st.media.filter((m) => m.id !== id),
        clips: st.clips.filter((c) => c.mediaId !== id),
        selectedIds: st.selectedIds.filter((sid) => !removedClipIds.includes(sid)),
        selectedClipId: removedClipIds.includes(st.selectedClipId ?? "") ? null : st.selectedClipId,
      };
    });
  },

  renameMedia: (id, name) => {
    set((st) => ({
      media: st.media.map((m) => (m.id === id ? { ...m, name } : m)),
      clips: st.clips.map((c) => (c.mediaId === id ? { ...c, name } : c)),
    }));
  },

  addClipFromMedia: (mediaId, opts) => {
    const s = get();
    const m = s.media.find((mm) => mm.id === mediaId);
    if (!m) return null;
    const trackType: TrackType = m.type === "audio" ? "audio" : "video";
    let trackId = opts?.trackId;
    if (!trackId || s.tracks.find((t) => t.id === trackId)?.type !== trackType) {
      const t = s.tracks.find((tr) => tr.type === trackType);
      if (!t) return null;
      trackId = t.id;
    }
    const duration = m.type === "image" ? IMAGE_DEFAULT_DURATION : m.duration;
    const start =
      opts?.at !== undefined
        ? Math.max(0, opts.at)
        : trackEnd(s.clips, trackId);
    const clip: Clip = {
      id: uid(),
      trackId,
      mediaId,
      kind: "media",
      name: m.name,
      start,
      duration,
      inPoint: 0,
      props: { ...DEFAULT_PROPS, muted: m.type === "video" ? false : m.type === "image" },
    };
    get().pushHistory();
    set((st) => ({ clips: [...st.clips, clip], selectedIds: [clip.id], selectedClipId: clip.id }));
    return clip.id;
  },

  addTextClip: (preset, at, record = true) => {
    const s = get();
    const textTrack = s.tracks.find((t) => t.type === "text");
    if (!textTrack) return null;
    const start = Math.max(0, at ?? s.playhead);
    const clip: Clip = {
      id: uid(),
      trackId: textTrack.id,
      kind: "text",
      name: (preset?.text ?? "ข้อความใหม่").slice(0, 24) || "ข้อความ",
      start,
      duration: 3,
      inPoint: 0,
      props: { ...DEFAULT_PROPS, ...preset },
    };
    if (record) get().pushHistory();
    set((st) => ({ clips: [...st.clips, clip], selectedIds: [clip.id], selectedClipId: clip.id }));
    return clip.id;
  },

  splitAtPlayhead: () => {
    const s = get();
    const t = s.playhead;
    const selectedSet = new Set(s.selectedIds);
    const targets = s.clips.filter((c) => {
      const inRange = t > c.start + 0.05 && t < c.start + c.duration - 0.05;
      if (!inRange) return false;
      if (selectedSet.size > 0) return selectedSet.has(c.id);
      return true;
    });
    if (targets.length === 0) return 0;
    s.pushHistory();
    set((st) => {
      const clips = [...st.clips];
      const newIds: string[] = [];
      for (const target of targets) {
        const idx = clips.findIndex((c) => c.id === target.id);
        if (idx < 0) continue;
        const c = clips[idx];
        const offset = t - c.start;
        const left: Clip = { ...c, props: { ...c.props }, duration: offset };
        const right: Clip = {
          ...c,
          id: uid(),
          props: { ...c.props },
          start: t,
          duration: c.duration - offset,
          inPoint: c.inPoint + offset * c.props.speed,
        };
        clips[idx] = left;
        clips.splice(idx + 1, 0, right);
        newIds.push(right.id);
      }
      return { clips, selectedIds: newIds, selectedClipId: newIds[0] ?? null };
    });
    return targets.length;
  },

  splitClipAtTimes: (clipId, mediaTimes) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const times = mediaTimes
      .map((mt) => clip.start + (mt - clip.inPoint) / clip.props.speed)
      .filter((t) => t > clip.start + 0.08 && t < clip.start + clip.duration - 0.08)
      .sort((a, b) => a - b);
    if (times.length === 0) return;
    s.pushHistory();
    set((st) => {
      const clips = st.clips.filter((c) => c.id !== clipId);
      let cursor = clip.start;
      let inPoint = clip.inPoint;
      const pieces: Clip[] = [];
      const boundaries = [clip.start, ...times, clip.start + clip.duration];
      for (let i = 1; i < boundaries.length; i++) {
        const segDur = boundaries[i] - boundaries[i - 1];
        if (segDur < 0.04) continue;
        pieces.push({
          ...clip,
          id: uid(),
          props: { ...clip.props },
          start: cursor,
          duration: segDur,
          inPoint,
        });
        cursor += segDur;
        inPoint += segDur * clip.props.speed;
      }
      clips.push(...pieces);
      return { clips };
    });
  },

  deleteClip: (id, ripple = false) => {
    get().deleteClips([id], ripple);
  },

  deleteClips: (ids, ripple = false) => {
    const s = get();
    const target = s.clips.filter((c) => ids.includes(c.id));
    if (target.length === 0) return;
    s.pushHistory();
    const idSet = new Set(ids);
    set((st) => {
      let clips = st.clips.filter((c) => !idSet.has(c.id));
      if (ripple) {
        // ripple per track
        for (const removed of target) {
          let shift = removed.duration;
          clips = clips.map((c) =>
            c.trackId === removed.trackId && c.start >= removed.start - 1e-6
              ? { ...c, start: Math.max(0, c.start - shift) }
              : c
          );
          shift = 0;
        }
      }
      return {
        clips,
        selectedIds: st.selectedIds.filter((sid) => !idSet.has(sid)),
        selectedClipId:
          st.selectedClipId && idSet.has(st.selectedClipId) ? null : st.selectedClipId,
      };
    });
  },

  duplicateClip: (id) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip) return;
    s.pushHistory();
    const copy: Clip = {
      ...clip,
      id: uid(),
      props: { ...clip.props },
      start: clip.start + clip.duration,
    };
    set((st) => ({ clips: [...st.clips, copy], selectedIds: [copy.id], selectedClipId: copy.id }));
  },

  moveClip: (id, start, trackId, record = true) => {
    const s = get();
    if (record) s.pushHistory();
    set((st) => ({
      clips: st.clips.map((c) =>
        c.id === id ? { ...c, start: Math.max(0, start), trackId } : c
      ),
    }));
  },

  trimClip: (id, edge, time, record = true) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip) return;
    if (record) s.pushHistory();
    const media = s.media.find((m) => m.id === clip.mediaId);
    const speed = clip.props.speed;

    if (edge === "left") {
      const minStart = clip.start - clip.inPoint / speed; // inPoint >= 0
      const maxStart = clip.start + clip.duration - 0.1;
      let newStart = clamp(time, Math.max(0, minStart), maxStart);
      if (newStart < 0) newStart = 0;
      const delta = newStart - clip.start;
      set((st) => ({
        clips: st.clips.map((c) =>
          c.id === id
            ? { ...c, start: newStart, duration: c.duration - delta, inPoint: Math.max(0, c.inPoint + delta * speed) }
            : c
        ),
      }));
    } else {
      const minEnd = clip.start + 0.1;
      let maxEnd = Infinity;
      if (media && media.type !== "image") {
        maxEnd = clip.start + (media.duration - clip.inPoint) / speed;
      }
      const newEnd = clamp(time, minEnd, maxEnd);
      set((st) => ({
        clips: st.clips.map((c) =>
          c.id === id ? { ...c, duration: newEnd - c.start } : c
        ),
      }));
    }
  },

  updateClipProps: (id, patch) => {
    set((st) => ({
      clips: st.clips.map((c) =>
        c.id === id ? { ...c, props: { ...c.props, ...patch } } : c
      ),
    }));
  },

  updateClipsProps: (ids, patch) => {
    set((st) => ({
      clips: st.clips.map((c) =>
        ids.includes(c.id) ? { ...c, props: { ...c.props, ...patch } } : c
      ),
    }));
  },

  removeGaps: (trackId) => {
    const s = get();
    s.pushHistory();
    set((st) => {
      const trackIds = trackId ? [trackId] : st.tracks.map((t) => t.id);
      const clips = [...st.clips];
      for (const tid of trackIds) {
        const onTrack = clips
          .filter((c) => c.trackId === tid)
          .sort((a, b) => a.start - b.start);
        let cursor = 0;
        for (const c of onTrack) {
          const idx = clips.findIndex((cc) => cc.id === c.id);
          if (c.start > cursor) {
            clips[idx] = { ...clips[idx], start: cursor };
          }
          cursor = Math.max(cursor, clips[idx].start + clips[idx].duration);
        }
      }
      return { clips };
    });
  },

  replaceSegments: (clipId, segments) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === clipId);
    if (!clip || segments.length === 0) return;
    s.pushHistory();
    set((st) => {
      const others = st.clips.filter((c) => c.id !== clipId);
      let cursor = clip.start;
      const pieces: Clip[] = segments.map((seg) => {
        const piece: Clip = {
          ...clip,
          id: uid(),
          props: { ...clip.props },
          start: cursor,
          duration: seg.duration / clip.props.speed,
          inPoint: seg.inPoint,
        };
        cursor += piece.duration;
        return piece;
      });
      return { clips: [...others, ...pieces], selectedIds: [pieces[0]?.id ?? ""], selectedClipId: pieces[0]?.id ?? null };
    });
  },

  detachAudio: (clipId) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === clipId);
    if (!clip || clip.kind !== "media") return;
    const media = s.media.find((m) => m.id === clip.mediaId);
    if (!media || media.type === "image") return;
    const audioTrack = s.tracks.find((t) => t.type === "audio");
    if (!audioTrack) return;
    s.pushHistory();
    const audioClip: Clip = {
      ...clip,
      id: uid(),
      trackId: audioTrack.id,
      name: `${clip.name.replace(/\.(mp4|webm|mov|mkv|avi)$/i, "")} · เสียง`,
      start: clip.start,
      duration: clip.duration,
      inPoint: clip.inPoint,
      props: { ...clip.props, fadeIn: 0, fadeOut: 0 },
    };
    set((st) => ({
      clips: [
        ...st.clips.map((c) => (c.id === clipId ? { ...c, props: { ...c.props, muted: true } } : c)),
        audioClip,
      ],
      selectedIds: [audioClip.id],
      selectedClipId: audioClip.id,
    }));
  },

  copySelected: () => {
    const s = get();
    const sel = s.clips.filter((c) => s.selectedIds.includes(c.id));
    if (sel.length === 0) return;
    clipClipboard = sel.map((c) => ({ ...c, props: { ...c.props } }));
  },

  cutSelected: () => {
    const s = get();
    const sel = s.clips.filter((c) => s.selectedIds.includes(c.id));
    if (sel.length === 0) return;
    clipClipboard = sel.map((c) => ({ ...c, props: { ...c.props } }));
    s.deleteClips(s.selectedIds);
  },

  pasteClipboard: () => {
    if (clipClipboard.length === 0) return;
    const s = get();
    s.pushHistory();
    const minStart = Math.min(...clipClipboard.map((c) => c.start));
    const pasted: Clip[] = clipClipboard.map((c) => {
      const track = s.tracks.find((t) => t.id === c.trackId) ?? s.tracks.find((t) => t.type === "video");
      return {
        ...c,
        id: uid(),
        trackId: track ? track.id : c.trackId,
        start: Math.max(0, s.playhead + (c.start - minStart)),
        props: { ...c.props },
      };
    });
    set((st) => ({
      clips: [...st.clips, ...pasted],
      selectedIds: pasted.map((p) => p.id),
      selectedClipId: pasted[0]?.id ?? null,
    }));
  },

  addTrack: (type, opts) => {
    const s = get();
    s.pushHistory();
    const count = s.tracks.filter((t) => t.type === type).length + 1;
    const names: Record<TrackType, string> = { video: "วิดีโอ", audio: "เสียง", text: "ข้อความ" };
    const track: Track = { id: uid(), type, name: `${names[type]} ${count}`, muted: false, hidden: false };
    set((st) => {
      let tracks = [...st.tracks];
      if (opts?.beforeTrackId) {
        const idx = tracks.findIndex((t) => t.id === opts.beforeTrackId);
        if (idx >= 0) tracks.splice(idx, 0, track);
        else tracks.push(track);
      } else {
        tracks.push(track);
      }
      return { tracks };
    });
  },

  updateTrack: (id, patch) => {
    set((st) => ({
      tracks: st.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  },

  removeTrack: (id) => {
    const s = get();
    if (s.tracks.length <= 1) return;
    s.pushHistory();
    set((st) => {
      const removedClipIds = st.clips.filter((c) => c.trackId === id).map((c) => c.id);
      return {
        tracks: st.tracks.filter((t) => t.id !== id),
        clips: st.clips.filter((c) => c.trackId !== id),
        selectedIds: st.selectedIds.filter((sid) => !removedClipIds.includes(sid)),
        selectedClipId: removedClipIds.includes(st.selectedClipId ?? "") ? null : st.selectedClipId,
      };
    });
  },

  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (p) => set({ playing: p }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setPxPerSec: (n) => set({ pxPerSec: clamp(n, 8, 400) }),
  toggleSnapping: () => set((s) => ({ snapping: !s.snapping })),
  setAspect: (a) => set({ aspect: a }),
  select: (id) => set({ selectedIds: id ? [id] : [], selectedClipId: id }),
  toggleSelect: (id) =>
    set((s) => {
      const has = s.selectedIds.includes(id);
      const next = has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id];
      return { selectedIds: next, selectedClipId: next[next.length - 1] ?? null };
    }),
  selectMany: (ids) =>
    set({ selectedIds: ids, selectedClipId: ids[ids.length - 1] ?? null }),
  setCompare: (v) => set({ compare: v }),
  clearProject: () => {
    const s = get();
    s.pushHistory();
    set({ clips: [], media: [], selectedIds: [], selectedClipId: null, playhead: 0, playing: false });
  },
  newProject: () =>
    set({
      media: [],
      tracks: defaultTracks(),
      clips: [],
      selectedIds: [],
      selectedClipId: null,
      playhead: 0,
      playing: false,
      pxPerSec: 60,
      snapping: true,
      aspect: "16:9",
      compare: false,
      past: [],
      future: [],
    }),
}));

/** Snap helper bound to current store settings */
export function snapIfEnabled(t: number, extraCandidates: number[] = []): number {
  const s = useEditor.getState();
  if (!s.snapping) return t;
  const candidates = new Set<number>([0, s.playhead]);
  for (const c of s.clips) {
    candidates.add(c.start);
    candidates.add(c.start + c.duration);
  }
  for (const e of extraCandidates) candidates.add(e);
  const threshold = 8 / s.pxPerSec;
  const { time } = snapTime(t, [...candidates], threshold);
  return time;
}
