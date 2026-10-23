"use client";

import dynamic from "next/dynamic";

const EditorShell = dynamic(() => import("@/components/editor/EditorShell"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0e]">
      <img
        src="/icons/icon-192.png"
        alt="ตัดต่อโปร Studio"
        className="h-16 w-16 rounded-2xl shadow-[0_0_40px_rgba(168,85,247,0.45)]"
      />
      <div className="flex items-center gap-3 text-sm text-zinc-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
        กำลังเปิดตัดต่อโปร Studio…
      </div>
    </div>
  ),
});

export default function Page() {
  return <EditorShell />;
}
