"use client";

import { useCallback, useRef, useState } from "react";
import {
  Clapperboard,
  FileAudio,
  FileVideo,
  Image as ImageIcon,
  Sparkles,
  Type,
  Upload,
  Wand2,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  blobToBase64,
  detectScenes,
  detectSilence,
  extractWav,
  splitTextForCaptions,
} from "@/lib/editor/analysis";
import { getClipTrackType, useEditor } from "@/lib/editor/store";
import type { ClipProps, MediaItem } from "@/lib/editor/types";
import { DEFAULT_PROPS, IMAGE_DEFAULT_DURATION } from "@/lib/editor/types";
import { formatTime, uid } from "@/lib/editor/utils";
import { LOOKS, NEUTRAL_GRADE } from "@/lib/editor/color";
import { ensureFilmstrip } from "@/lib/editor/thumbCache";

const TEXT_PRESETS: { name: string; desc: string; props: Partial<ClipProps> }[] = [
  { name: "หัวข้อใหญ่", desc: "กลางจอ ตัวใหญ่", props: { text: "หัวข้อหลัก", fontSize: 96, fontWeight: 800, y: -0.05, textBg: 0 } },
  { name: "ซับไทเทิล", desc: "ล่างจอ พร้อมแถบดำ", props: { text: "ซับไทเทิล", fontSize: 44, fontWeight: 600, y: 0.38, textBg: 0.55 } },
  { name: "แคปชั่นกลาง", desc: "กลางจอ อ่านง่าย", props: { text: "แคปชั่น", fontSize: 56, fontWeight: 700, y: 0.1, textBg: 0.35 } },
  { name: "ป้ายมุมล่าง", desc: "เหมาะกับชื่อคน/สถานที่", props: { text: "ชื่อ-สถานที่", fontSize: 36, fontWeight: 600, y: 0.42, x: -0.28, align: "center", textBg: 0.45 } },
];

type Prog = { active: boolean; label: string; value: number } | null;

