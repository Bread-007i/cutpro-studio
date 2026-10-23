"use client";

import { useState } from "react";
import {
  CircleHelp,
  Download,
  MonitorDown,
  Redo2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useEditor, getDuration } from "@/lib/editor/store";
import type { AspectRatio } from "@/lib/editor/types";
import { formatTime } from "@/lib/editor/utils";
import { usePwa } from "@/components/editor/PwaProvider";

export default function TopBar({ onExport }: { onExport: () => void }) {
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const aspect = useEditor((s) => s.aspect);
  const duration = useEditor(getDuration);
  const canInstall = usePwa((s) => s.canInstall);
  const installed = usePwa((s) => s.installed);
  const promptInstall = usePwa((s) => s.promptInstall);
  const [helpOpen, setHelpOpen] = useState(false);

  const doInstall = async () => {
    const ok = await promptInstall();
    if (ok) toast.success("ติดตั้งแอปสำเร็จ! หาโลโก้ได้ที่เดสก์ท็อป / เมนู Start");
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#12121a] px-3">
      <div className="flex items-center gap-2">
        <img
          src="/icons/icon-192.png"
          alt="โลโก้ ตัดต่อโปร"
          className="h-7 w-7 rounded-md shadow-[0_0_10px_rgba(168,85,247,0.35)]"
        />
        <div className="leading-tight">
          <div className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-sm font-bold text-transparent">
            ตัดต่อโปร Studio
          </div>
          <div className="text-[9px] text-zinc-500">CutPro · Pro Video Editor</div>
        </div>
      </div>

      <div className="ml-2 hidden items-center gap-1 sm:flex">
        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
          ความยาว {formatTime(duration)}
        </span>
      </div>

      <div className="mx-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-300 disabled:opacity-30"
          onClick={() => useEditor.getState().undo()}
          disabled={!canUndo}
          title="ย้อนกลับ (Ctrl+Z)"
          aria-label="ย้อนกลับ"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-300 disabled:opacity-30"
          onClick={() => useEditor.getState().redo()}
          disabled={!canRedo}
          title="ทำซ้ำ (Ctrl+Y)"
          aria-label="ทำซ้ำ"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {installed ? (
          <span className="hidden items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300 md:flex">
            <MonitorDown className="h-3 w-3" /> ติดตั้งเป็นแอปแล้ว
          </span>
        ) : (
          canInstall && (
            <Button
              size="sm"
              className="hidden h-8 gap-1.5 bg-emerald-600 text-[11px] font-semibold text-white hover:bg-emerald-500 md:flex"
              onClick={() => void doInstall()}
              title="ติดตั้งเป็นแอปบนเดสก์ท็อป (มีโลโก้บนหน้าจอ)"
            >
              <MonitorDown className="h-3.5 w-3.5" /> ติดตั้งแอป
            </Button>
          )
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400"
          onClick={() => setHelpOpen(true)}
          title="วิธีติดตั้งแอป / วิธีใช้"
          aria-label="วิธีติดตั้งแอป"
        >
          <CircleHelp className="h-4 w-4" />
        </Button>
        <Select value={aspect} onValueChange={(v) => useEditor.getState().setAspect(v as AspectRatio)}>
          <SelectTrigger className="hidden h-8 w-[130px] border-white/10 bg-white/[0.06] text-xs sm:flex">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="16:9">16:9 ยูทูบ</SelectItem>
            <SelectItem value="9:16">9:16 ติ๊กต็อก</SelectItem>
            <SelectItem value="1:1">1:1 สี่เหลี่ยม</SelectItem>
            <SelectItem value="4:5">4:5 ฟีด</SelectItem>
          </SelectContent>
        </Select>
        <Button
          className="h-8 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-xs font-semibold text-white shadow-[0_0_14px_rgba(168,85,247,0.35)] hover:from-violet-500 hover:to-fuchsia-500"
          onClick={onExport}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          ส่งออกวิดีโอ
        </Button>
      </div>

      <InstallGuide open={helpOpen} onOpenChange={setHelpOpen} />
    </header>
  );
}

function InstallGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const canInstall = usePwa((s) => s.canInstall);
  const promptInstall = usePwa((s) => s.promptInstall);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#14141c] text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <img src="/icons/icon-192.png" alt="" className="h-8 w-8 rounded-md" />
            ติดตั้ง &ldquo;ตัดต่อโปร Studio&rdquo; ลงเครื่อง
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            ติดตั้งครั้งเดียว ใช้ได้เหมือนโปรแกรมจริง — มีโลโก้บนเดสก์ท็อป เปิดเป็นหน้าต่างแยก ใช้ได้แม้ไม่มีเน็ต
          </DialogDescription>
        </DialogHeader>

        {canInstall && (
          <Button
            className="w-full bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500"
            onClick={() => void promptInstall()}
          >
            <MonitorDown className="mr-1.5 h-4 w-4" /> ติดตั้งเลย (1 คลิก)
          </Button>
        )}

        <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1 text-xs leading-relaxed text-zinc-300">
          <section className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <h4 className="mb-1.5 font-semibold text-zinc-100">🪟 Windows / 🍎 macOS (Chrome หรือ Edge)</h4>
            <ol className="list-decimal space-y-1 pl-4 text-[11px] text-zinc-400">
              <li>กดปุ่ม <span className="font-semibold text-emerald-300">&ldquo;ติดตั้งเลย&rdquo;</span> ด้านบน หรือกดไอคอน ⊕ / รูปจอ ที่มุมขวาของแถบที่อยู่เบราว์เซอร์</li>
              <li>เลือก <b>ติดตั้ง (Install)</b> แล้วยืนยัน</li>
              <li>โลโก้แอปจะปรากฏบน <b>Desktop / Start Menu / Dock</b> — เปิดได้เหมือนโปรแกรมทั่วไป ไม่มีแถบเบราว์เซอร์</li>
            </ol>
          </section>
          <section className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <h4 className="mb-1.5 font-semibold text-zinc-100">🤖 Android (Chrome)</h4>
            <ol className="list-decimal space-y-1 pl-4 text-[11px] text-zinc-400">
              <li>กดเมนู ⋮ มุมขวาบน → <b>เพิ่มไปยังหน้าจอหลัก / ติดตั้งแอป</b></li>
              <li>ไอคอนแอปจะอยู่บนหน้าจอหลักพร้อมโลโก้</li>
            </ol>
          </section>
          <section className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <h4 className="mb-1.5 font-semibold text-zinc-100">📱 iPhone / iPad (Safari)</h4>
            <ol className="list-decimal space-y-1 pl-4 text-[11px] text-zinc-400">
              <li>กดปุ่ม <b>แชร์</b> (รูปสี่เหลี่ยมมีลูกศรขึ้น)</li>
              <li>เลือก <b>เพิ่มลงหน้าจอโฮม</b> → ตั้งชื่อ → เพิ่ม</li>
            </ol>
          </section>
          <section className="rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/[0.06] p-3">
            <h4 className="mb-1.5 font-semibold text-fuchsia-200">ข้อดีของการติดตั้ง</h4>
            <ul className="list-disc space-y-1 pl-4 text-[11px] text-fuchsia-200/80">
              <li>เปิดเป็นหน้าต่างแอปของตัวเอง ดูเป็นมืออาชีพ ไม่ติดแถบเบราว์เซอร์</li>
              <li>มีโลโก้ &ldquo;ตัดต่อโปร&rdquo; ชัดเจนบนเดสก์ท็อป / ทาสก์บาร์</li>
              <li>ใช้งานได้แม้ออฟไลน์ (หลังเปิดครั้งแรก) — ไฟล์ทั้งหมดประมวลผลในเครื่อง ไม่อัปโหลดไปเซิร์ฟเวอร์</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
