"use client";

import { useState } from "react";
import { Clock3, Film, FolderOpen, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import BrandLogo from "@/components/editor/BrandLogo";
import type { ProjectSummary } from "@/lib/editor/projectStorage";

export default function ProjectHome({
  projects,
  loading,
  busyId,
  restoreProgress,
  onCreate,
  onOpen,
  onDelete,
}: {
  projects: ProjectSummary[];
  loading: boolean;
  busyId: string | null;
  restoreProgress: { percentage: number; message: string };
  onCreate: (name: string) => void;
  onOpen: (id: string) => void;
  onDelete: (project: ProjectSummary) => void;
}) {
  const [name, setName] = useState("");

  return (
    <main className="min-h-screen bg-[#0a0a0e] px-5 py-12 text-zinc-100 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-12 w-12 shrink-0 rounded-xl" label="โลโก้ ตัดต่อโปร Studio" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-violet-200">
                ตัดต่อโปร Studio
              </h1>
              <p className="text-xs text-zinc-500">โปรเจกต์และไฟล์สื่อจัดเก็บไว้ในเครื่องนี้</p>
            </div>
          </div>
        </header>

        <section className="mb-10 rounded-xl border border-white/[0.08] bg-[#12121a] p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">เริ่มโปรเจกต์ใหม่</h2>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              onCreate(name.trim() || "โปรเจกต์ใหม่");
              setName("");
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="ตั้งชื่อโปรเจกต์"
              aria-label="ชื่อโปรเจกต์ใหม่"
              className="border-white/10 bg-black/20 text-sm"
            />
            <Button type="submit" disabled={busyId !== null} className="shrink-0 bg-violet-200 text-[#17131f] hover:bg-violet-100">
              <Plus className="mr-1.5 h-4 w-4" /> สร้างโปรเจกต์
            </Button>
          </form>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">โปรเจกต์ของฉัน</h2>
            <span className="text-xs text-zinc-500">{projects.length} โปรเจกต์</span>
          </div>

          {busyId && restoreProgress.message && (
            <div className="mb-4 rounded-lg border border-white/[0.08] bg-[#12121a] p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-zinc-400">
                <span>{restoreProgress.message}</span>
                <span className="font-mono tabular-nums text-fuchsia-300">{restoreProgress.percentage}%</span>
              </div>
              <Progress value={restoreProgress.percentage} className="h-1.5" />
            </div>
          )}

          {loading ? (
            <div className="rounded-xl border border-white/[0.08] bg-[#12121a] p-8 text-center text-sm text-zinc-500">
              กำลังอ่านโปรเจกต์ในเครื่อง…
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-5 py-12 text-center">
              <FolderOpen className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
              <p className="text-sm text-zinc-400">ยังไม่มีโปรเจกต์ที่บันทึกไว้</p>
              <p className="mt-1 text-xs text-zinc-600">สร้างโปรเจกต์ใหม่ด้านบนเพื่อเริ่มตัดต่อ</p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {projects.map((project) => (
                <li key={project.id} className="rounded-xl border border-white/[0.08] bg-[#12121a] p-4 transition hover:border-violet-400/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-zinc-100">{project.name}</h3>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                        <span className="inline-flex items-center gap-1"><Film className="h-3 w-3" />{project.mediaCount} สื่อ</span>
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{new Date(project.savedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300"
                      aria-label={`ลบโปรเจกต์ ${project.name}`}
                      title="ลบโปรเจกต์และสื่อที่เก็บไว้"
                      disabled={busyId !== null}
                      onClick={() => onDelete(project)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    variant="secondary"
                    className="mt-4 h-8 w-full bg-white/[0.06] text-xs text-zinc-200 hover:bg-violet-500/20"
                    disabled={busyId !== null}
                    onClick={() => onOpen(project.id)}
                  >
                    <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                    {busyId === project.id ? "กำลังเปิด…" : "เปิดโปรเจกต์"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
