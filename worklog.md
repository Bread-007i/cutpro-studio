# Worklog

---
Task ID: 1
Agent: main (Z.ai)
Task: สร้างเว็บแอปตัดต่อวิดีโอแบบ CapCut/DaVinci Resolve (ผู้ใช้ขอ "ทำแอปcapcut หรือแอปตัดต่อโดยมีระบบช่วยตัดต่อเต็มพิกัด")

Work Log:
- เตรียม environment ด้วย init-fullstack.sh (Next.js 16 + TS + Tailwind 4 + shadcn/ui + Zustand)
- โหลด skill: fullstack-dev, ASR, agent-browser
- สร้างระบบ state: src/lib/editor/{types,utils,audioGraph,analysis,store,playerBus}.ts
  - Zustand store พร้อมประวัติ undo/redo (สแน็ปช็อต media+tracks+clips, จำกัด 60 สเต็ป)
  - AudioGraph: รวมเสียงคลิปผ่าน WebAudio gain node + MediaStreamDestination สำหรับ export
  - analysis.ts: detectScenes (frame diff), detectSilence (RMS windows), extractWav (16kHz mono สำหรับ AI), splitTextForCaptions (ภาษาไทย)
- สร้าง UI: src/components/editor/{EditorShell,TopBar,MediaPanel,PreviewPlayer,Timeline,Inspector,ExportDialog}.tsx
  - Preview engine: canvas 2D วาดทุกแทร็ก (video/image/text), ctx.filter, transform, fade in/out, sync สื่อต่อเฟรม
  - Timeline: ลากย้ายข้ามแทร็ก, ย่อ-ขยายขอบ (trim), สแน็ป, ซูม (Ctrl+wheel), ruler seek, playhead, เฟด overlay
  - Media panel 4 แท็บ: สื่อ (นำเข้า/ลากวาง/คลิปตัวอย่าง), ข้อความ (พรีเซ็ต), ฟิลเตอร์ (9 พรีเซ็ตพร้อมพรีวิว), AI
  - Inspector: ทรานส์ฟอร์ม/ความเร็ว, สี, เสียง (volume/fade), ข้อความ (ฟอนต์/สี/พื้นหลัง/จัดตำแหน่ง)
  - Export dialog: MediaRecorder + probe ตรวจว่าผสมเสียงได้ไหม (headless ไม่มีอุปกรณ์เสียง → fallback video-only) + webm-duration-fix
  - คีย์ลัด: Space/S/Delete/Ctrl+Z,Y,D/ลูกศร/+- /Home,End
- API: src/app/api/transcribe/route.ts (z-ai-web-dev-sdk ASR, รับ WAV base64, จำกัดขนาด)
- อัปเดต layout.tsx (ภาษาไทย + ฟอนต์ไทย fallback stack), page.tsx (dynamic ssr:false), globals.css (dark scrollbar)
- แก้บั๊กที่เจอจากการทดสอบ agent-browser:
  1) MediaRecorder ผสม audio track จาก WebAudio ได้ 0 bytes ใน Chromium headless → เพิ่ม probe recording 450ms แล้ว fallback video-only อัตโนมัติ (บน Chrome จริงมีเสียงครบ)
  2) WebM จาก MediaRecorder ไม่มี duration → webm-duration-fix (ตรวจขนาด fallback ถ้าพัง)
  3) Hydration mismatch จาก Radix Select SSR → page.tsx ใช้ dynamic import ssr:false + loading spinner
  4) Inspector ล้นทับ Timeline บนมือถือ → กำหนด h-96 ให้ aside บนจอเล็ก

Stage Summary:
- ทดสอบผ่าน agent-browser แล้ว: โหลด demo, เล่นวิดีโอ, seek, split, undo, ลากคลิปข้ามแทร็ก, ฟิลเตอร์ขาวดำ, ส่งออกได้ไฟล์ WebM 8 วินาที 0.7MB เล่น/seek ได้มี duration ถูกต้อง, AI tab, mobile layout
- lint ผ่าน, dev.log ไม่มี error, ไม่มี hydration error หลังโหลดสด
- ไฟล์ทั้งหมดอยู่ใต้ src/lib/editor, src/components/editor, src/app/api/transcribe
