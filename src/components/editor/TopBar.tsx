"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CircleHelp,
  Check,
  Download,
  Home,
  LoaderCircle,
  MonitorDown,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BrandLogo from "@/components/editor/BrandLogo";
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
import { appVersion, installerName } from "@/lib/appVersion";

type ProjectStatus = "loading" | "ready" | "saved" | "saving" | "error";

export default function TopBar({
  onHome,
  projectName,
  onExport,
  onSave,
  projectStatus,
}: {
  onHome: () => void;
  projectName: string;
  onExport: () => void;
  onSave: () => void;
  projectStatus: ProjectStatus;
}) {
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
    else toast.info("ยังไม่ได้ติดตั้ง — ใช้เมนูติดตั้งใน Chrome หรือ Edge ได้ทุกเมื่อ");
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#12121a] px-3">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-zinc-400"
        onClick={onHome}
        title="กลับหน้าโปรเจกต์"
        aria-label="กลับหน้าโปรเจกต์"
      >
        <Home className="h-4 w-4" />
      </Button>
      <div className="flex items-center gap-2">
        <BrandLogo className="h-7 w-7 rounded-md shadow-[0_0_10px_rgba(168,85,247,0.35)]" label="โลโก้ ตัดต่อโปร" />
        <div className="leading-tight">
          <div className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-sm font-bold text-transparent">
            ตัดต่อโปร Studio
          </div>
          <div className="text-[9px] text-zinc-500">CutPro · Pro Video Editor</div>
        </div>
      </div>

      <div className="ml-2 hidden items-center gap-1 sm:flex">
        <span className="max-w-40 truncate rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-300" title={projectName}>
          {projectName}
        </span>
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
        <Button
          variant="ghost"
          size="sm"
          className={`h-8 gap-1.5 px-2 text-[10px] ${projectStatus === "error" ? "text-rose-300" : projectStatus === "saved" ? "text-emerald-300" : "text-zinc-400"}`}
          onClick={onSave}
          disabled={projectStatus === "loading" || projectStatus === "saving"}
          title={projectStatus === "error" ? "บันทึกมีปัญหา — คลิกเพื่อลองใหม่" : "บันทึกโปรเจกต์ในเครื่อง"}
        >
          {projectStatus === "saving" ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : projectStatus === "saved" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          <span className="hidden xl:inline">
            {projectStatus === "saving" ? "กำลังบันทึก" : projectStatus === "saved" ? "บันทึกแล้ว" : projectStatus === "error" ? "บันทึกไม่ได้" : "บันทึก"}
          </span>
        </Button>
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
            <BrandLogo className="h-8 w-8 rounded-md" />
            ติดตั้ง &ldquo;ตัดต่อโปร Studio&rdquo; ลงเครื่อง
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            บน Windows ใช้ตัวติดตั้ง CutPro Studio Setup เพื่อเพิ่มแอปและโลโก้บน Desktop ได้ หรือเลือกติดตั้ง PWA ผ่าน Chrome/Edge
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
        <Link
          href="/download"
          className="flex h-9 items-center justify-center gap-2 rounded-md border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 text-xs font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/20"
        >
          <Download className="h-3.5 w-3.5" />
          ดาวน์โหลดแอป Windows
        </Link>

        <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1 text-xs leading-relaxed text-zinc-300">
          <section className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <h4 className="mb-1.5 font-semibold text-zinc-100">🪟 Windows — ตัวติดตั้งแอป</h4>
            <ol className="list-decimal space-y-1 pl-4 text-[11px] text-zinc-400">
              <li>เปิดไฟล์ <b>{installerName}</b> จากโฟลเดอร์ <b>release</b> แล้วทำตามตัวติดตั้งเวอร์ชัน {appVersion} ซึ่งแสดงเปอร์เซ็นต์ความคืบหน้า</li>
              <li>ตัวติดตั้งสร้างทางลัดพร้อมโลโก้บน Desktop และ Start Menu เปิดแอปได้โดยไม่ต้องเปิด PowerShell ค้างไว้</li>
            </ol>
          </section>
          <section className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <h4 className="mb-1.5 font-semibold text-zinc-100">ติดตั้ง PWA จาก Chrome / Edge</h4>
            <ol className="list-decimal space-y-1 pl-4 text-[11px] text-zinc-400">
              <li>เปิดแอปจาก URL ที่ปลอดภัย (HTTPS) หรือ <b>localhost</b> สำหรับทดสอบ แล้วกดปุ่ม <span className="font-semibold text-emerald-300">&ldquo;ติดตั้งเลย&rdquo;</span> หรือไอคอนติดตั้งที่แถบที่อยู่</li>
              <li>เลือก <b>ติดตั้ง (Install)</b> แล้วยืนยัน</li>
              <li>เปิดแอปจาก Start Menu / Applications; หากต้องการไอคอนบน Desktop ให้คลิกขวาแอปใน Start Menu แล้วเลือกสร้างทางลัดบนเดสก์ท็อป</li>
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
            <h4 className="mb-1.5 font-semibold text-fuchsia-200">ข้อควรรู้</h4>
            <ul className="list-disc space-y-1 pl-4 text-[11px] text-fuchsia-200/80">
              <li>แอปเปิดเป็นหน้าต่างแยกพร้อมโลโก้ ไม่แสดงแถบเบราว์เซอร์ และปักทางลัดบน Desktop ได้</li>
              <li>ตัวติดตั้งที่ยังไม่ลงนามอาจถูก Windows เตือนผู้เผยแพร่ที่ไม่รู้จัก; หาก Defender แจ้งว่าเป็นไวรัส อย่าปิดการป้องกันหรือยกเว้นไฟล์ ให้หยุดใช้และส่งตรวจ false positive</li>
              <li>โปรเจกต์และสื่อบันทึกในแอป/เบราว์เซอร์ของบัญชีผู้ใช้เดิม — อย่าล้างข้อมูลแอปหากต้องการเก็บงาน</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
