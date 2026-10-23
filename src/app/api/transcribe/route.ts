import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const audioBase64: string | undefined = body?.audio_base64;
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return NextResponse.json(
        { error: "กรุณาส่ง audio_base64 (WAV 16kHz mono แนะนำ)" },
        { status: 400 }
      );
    }
    // ~30MB base64 guard
    if (audioBase64.length > 40_000_000) {
      return NextResponse.json(
        { error: "ไฟล์เสียงใหญ่เกินไป (จำกัดประมาณ 10 นาที)" },
        { status: 413 }
      );
    }

    const zai = await ZAI.create();
    const result = await zai.audio.asr.create({
      file_base64: audioBase64,
    });

    const text = (result?.text ?? "").trim();
    if (!text) {
      return NextResponse.json(
        { error: "AI ไม่ได้ยินเสียงพูดที่ชัดเจน ลองคลิปที่มีการพูดชัดกว่านี้" },
        { status: 422 }
      );
    }
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `ถอดเสียงไม่สำเร็จ: ${message}` },
      { status: 500 }
    );
  }
}
