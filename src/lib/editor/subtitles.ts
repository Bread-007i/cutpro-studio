export interface TimedSubtitle {
  start: number;
  end: number;
  text: string;
}

const MAX_SUBTITLE_CUES = 5000;

function parseTimestamp(value: string): number | null {
  const match = value.match(/^(?:(\d+):)?([0-5]?\d):([0-5]?\d)[,.](\d{1,3})$/);
  if (!match) return null;

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4].padEnd(3, "0"));
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

export function parseSrt(contents: string): TimedSubtitle[] {
  const normalizedLines = contents
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !/^[ \t]*```/.test(line));
  const firstTimingLine = normalizedLines.findIndex((line) => line.includes("-->"));
  if (firstTimingLine > 0) {
    const firstCueLine =
      /^\s*\d+\s*$/.test(normalizedLines[firstTimingLine - 1]) ? firstTimingLine - 1 : firstTimingLine;
    normalizedLines.splice(0, firstCueLine);
  }
  const normalized = normalizedLines.join("\n").trim();
  if (!normalized) throw new Error("ไฟล์ SRT ไม่มีเนื้อหา");

  const blocks = normalized.split(/\n[ \t]*\n+/);
  if (blocks.length > MAX_SUBTITLE_CUES) {
    throw new Error(`ไฟล์มีซับเกิน ${MAX_SUBTITLE_CUES.toLocaleString()} รายการ`);
  }

  const cues = blocks.map((block, index): TimedSubtitle => {
    const lines = block.split("\n");
    if (/^\s*\d+\s*$/.test(lines[0] ?? "")) lines.shift();

    const timing = lines.shift()?.trim().match(
      /^((?:\d+:)?[0-5]?\d:[0-5]?\d[,.]\d{1,3})\s+-->\s+((?:\d+:)?[0-5]?\d:[0-5]?\d[,.]\d{1,3})(?:\s+.*)?$/
    );
    if (!timing) throw new Error(`รูปแบบเวลาในซับลำดับ ${index + 1} ไม่ถูกต้อง`);

    const start = parseTimestamp(timing[1]);
    const end = parseTimestamp(timing[2]);
    const text = lines.join("\n").trim();
    if (start === null || end === null || start < 0 || end <= start) {
      throw new Error(`เวลาเริ่มและเวลาจบของซับลำดับ ${index + 1} ไม่ถูกต้อง`);
    }
    if (!text) throw new Error(`ซับลำดับ ${index + 1} ไม่มีข้อความ`);

    return { start, end, text };
  });

  return cues.sort((a, b) => a.start - b.start);
}

export function formatSrtTimestamp(seconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(wholeSeconds)},${pad(milliseconds, 3)}`;
}
