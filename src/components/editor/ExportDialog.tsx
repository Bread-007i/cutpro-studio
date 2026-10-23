"use client";

import { useState } from "react";
import { Download, Loader2, TriangleAlert } from "lucide-react";
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

type Phase = "setup" | "recording" | "done";

export default function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const duration = useEditor(getDuration);
  const [scale, setScale] = useState("1");
  const [fps, setFps] = useState("30");
  const [quality, setQuality] = useState("normal");
  const [phase, setPhase] = useState<Phase>("setup");
  const [progress, setProgress] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  const bitrateMap: Record<string, number> = { high: 10_000_000, normal: 6_000_000, small: 3_000_000 };

  const start = async () => {
    const controls = playerBus.controls;
    if (!controls) {
      toast.error("เครื่องเล่นยังไม่พร้อม");
      return;
    }
    setPhase("recording");
    setProgress(0);
    try {
      const blob = await controls.exportVideo(
        { scale: Number(scale), fps: Number(fps), bitrate: bitrateMap[quality] },
        (p) => setProgress(p * 100)
      );
      setResultBlob(blob);
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setPhase("done");
      toast.success("ส่งออกวิดีโอสำเร็จ!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ส่งออกไม่สำเร็จ");
      setPhase("setup");
    }
  };

  const close = (v: boolean) => {
    if (phase === "recording") {
      toast.warning("กำลังบันทึกวิดีโอ กรุณารอจนเสร็จ");
      return;
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
      <DialogContent className="border-white/10 bg-[#14141c] text-zinc-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">ส่งออกวิดีโอ</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            เรนเดอร์แบบเรียลไทม์จากพรีวิว ระหว่างส่งออกจะเห็นภาพเล่นผ่านอัตโนมัติ
          </DialogDescription>
        </DialogHeader>

        {phase === "setup" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-zinc-400">ความละเอียด</label>
                <Select value={scale} onValueChange={setScale}>
                  <SelectTrigger className="h-8 border-white/10 bg-white/[0.06] text-xs">
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
                  <SelectTrigger className="h-8 border-white/10 bg-white/[0.06] text-xs">
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
                  <SelectTrigger className="h-8 border-white/10 bg-white/[0.06] text-xs">
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

            <div className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 text-[11px] text-zinc-400">
              <div className="flex justify-between">
                <span>ความยาว</span>
                <span className="font-mono text-zinc-200">{formatTime(duration)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>ขนาดไฟล์โดยประมาณ</span>
                <span className="font-mono text-zinc-200">~{estSize.toFixed(1)} MB (WebM)</span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-950/30 p-2.5 text-[11px] text-amber-200/90">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                การส่งออกใช้เวลาเท่ากับความยาววิดีโอ (เรียลไทม์) ห้ามสลับ/ปิดแท็บนี้ระหว่างบันทึก
              </span>
            </div>

            <Button
              className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500"
              disabled={duration <= 0}
              onClick={() => void start()}
            >
              <Download className="mr-1.5 h-4 w-4" />
              {duration <= 0 ? "ไทม์ไลน์ว่างเปล่า" : "เริ่มส่งออก"}
            </Button>
          </div>
        )}

        {phase === "recording" && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm text-zinc-200">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
              กำลังบันทึก… {Math.round(progress)}%
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-[11px] text-zinc-500">
              ห้ามสลับแท็บหรือย่อหน้าต่าง เพราะเบราว์เซอร์จะลดความเร็วการเรนเดอร์
            </p>
          </div>
        )}

        {phase === "done" && resultUrl && (
          <div className="space-y-3">
            <video src={resultUrl} controls className="w-full rounded-md border border-white/10" />
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>เสร็จสิ้น</span>
              <span className="font-mono">{resultBlob ? (resultBlob.size / 1024 / 1024).toFixed(1) : "?"} MB</span>
            </div>
            <Button
              className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
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
