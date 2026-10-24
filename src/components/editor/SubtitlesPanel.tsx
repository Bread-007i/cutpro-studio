"use client";

import { useRef, useState } from "react";
import { FileText, Play, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatSrtTimestamp, parseSrt, type TimedSubtitle } from "@/lib/editor/subtitles";
import { useEditor } from "@/lib/editor/store";
import { downloadBlob, formatTime } from "@/lib/editor/utils";

const EXAMPLE_SCRIPT = [
  "1",
  "00:00:01,000 --> 00:00:04,000",
  "สวัสดีครับคุณผู้ฟัง ยินดีต้อนรับสู่ไฟล์ตัวอย่างซับไตเติล",
  "",
  "2",
  "00:00:04,500 --> 00:00:08,000",
  "นี่คือข้อความทดสอบที่จัดทำขึ้นตามที่คุณต้องการ",
  "",
  "3",
  "00:00:08,500 --> 00:00:12,000",
  "ขอให้คุณมีความสุขและสนุกกับการใช้งานระบบนะครับ",
  "",
  "4",
  "00:00:12,500 --> 00:00:16,000",
  "วันนี้เราจะมาพูดคุยกันถึงเรื่องราวที่น่าสนใจมากมาย",
].join("\n");

function exportSrt(cues: TimedSubtitle[]): string {
  return `${cues.map((cue, index) => (
    `${index + 1}\n${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}\n${cue.text}`
  )).join("\n\n")}\n`;
}

export default function SubtitlesPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clips = useEditor((state) => state.clips);
  const selectedClipId = useEditor((state) => state.selectedClipId);
  const [script, setScript] = useState("");
  const textClips = clips
    .filter((clip) => clip.kind === "text")
    .sort((a, b) => a.start - b.start);

  const loadScriptFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("ไฟล์สคริปต์ใหญ่เกินไป (จำกัด 5 MB)");
      return;
    }
    try {
      const contents = await file.text();
      setScript(contents);
      try {
        const cues = parseSrt(contents);
        toast.success(`เปิด ${file.name} แล้ว พบซับ ${cues.length} รายการ — กดแปลงสคริปต์ลงไทม์ไลน์`);
      } catch {
        toast.success(`เปิดไฟล์ ${file.name} ในช่องสคริปต์แล้ว`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "อ่านไฟล์สคริปต์ไม่สำเร็จ");
    }
  };

  const convertScript = () => {
    try {
      const cues = parseSrt(script);
      const ids = useEditor.getState().addTimedTextClips(cues);
      if (ids.length === 0) {
        toast.error("ไม่พบแทร็กข้อความสำหรับวางซับ");
        return;
      }
      toast.success(`แปลงสคริปต์และเพิ่มซับ ${ids.length} รายการลงไทม์ไลน์แล้ว`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "แปลงสคริปต์ไม่สำเร็จ");
    }
  };

  const exportCaptions = () => {
    if (textClips.length === 0) {
      toast.error("ยังไม่มีข้อความบนไทม์ไลน์ให้ส่งออก");
      return;
    }
    const cues = textClips.map((clip) => ({
      start: clip.start,
      end: clip.start + clip.duration,
      text: clip.props.text,
    }));
    downloadBlob(
      new Blob([exportSrt(cues)], { type: "text/plain;charset=utf-8" }),
      "cutpro-subtitles.srt"
    );
  };

  return (
    <ScrollArea className="h-full p-2">
      <div className="space-y-3 pr-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".srt,.md,application/x-subrip,text/markdown,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadScriptFile(file);
            event.target.value = "";
          }}
        />
        <Button
          className="w-full bg-violet-600 text-white hover:bg-violet-500"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1.5 h-4 w-4" /> เปิดไฟล์สคริปต์ .srt / .md
        </Button>
        <p className="text-[10px] leading-relaxed text-zinc-500">
          เปิดไฟล์หรือวางสคริปต์ในช่องด้านล่าง โดยแต่ละซับมีเลขลำดับ เวลาเริ่ม–จบ และข้อความ
        </p>

        <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-800/40 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
              <FileText className="h-3.5 w-3.5 text-violet-300" />
              สคริปต์คำบรรยาย
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] text-violet-200 hover:bg-violet-950/40"
              onClick={() => setScript(EXAMPLE_SCRIPT)}
            >
              ใส่ตัวอย่าง
            </Button>
          </div>
          <Textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder={`1\n00:00:01,000 --> 00:00:04,000\nสวัสดีครับคุณผู้ฟัง\n\n2\n00:00:04,500 --> 00:00:08,000\nนี่คือข้อความทดสอบ`}
            rows={12}
            spellCheck={false}
            className="min-h-56 border-zinc-700 bg-zinc-950 font-mono text-[11px] leading-relaxed text-zinc-100"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              className="h-8 bg-violet-600 text-[11px] text-white hover:bg-violet-500"
              onClick={convertScript}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" /> แปลงสคริปต์ลงไทม์ไลน์
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-zinc-700 bg-transparent text-[11px] text-zinc-200 hover:bg-zinc-800"
              onClick={() => setScript("")}
            >
              ล้างช่องสคริปต์
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium text-zinc-300">ข้อความบนไทม์ไลน์ ({textClips.length})</div>
          <Button
            variant="outline"
            size="sm"
            disabled={textClips.length === 0}
            className="h-7 border-zinc-700 bg-zinc-800 px-2 text-[10px] text-zinc-200 hover:bg-zinc-700"
            onClick={exportCaptions}
          >
            ส่งออก SRT
          </Button>
        </div>
        {textClips.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-700 p-3 text-center text-[10px] text-zinc-500">
            ยังไม่มีข้อความบนไทม์ไลน์ เพิ่มสคริปต์ด้านบนได้เลย
          </p>
        ) : (
          <ul className="space-y-1">
            {textClips.map((clip) => (
              <li key={clip.id}>
                <button
                  className={`w-full rounded-md border p-2 text-left transition ${
                    clip.id === selectedClipId
                      ? "border-violet-400/60 bg-violet-950/30"
                      : "border-zinc-800 bg-zinc-800/40 hover:border-zinc-600"
                  }`}
                  onClick={() => {
                    useEditor.getState().select(clip.id);
                    useEditor.getState().setPlayhead(clip.start);
                  }}
                >
                  <span className="block truncate text-[10px] text-zinc-200">{clip.props.text}</span>
                  <span className="mt-1 block font-mono text-[9px] text-zinc-500">
                    {formatTime(clip.start)} – {formatTime(clip.start + clip.duration)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ScrollArea>
  );
}
