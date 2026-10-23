"use client";

import { useState } from "react";
import { Toaster } from "sonner";
import ExportDialog from "@/components/editor/ExportDialog";
import Inspector from "@/components/editor/Inspector";
import MediaPanel from "@/components/editor/MediaPanel";
import PwaProvider from "@/components/editor/PwaProvider";
import PreviewPlayer from "@/components/editor/PreviewPlayer";
import Timeline from "@/components/editor/Timeline";
import TopBar from "@/components/editor/TopBar";

export default function EditorShell() {
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0e] text-zinc-100 lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <PwaProvider />
      <TopBar onExport={() => setExportOpen(true)} />

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* left: media */}
        <aside className="order-2 h-64 shrink-0 border-white/[0.06] bg-[#101016] lg:order-1 lg:h-auto lg:w-72 lg:border-r xl:w-80">
          <MediaPanel />
        </aside>

        {/* center: preview */}
        <section className="order-1 min-h-[280px] flex-1 lg:order-2 lg:min-h-0">
          <PreviewPlayer />
        </section>

        {/* right: inspector */}
        <aside className="order-3 h-96 shrink-0 border-white/[0.06] bg-[#101016] lg:h-auto lg:max-h-none lg:w-80 lg:border-l">
          <Inspector />
        </aside>
      </main>

      {/* bottom: timeline */}
      <section className="order-4 h-72 shrink-0 lg:h-80">
        <Timeline />
      </section>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <Toaster
        theme="dark"
        position="bottom-center"
        toastOptions={{
          style: {
            background: "#17171f",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#f4f4f5",
            fontSize: "12px",
          },
        }}
      />
    </div>
  );
}