export default function MediaPanel() {
  const media = useEditor((s) => s.media);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const selectedClip = useEditor((s) => s.clips.find((c) => c.id === s.selectedClipId) ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Prog>(null);
  const [dropHover, setDropHover] = useState(false);

  // ---- import files -----------------------------------------------------------

  const importFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const type: MediaItem["type"] = file.type.startsWith("video")
        ? "video"
        : file.type.startsWith("audio")
          ? "audio"
          : file.type.startsWith("image")
            ? "image"
            : "video";
      if (!file.type.startsWith("video") && !file.type.startsWith("audio") && !file.type.startsWith("image")) {
        toast.error(`ไม่รองรับไฟล์ ${file.name}`);
        continue;
      }
      const url = URL.createObjectURL(file);
      const item: MediaItem = {
        id: uid(),
        name: file.name,
        type,
        url,
        file,
        duration: type === "image" ? IMAGE_DEFAULT_DURATION : 0,
        width: 0,
        height: 0,
      };

      // probe metadata + thumbnail
      try {
        if (type === "image") {
          const img = new Image();
          img.src = url;
          await img.decode();
          item.width = img.naturalWidth;
          item.height = img.naturalHeight;
          item.thumbnail = makeThumbFromImage(img);
        } else {
          const el = document.createElement(type === "video" ? "video" : "audio");
          el.src = url;
          el.preload = "metadata";
          await new Promise<void>((resolve, reject) => {
            const to = setTimeout(() => resolve(), 8000);
            el.onloadedmetadata = () => {
              clearTimeout(to);
              resolve();
            };
            el.onerror = () => {
              clearTimeout(to);
              reject(new Error("โหลดไม่สำเร็จ"));
            };
          });
          item.duration = isFinite(el.duration) ? el.duration : 0;
          if (type === "video") {
            const v = el as HTMLVideoElement;
            item.width = v.videoWidth;
            item.height = v.videoHeight;
            item.thumbnail = await thumbFromVideo(v);
          }
        }
      } catch {
        toast.warning(`อ่านข้อมูล ${file.name} บางส่วนไม่สำเร็จ`);
      }

      useEditor.getState().addMedia(item);
      if (type === "video") {
        void ensureFilmstrip(item); // background filmstrip generation
      }
      toast.success(`นำเข้า ${file.name} แล้ว`);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHover(false);
    if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files);
  };

  // ---- demo project ------------------------------------------------------------

  const loadDemo = async () => {
    // two gradient images + a tone audio so users (and tests) can try immediately
    const mk = async (c1: string, c2: string, label: string): Promise<MediaItem> => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d")!;
      const grad = ctx.createLinearGradient(0, 0, 1280, 720);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "800 140px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 640, 360);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      await img.decode();
      return {
        id: uid(),
        name: `ภาพตัวอย่าง ${label}.png`,
        type: "image",
        url,
        duration: IMAGE_DEFAULT_DURATION,
        width: 1280,
        height: 720,
        thumbnail: makeThumbFromImage(img),
      };
    };

    const tone = async (): Promise<MediaItem> => {
      const sr = 44100;
      const len = sr * 6;
      const offline = new OfflineAudioContext(1, len, sr);
      const notes = [523.25, 659.25, 783.99, 659.25, 587.33, 523.25];
      notes.forEach((f, i) => {
        const osc = offline.createOscillator();
        const gain = offline.createGain();
        osc.type = "triangle";
        osc.frequency.value = f;
        const t0 = i;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.95);
        osc.connect(gain);
        gain.connect(offline.destination);
        osc.start(t0);
        osc.stop(t0 + 1);
      });
      const buf = await offline.startRendering();
      // simple wav encode
      const wav = encodeWavLocal(buf);
      const blob = new Blob([wav], { type: "audio/wav" });
      return {
        id: uid(),
        name: "เสียงตัวอย่าง.wav",
        type: "audio",
        url: URL.createObjectURL(blob),
        duration: 6,
        width: 0,
        height: 0,
      };
    };

    const s = useEditor.getState();
    const img1 = await mk("#7c3aed", "#db2777", "A");
    const img2 = await mk("#059669", "#0d9488", "B");
    const audio = await tone();
    s.addMedia(img1);
    s.addMedia(img2);
    s.addMedia(audio);
    s.addClipFromMedia(img1.id);
    s.addClipFromMedia(img2.id);
    s.addClipFromMedia(audio.id);
    s.addTextClip({ text: "ยินดีต้อนรับสู่ตัดต่อโปร", fontSize: 72, y: -0.3 }, 0.2);
    toast.success("โหลดโปรเจกต์ตัวอย่างแล้ว ลองกดเล่นได้เลย");
  };

  // ---- smart tools -------------------------------------------------------------

  const runSceneDetect = async () => {
    const s = useEditor.getState();
    const clip = s.clips.find((c) => c.id === s.selectedClipId);
    if (!clip || clip.kind !== "media") {
      toast.error("เลือกคลิปวิดีโอบนไทม์ไลน์ก่อน");
      return;
    }
    const m = s.media.find((mm) => mm.id === clip.mediaId);
    if (!m || m.type !== "video") {
      toast.error("ต้องเป็นคลิปวิดีโอเท่านั้น");
      return;
    }
    setBusy({ active: true, label: "กำลังวิเคราะห์ฉาก…", value: 0 });
    try {
      const cuts = await detectScenes(m.url, {
        onProgress: (p) => setBusy({ active: true, label: "กำลังวิเคราะห์ฉาก…", value: p * 100 }),
      });
      if (cuts.length === 0) {
        toast.info("ไม่พบจุดเปลี่ยนฉากที่ชัดเจน");
      } else {
        s.splitClipAtTimes(clip.id, cuts);
        toast.success(`พบ ${cuts.length} จุดเปลี่ยนฉาก แบ่งคลิปให้แล้ว`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "วิเคราะห์ไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  const runSilenceCut = async () => {
    const s = useEditor.getState();
    const clip = s.clips.find((c) => c.id === s.selectedClipId);
    if (!clip || clip.kind !== "media") {
      toast.error("เลือกคลิปที่มีเสียงบนไทม์ไลน์ก่อน");
      return;
    }
    const m = s.media.find((mm) => mm.id === clip.mediaId);
    if (!m?.file || m.type === "image") {
      toast.error("คลิปนี้ไม่มีไฟล์เสียง");
      return;
    }
    setBusy({ active: true, label: "กำลังหาช่วงเสียงเงียบ…", value: 0 });
    try {
      const regions = await detectSilence(m.file, {
        onProgress: (p) => setBusy({ active: true, label: "กำลังหาช่วงเสียงเงียบ…", value: p * 100 }),
      });
      if (regions.length === 0) {
        toast.info("ไม่พบช่วงเสียงเงียบที่ยาวพอ");
        return;
      }
      // build kept segments (inverse of silent regions)
      const srcDur = m.duration;
      const kept: { inPoint: number; duration: number }[] = [];
      let cursor = clip.inPoint;
      const clipEnd = clip.inPoint + clip.duration * clip.props.speed;
      for (const r of regions) {
        const rs = Math.max(clip.inPoint, r.start);
        const re = Math.min(clipEnd, r.end);
        if (re <= rs) continue;
        if (rs > cursor) kept.push({ inPoint: cursor, duration: rs - cursor });
        cursor = Math.max(cursor, re);
      }
      if (cursor < clipEnd) kept.push({ inPoint: cursor, duration: clipEnd - cursor });
      if (kept.length === 0) {
        toast.info("ทั้งคลิปเงียบหมด!");
        return;
      }
      const removed = regions.reduce((a, r) => a + (r.end - r.start), 0);
      s.replaceSegments(clip.id, kept);
      toast.success(`ตัดเสียงเงียบ ${regions.length} ช่วง ประหยัดไป ${removed.toFixed(1)} วินาที`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ตัดเสียงเงียบไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  const runAiCaptions = async () => {
    const s = useEditor.getState();
    const clip = s.clips.find((c) => c.id === s.selectedClipId);
    if (!clip || clip.kind !== "media") {
      toast.error("เลือกคลิปที่มีคนพูดบนไทม์ไลน์ก่อน");
      return;
    }
    const m = s.media.find((mm) => mm.id === clip.mediaId);
    if (!m?.file || m.type === "image") {
      toast.error("คลิปนี้ไม่มีเสียงพูด");
      return;
    }
    setBusy({ active: true, label: "กำลังเตรียมเสียง…", value: 10 });
    try {
      const wav = await extractWav(
        m.file,
        clip.inPoint,
        clip.duration * clip.props.speed,
        (p) => setBusy({ active: true, label: "กำลังเตรียมเสียง…", value: p * 40 })
      );
      if (wav.size > 22 * 1024 * 1024) {
        toast.error("คลิปยาวเกินไปสำหรับสร้างซับ AI (จำกัด ~10 นาที)");
        return;
      }
      setBusy({ active: true, label: "AI กำลังฟังเสียง…", value: 50 });
      const b64 = await blobToBase64(wav);
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_base64: b64, name: m.name }),
      });
      const data = await res.json();
      if (!res.ok || !data.text) {
        throw new Error(data.error || "AI ถอดข้อความไม่สำเร็จ (อาจไม่มีเสียงพูดชัดเจน)");
      }
      setBusy({ active: true, label: "กำลังวางซับ…", value: 85 });
      const chunks = splitTextForCaptions(String(data.text), 34);
      if (chunks.length === 0) {
        toast.info("ไม่พบข้อความจากเสียงพูด");
        return;
      }
      // distribute captions across clip duration by char count
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const dur = clip.duration;
      let t = clip.start;
      for (const ch of chunks) {
        const seg = (ch.length / total) * dur;
        const id = s.addTextClip(
          { text: ch, fontSize: 40, fontWeight: 600, y: 0.38, textBg: 0.55 },
          t,
          false
        );
        if (id) s.trimClip(id, "right", t + seg, false);
        t += seg;
      }
      toast.success(`สร้างซับ ${chunks.length} ชิ้นแล้ว`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "สร้างซับไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  const applyLook = (params: Partial<ClipProps>, name: string) => {
    const s = useEditor.getState();
    if (!s.selectedClipId) {
      toast.error("เลือกคลิปบนไทม์ไลน์ก่อน");
      return;
    }
    s.updateClipProps(s.selectedClipId, { ...NEUTRAL_GRADE, ...params });
    toast.success(`ใส่ลุคส์ "${name}" แล้ว`);
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col bg-zinc-900 ${dropHover ? "ring-2 ring-inset ring-violet-400" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDropHover(true);
      }}
      onDragLeave={() => setDropHover(false)}
      onDrop={onDrop}
    >
      <Tabs defaultValue="media" className="flex h-full min-h-0 flex-col">
        <TabsList className="mx-2 mt-2 grid h-8 grid-cols-4 bg-zinc-800/80">
          <TabsTrigger value="media" className="h-6 gap-1 text-[11px]">
            <Clapperboard className="h-3 w-3" /> สื่อ
          </TabsTrigger>
          <TabsTrigger value="text" className="h-6 gap-1 text-[11px]">
            <Type className="h-3 w-3" /> ข้อความ
          </TabsTrigger>
          <TabsTrigger value="filters" className="h-6 gap-1 text-[11px]">
            <Wand2 className="h-3 w-3" /> ลุคส์
          </TabsTrigger>
          <TabsTrigger value="ai" className="h-6 gap-1 text-[11px]">
            <Sparkles className="h-3 w-3" /> AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="media" className="mt-0 min-h-0 flex-1">
          <div className="flex h-full min-h-0 flex-col p-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void importFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              className="w-full bg-violet-600 text-white hover:bg-violet-500"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1.5 h-4 w-4" /> นำเข้าสื่อ
            </Button>
            <p className="mt-1.5 text-center text-[10px] text-zinc-500">
              ลากไฟล์มาวางที่นี่ได้ (วิดีโอ / เสียง / รูป)
            </p>

            <ScrollArea className="mt-2 min-h-0 flex-1">
              {media.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-zinc-700 px-3 py-8 text-center">
                  <Upload className="mb-2 h-6 w-6 text-zinc-600" />
                  <p className="text-xs text-zinc-500">ยังไม่มีสื่อ</p>
                  <Button variant="outline" size="sm" className="mt-3 h-7 text-[11px] border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700" onClick={() => void loadDemo()}>
                    ใส่คลิปตัวอย่างให้ลองเล่น
                  </Button>
                </div>
              ) : (
                <ul className="space-y-1.5 pr-2">
                  {media.map((m) => (
                    <ContextMenu key={m.id}>
                      <ContextMenuTrigger asChild>
                        <li
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/cutpro-media", m.id);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          className="group flex cursor-grab items-center gap-2 rounded-md border border-zinc-800 bg-zinc-800/50 p-1.5 transition hover:border-violet-400/40 hover:bg-zinc-800"
                          title="ลากลงไทม์ไลน์ได้เลย · คลิกขวาเพื่อเมนู"
                        >
                          <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-950">
                            {m.thumbnail ? (
                              <img src={m.thumbnail} alt={m.name} className="h-full w-full object-cover" />
                            ) : m.type === "audio" ? (
                              <FileAudio className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <FileVideo className="h-4 w-4 text-violet-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[11px] font-medium text-zinc-200" title={m.name}>
                              {m.name}
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              {m.type === "image" ? "รูปภาพ" : formatTime(m.duration)} ·{" "}
                              {m.type === "video" ? "วิดีโอ" : m.type === "audio" ? "เสียง" : "รูป"}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1">
                            <Button
                              size="sm"
                              className="h-6 px-1.5 text-[10px] bg-violet-600 text-white hover:bg-violet-500"
                              onClick={() => {
                                useEditor.getState().addClipFromMedia(m.id);
                                toast.success("เพิ่มลงไทม์ไลน์แล้ว");
                              }}
                            >
                              + ไทม์ไลน์
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-rose-300"
                              onClick={() => useEditor.getState().removeMedia(m.id)}
                            >
                              ลบ
                            </Button>
                          </div>
                        </li>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-52">
                        <ContextMenuItem
                          onClick={() => {
                            const s = useEditor.getState();
                            s.addClipFromMedia(m.id, { at: s.playhead });
                            toast.success(`วางที่เคอร์เซอร์ ${formatTime(s.playhead)}`);
                          }}
                        >
                          วางที่ตำแหน่งเคอร์เซอร์
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => {
                            useEditor.getState().addClipFromMedia(m.id);
                            toast.success("เพิ่มท้ายไทม์ไลน์แล้ว");
                          }}
                        >
                          เพิ่มท้ายไทม์ไลน์
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => {
                            const name = prompt("เปลี่ยนชื่อสื่อ", m.name);
                            if (name && name.trim()) {
                              const s = useEditor.getState();
                              s.renameMedia(m.id, name.trim());
                              toast.success("เปลี่ยนชื่อแล้ว");
                            }
                          }}
                        >
                          เปลี่ยนชื่อ
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => useEditor.getState().removeMedia(m.id)}
                          className="text-rose-300 focus:text-rose-200"
                        >
                          ลบออกจากคลังสื่อ
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="text" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full p-2">
            <p className="mb-2 px-1 text-[10px] leading-relaxed text-zinc-500">
              กดเพิ่มข้อความ — จะวางที่ตำแหน่งเคอร์เซอร์ แล้วปรับแก่/สี/ตำแหน่งได้ในแผงคุณสมบัติ
            </p>
            <div className="grid grid-cols-2 gap-2 pr-2">
              {TEXT_PRESETS.map((p) => (
                <button
                  key={p.name}
                  className="rounded-md border border-zinc-800 bg-zinc-800/50 p-2.5 text-left transition hover:border-violet-400/60 hover:bg-zinc-800"
                  onClick={() => {
                    useEditor.getState().addTextClip(p.props);
                    toast.success(`เพิ่ม "${p.name}" แล้ว`);
                  }}
                >
                  <div className="text-xs font-semibold text-zinc-100">{p.name}</div>
                  <div className="mt-0.5 text-[10px] text-zinc-500">{p.desc}</div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="filters" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full p-2">
            <p className="mb-2 px-1 text-[10px] leading-relaxed text-zinc-500">
              เลือกคลิปบนไทม์ไลน์ แล้วกดลุคส์ที่ต้องการ — ปรับละเอียดได้ในแผง "เกรดสี"
            </p>
            <div className="grid grid-cols-3 gap-2 pr-2">
              {LOOKS.map((f) => (
                <button
                  key={f.id}
                  className="group rounded-md border border-zinc-800 bg-zinc-800/50 p-1.5 transition hover:border-fuchsia-400/60 hover:bg-zinc-800"
                  onClick={() => applyLook(f.params, f.name)}
                  title={f.desc}
                >
                  <div className="mb-1 flex h-10 items-center justify-center overflow-hidden rounded bg-zinc-950">
                    {selectedClip?.kind === "media" && media.find((m) => m.id === selectedClip.mediaId)?.thumbnail ? (
                      <img
                        src={media.find((m) => m.id === selectedClip.mediaId)!.thumbnail}
                        alt={f.name}
                        className="h-full w-full object-cover"
                        style={{ filter: f.css || undefined }}
                      />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-zinc-600" />
                    )}
                  </div>
                  <div className="truncate text-center text-[10px] font-medium text-zinc-300">{f.name}</div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="ai" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-full p-2">
            <div className="space-y-2 pr-2">
              <div className="rounded-md border border-violet-500/30 bg-violet-950/30 p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-violet-200">
                  <Sparkles className="h-3.5 w-3.5" /> ผู้ช่วยตัดต่อ AI
                </div>
                <p className="text-[10px] leading-relaxed text-violet-300/70">
                  เลือกคลิปบนไทม์ไลน์ แล้วใช้เครื่องมือด้านล่าง — AI จะช่วยตัดให้อัตโนมัติ
                </p>
              </div>

              <button
                className="flex w-full items-start gap-2.5 rounded-md border border-zinc-800 bg-zinc-800/50 p-2.5 text-left transition hover:border-violet-400/60 hover:bg-zinc-800 disabled:opacity-50"
                onClick={() => void runSceneDetect()}
                disabled={!!busy}
              >
                <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                <div>
                  <div className="text-xs font-semibold text-zinc-100">แบ่งฉากอัตโนมัติ</div>
                  <div className="mt-0.5 text-[10px] text-zinc-500">ตรวจจับจุดเปลี่ยนฉากในวิดีโอ แล้วแบ่งคลิปให้ทั้งหมด</div>
                </div>
              </button>

              <button
                className="flex w-full items-start gap-2.5 rounded-md border border-zinc-800 bg-zinc-800/50 p-2.5 text-left transition hover:border-violet-400/60 hover:bg-zinc-800 disabled:opacity-50"
                onClick={() => void runSilenceCut()}
                disabled={!!busy}
              >
                <Waves className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <div>
                  <div className="text-xs font-semibold text-zinc-100">ตัดช่วงเสียงเงียบ</div>
                  <div className="mt-0.5 text-[10px] text-zinc-500">หาช่วงที่ไม่มีเสียงพูด แล้วตัดออกให้กระชับ เหมาะกับวลีตอนพักหายใจ</div>
                </div>
              </button>

              <button
                className="flex w-full items-start gap-2.5 rounded-md border border-zinc-800 bg-zinc-800/50 p-2.5 text-left transition hover:border-violet-400/60 hover:bg-zinc-800 disabled:opacity-50"
                onClick={() => void runAiCaptions()}
                disabled={!!busy}
              >
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold text-zinc-100">สร้างซับ AI อัตโนมัติ</div>
                  <div className="mt-0.5 text-[10px] text-zinc-500">ถอดเสียงพูดเป็นข้อความ (รองรับไทย) แล้ววางเป็นซับไทเทิลตามจังหวะ</div>
                </div>
              </button>

              {busy && (
                <div className="rounded-md border border-zinc-700 bg-zinc-800/80 p-2.5">
                  <div className="mb-1.5 text-[11px] font-medium text-zinc-200">{busy.label}</div>
                  <Progress value={busy.value} className="h-1.5" />
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---- helpers ---------------------------------------------------------------

function makeThumbFromImage(img: HTMLImageElement): string | undefined {
  try {
    const c = document.createElement("canvas");
    const scale = Math.min(1, 112 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  } catch {
    return undefined;
  }
}

async function thumbFromVideo(v: HTMLVideoElement): Promise<string | undefined> {
  return new Promise((resolve) => {
    const done = () => {
      try {
        const c = document.createElement("canvas");
        const scale = Math.min(1, 112 / Math.max(v.videoWidth || 1, v.videoHeight || 1));
        c.width = Math.max(1, Math.round((v.videoWidth || 112) * scale));
        c.height = Math.max(1, Math.round((v.videoHeight || 63) * scale));
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.7));
      } catch {
        resolve(undefined);
      }
    };
    if (v.readyState >= 2) {
      done();
    } else {
      v.currentTime = Math.min(1, (v.duration || 2) * 0.15);
      v.onseeked = done;
      setTimeout(done, 2500);
    }
  });
}

function encodeWavLocal(buffer: AudioBuffer): ArrayBuffer {
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
  view.setUint16(20, 1, true);
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
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return ab;
}
