"use client";

import { useRef, useState } from "react";
import { Check, Download, Film, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { playerBus } from "@/lib/editor/playerBus";
import { getDuration, useEditor } from "@/lib/editor/store";
import { downloadBlob, formatTime } from "@/lib/editor/utils";

type Phase = "setup" | "recording" | "cancelling" | "done";

export default function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const duration = useEditor(getDuration);
  const [scale, setScale] = useState("1");
  const [fps, setFps] = useState("30");
  const [quality, setQuality] = useState("normal");
  const [phase, setPhase] = useState<Phase>("setup");
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const abortController = useRef<AbortController | null>(null);

  const bitrateMap: Record<string, number> = { high: 10_000_000, normal: 6_000_000, small: 3_000_000 };

  const start = async () => {
    const controls = playerBus.controls;
    if (!controls) {
      toast.error("เครื่องเล่นยังไม่พร้อม");
      return;
    }
    const controller = new AbortController();
    abortController.current = controller;
    setPhase("recording");
    setProgress(0);
    try {
      const blob = await controls.exportVideo(
        { scale: Number(scale), fps: Number(fps), bitrate: bitrateMap[quality] },
        (p) => setProgress(p * 100),
        controller.signal
      );
      setResultBlob(blob);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setPhase("done");
      toast.success("ส่งออกวิดีโอสำเร็จ!");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("ยกเลิกการส่งออกแล้ว");
      } else {
        toast.error(err instanceof Error ? err.message : "ส่งออกไม่สำเร็จ");
      }
      setPhase("setup");
    } finally {
      if (abortController.current === controller) abortController.current = null;
    }
  };

  const close = (v: boolean) => {
    if (phase === "recording") {
      abortController.current?.abort();
    }
    onOpenChange(v);
    if (!v) {
      setPhase("setup");
      setProgress(0);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
      setResultBlob(null);
    }
  };

  const estSize = (duration * (bitrateMap[quality] / 8) * Number(scale) ** 2) / 1_000_000; // MB approx

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="gap-5 rounded-2xl border-white/10 bg-[#14141b] p-6 text-zinc-100 shadow-2xl sm:max-w-lg">
        <DialogHeader className="gap-2 pr-7">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200/15 bg-violet-300/10 text-violet-200">
            {phase === "done" ? <Check className="h-5 w-5" /> : <Film className="h-5 w-5" />}
          </div>
          <DialogTitle className="text-lg font-semibold tracking-tight">ส่งออกวิดีโอ</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-zinc-400">
            ตั้งค่าคุณภาพและบันทึกไฟล์วิดีโอลงในเครื่อง
          </DialogDescription>
        </DialogHeader>

        {phase === "setup" && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-zinc-400">ความละเอียด</label>
                <Select value={scale} onValueChange={setScale}>
                  <SelectTrigger className="h-9 border-white/10 bg-white/[0.035] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">100% (เต็ม)</SelectItem>
                    <SelectItem value="0.75">75%</SelectItem>
                    <SelectItem value="0.5">50%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-zinc-400">เฟรมเรต</label>
                <Select value={fps} onValueChange={setFps}>
                  <SelectTrigger className="h-9 border-white/10 bg-white/[0.035] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 fps</SelectItem>
                    <SelectItem value="30">30 fps</SelectItem>
                    <SelectItem value="60">60 fps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-zinc-400">คุณภาพ</label>
                <Select value={quality} onValueChange={setQuality}>
                  <SelectTrigger className="h-9 border-white/10 bg-white/[0.035] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">สูงสุด</SelectItem>
                    <SelectItem value="normal">ปกติ</SelectItem>
                    <SelectItem value="small">ไฟล์เล็ก</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-black/15 p-3.5 text-xs text-zinc-400">
              <div className="flex justify-between">
                <span>ความยาว</span>
                <span className="font-mono tabular-nums text-zinc-200">{formatTime(duration)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>ขนาดไฟล์โดยประมาณ</span>
                <span className="font-mono tabular-nums text-zinc-200">~{estSize.toFixed(1)} MB (WebM)</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-violet-200/10 bg-violet-200/[0.04] p-3 text-[11px] leading-relaxed text-zinc-300">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-200" />
              <span>ส่งออกตามความยาววิดีโอ ระบบจะคงความละเอียดและสัดส่วนของโปรเจกต์ไว้</span>
            </div>

            <Button
              className="h-10 w-full bg-violet-200 text-[#17131f] hover:bg-violet-100"
              disabled={duration <= 0}
              onClick={() => void start()}
            >
              <Download className="mr-1.5 h-4 w-4" />
              {duration <= 0 ? "ไทม์ไลน์ว่างเปล่า" : "เริ่มส่งออก"}
            </Button>
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-5 py-1">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-sm text-zinc-200">
                <Loader2 className="h-4 w-4 animate-spin text-violet-200" />
                กำลังส่งออกวิดีโอ
              </div>
              <span className="font-mono text-xs tabular-nums text-violet-200">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2 bg-white/10 [&_[data-slot=progress-indicator]]:bg-violet-200" />
            <div className="rounded-xl border border-white/[0.07] bg-black/15 p-3 text-[11px] leading-relaxed text-zinc-400">
              เหลืออีกประมาณ {formatTime(duration * Math.max(0, 1 - progress / 100))}
            </div>
            <Button
              variant="outline"
              className="h-10 w-full border-rose-200/20 bg-rose-200/[0.04] text-rose-100 hover:bg-rose-200/10"
              onClick={() => {
                setPhase("cancelling");
                abortController.current?.abort();
              }}
            >
              <X className="mr-1.5 h-4 w-4" /> ยกเลิกการส่งออก
            </Button>
          </div>
        )}

        {phase === "cancelling" && (
          <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-black/15 p-4 text-sm text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin text-violet-200" />
            กำลังหยุดและคืนทรัพยากร…
          </div>
        )}

        {phase === "done" && resultUrl && (
          <div className="space-y-4">
            <video src={resultUrl} controls className="w-full rounded-xl border border-white/10 bg-black" />
            <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-black/15 p-3 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-2 text-zinc-200"><Check className="h-4 w-4 text-violet-200" /> พร้อมบันทึก</span>
              <span className="font-mono tabular-nums">{resultBlob ? (resultBlob.size / 1024 / 1024).toFixed(1) : "?"} MB</span>
            </div>
            <Button
              className="h-10 w-full bg-violet-200 text-[#17131f] hover:bg-violet-100"
              onClick={() => {
                if (resultBlob) downloadBlob(resultBlob, `cutpro-${Date.now()}.webm`);
              }}
            >
              <Download className="mr-1.5 h-4 w-4" /> ดาวน์โหลดวิดีโอ
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
