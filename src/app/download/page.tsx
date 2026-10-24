import type { Metadata } from "next";
import Link from "next/link";
import BrandLogo from "@/components/editor/BrandLogo";
import { appReleaseLabel, appVersion, installerName } from "@/lib/appVersion";
import {
  ArrowDownToLine,
  Check,
  ExternalLink,
  HardDriveDownload,
  MonitorDown,
  ShieldAlert,
} from "lucide-react";

const releaseBaseUrl = `https://github.com/Bread-007i/cutpro-studio/releases/download/v${appVersion}`;
const installerUrl = `${releaseBaseUrl}/${installerName}`;
const releaseInfoUrl = `${releaseBaseUrl}/release.json`;

export const metadata: Metadata = {
  title: "ดาวน์โหลด CutPro Studio สำหรับ Windows",
  description:
    "ดาวน์โหลดและติดตั้งแอปตัดต่อวิดีโอ CutPro Studio สำหรับ Windows 10/11 แบบ 64-bit พร้อมไอคอน Desktop",
};

const features = [
  "ไทม์ไลน์ตัดต่อหลายแทร็ก พร้อมเสียงและข้อความ",
  "เกรดสีด้วย Color Wheels และเส้นโค้ง RGB",
  "บันทึกโปรเจกต์และไฟล์สื่อในเครื่องอัตโนมัติ",
  "ส่งออกวิดีโอจากแอปได้โดยตรง",
];

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-[#0b0b10] text-zinc-100">
      <div className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <header className="flex h-20 items-center justify-between border-b border-white/[0.08]">
          <Link href="/" className="flex items-center gap-3" aria-label="กลับไปที่ CutPro Studio">
            <BrandLogo className="h-10 w-10 rounded-xl shadow-[0_0_24px_rgba(168,85,247,0.24)]" />
            <span>
              <span className="block text-sm font-bold tracking-tight">CutPro Studio</span>
              <span className="block text-[10px] text-zinc-500">ตัดต่อโปร · Video Editor</span>
            </span>
          </Link>
        </header>

        <section className="grid items-center gap-12 pb-14 pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:pb-20 lg:pt-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-200/15 bg-violet-200/[0.05] px-3 py-1.5 text-[11px] font-medium text-violet-100">
              <MonitorDown className="h-3.5 w-3.5 text-violet-200" />
              แอปเดสก์ท็อป · Windows
            </div>
            <h1 className="max-w-2xl text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.6rem]">
              เริ่มตัดต่อ
              <span className="block text-violet-200">
                ได้ทันทีบนเครื่องคุณ
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
              ดาวน์โหลดตัวติดตั้ง CutPro Studio สำหรับ Windows ติดตั้งครั้งเดียว
              แล้วเปิดแอปจาก Desktop ได้เลย ไม่ต้องเปิดเบราว์เซอร์หรือหน้าต่างคำสั่งค้างไว้
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={installerUrl}
                download={installerName}
                className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-xl border border-violet-100/20 bg-violet-200 px-6 py-3 font-semibold text-[#17131f] transition hover:bg-violet-100"
              >
                <ArrowDownToLine className="h-5 w-5 transition-transform group-hover:translate-y-0.5" />
                <span className="text-left">
                  <span className="block text-sm">ดาวน์โหลดสำหรับ Windows</span>
                  <span className="mt-0.5 block text-[10px] font-normal text-[#40384b]">Windows 10/11 · 64-bit · เวอร์ชัน {appVersion} · อัปเดต {appReleaseLabel}</span>
                </span>
              </a>
              <span className="inline-flex items-center gap-2 px-1 text-[11px] text-zinc-500">
                <HardDriveDownload className="h-4 w-4 shrink-0" />
                ดาวน์โหลดจาก GitHub Releases · ความคืบหน้าดูได้ในเบราว์เซอร์
              </span>
            </div>

            <a href="#install" className="mt-5 inline-flex items-center gap-1.5 text-xs text-zinc-400 underline decoration-white/20 underline-offset-4 hover:text-zinc-200">
              ดูวิธีติดตั้ง <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="mx-auto w-full max-w-md">
            <div className="rounded-2xl border border-white/[0.08] bg-[#121219] p-5 shadow-xl">
              <div className="flex items-center gap-3 border-b border-white/[0.07] pb-4">
                <BrandLogo className="h-12 w-12 rounded-xl" label="CutPro Studio app icon" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">CutPro Studio Setup</div>
                  <div className="mt-1 text-[11px] text-zinc-500">ตัวติดตั้ง Windows · x64</div>
                </div>
                <span className="rounded-full border border-violet-200/15 bg-violet-200/[0.06] px-2 py-1 text-[10px] text-violet-100">เวอร์ชัน {appVersion}</span>
              </div>
              <div className="space-y-3 py-5">
                {features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2.5 text-xs leading-relaxed text-zinc-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-200" />
                    {feature}
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-black/15 p-3">
                <div className="mb-2 flex items-center justify-between text-[10px] text-zinc-500">
                  <span>ไฟล์ติดตั้ง</span>
                  <span>Windows x64 · ~230 MB</span>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                  ดู SHA-256 และขนาดไฟล์จริงได้ใน{" "}
                  <a href={releaseInfoUrl} className="text-violet-200 underline underline-offset-2 hover:text-violet-100">ข้อมูลรุ่นนี้</a>.
                  เปอร์เซ็นต์ดาวน์โหลดจริงดูได้ใน Chrome/Edge Downloads (Ctrl+J)
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="install" className="grid gap-4 border-t border-white/[0.08] pt-10 md:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.08] bg-[#121219] p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-sm font-semibold text-violet-200">1</span>
              <h2 className="text-sm font-semibold">ดาวน์โหลดและติดตั้ง</h2>
            </div>
            <ol className="space-y-3 pl-10 text-xs leading-relaxed text-zinc-400">
              <li>กดปุ่มดาวน์โหลด แล้วดูความคืบหน้าใน Downloads ของเบราว์เซอร์ (Ctrl+J)</li>
              <li>เมื่อดาวน์โหลดเสร็จ เปิดไฟล์ติดตั้งและทำตามขั้นตอน ระบบจะแสดงความคืบหน้าระหว่างติดตั้ง</li>
              <li>เลือกสร้าง Desktop shortcut แล้วเปิด CutPro Studio จากไอคอนแอป</li>
            </ol>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-[#121219] p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2.5">
              <ShieldAlert className="h-5 w-5 text-violet-200" />
              <h2 className="text-sm font-semibold text-zinc-100">แจ้งเตือนความปลอดภัย</h2>
            </div>
            <p className="text-xs leading-relaxed text-zinc-400">
              ไฟล์ติดตั้งนี้ยังไม่มีใบรับรองลงลายเซ็นจากผู้เผยแพร่ที่ Windows เชื่อถือ
              SmartScreen จึงอาจแสดงคำเตือนผู้เผยแพร่ที่ไม่รู้จัก หาก Microsoft Defender
              ระบุไฟล์เป็นภัยคุกคาม ให้หยุดใช้งานและส่งตรวจสอบกับ Microsoft
              อย่าปิด Defender หรือเพิ่มข้อยกเว้นเพื่อข้ามคำเตือน
            </p>
          </div>
        </section>

        <footer className="mt-10 flex flex-col justify-between gap-3 border-t border-white/[0.08] pt-6 text-[11px] text-zinc-500 sm:flex-row sm:items-center">
          <span>CutPro Studio · Windows x64 · v{appVersion}</span>
        </footer>
      </div>
    </main>
  );
}
