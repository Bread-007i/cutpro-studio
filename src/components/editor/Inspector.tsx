"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  Copy,
  ClipboardPaste,
  Move,
  Palette,
  RotateCcw,
  Save,
  SplitSquareHorizontal,
  Trash2,
  Type as TypeIcon,
  Volume2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getClipTrackType, useEditor } from "@/lib/editor/store";
import type { AspectRatio, Clip, ClipProps, CurvePt, GradeCurves } from "@/lib/editor/types";
import { formatTimeFull } from "@/lib/editor/utils";
import {
  LOOKS,
  NEUTRAL_GRADE,
  copyGrade,
  hasGradeClipboard,
  isGraded,
  loadUserLooks,
  addUserLook,
  removeUserLook,
  offsetToWheel,
  pasteGrade,
  sampleCurve,
  wheelToOffset,
} from "@/lib/editor/color";
import { grader } from "@/lib/editor/glGrade";
import { playerBus } from "@/lib/editor/playerBus";

export default function Inspector() {
  const selectedClip = useEditor(
    (s) => s.clips.find((c) => c.id === s.selectedClipId) ?? null
  );
  const media = useEditor((s) => s.media);
  const aspect = useEditor((s) => s.aspect);

  if (!selectedClip) {
    return <ProjectPanel aspect={aspect} />;
  }

  const clipType = getClipTrackType(selectedClip, media);
  const hasVisual = clipType === "video" || selectedClip.kind === "text";
  const hasAudio =
    selectedClip.kind === "media" &&
    (clipType === "audio" || (clipType === "video" && media.find((m) => m.id === selectedClip.mediaId)?.type === "video"));

  return (
    <ScrollArea className="h-full">
      <div className="p-3">
        <ClipInfo clip={selectedClip} clipType={clipType} />
        {hasVisual && <TransformSection clip={selectedClip} />}
        {selectedClip.kind === "text" && <TextSection clip={selectedClip} />}
        {selectedClip.kind === "media" && clipType === "video" && <ColorSection clip={selectedClip} />}
        {hasAudio && <AudioSection clip={selectedClip} />}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Panel({
  title,
  icon,
  children,
  onReset,
  actions,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onReset?: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="mb-2.5 flex items-center gap-1.5">
        {icon}
        <h3 className="text-xs font-semibold text-zinc-200">{title}</h3>
        <div className="ml-auto flex items-center gap-0.5">
          {actions}
          {onReset && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 hover:text-zinc-200"
              onClick={onReset}
              title="รีเซ็ต"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
      <Separator className="mt-4 bg-white/[0.06]" />
    </section>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] text-zinc-400">{label}</span>
        {value && <span className="font-mono text-[10px] tabular-nums text-zinc-500">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function RgbSlider({
  label,
  value,
  min,
  max,
  onChange,
  onBegin,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onBegin: () => void;
}) {
  return (
    <Row label={label} value={value.toFixed(3)}>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={0.005}
        onPointerDown={onBegin}
        onValueChange={([next]) => onChange(next)}
      />
    </Row>
  );
}

/** push history (throttled) before interactive grade edits so Ctrl+Z works */
function useGradeHistory() {
  const last = useRef(0);
  return () => {
    const now = Date.now();
    if (now - last.current > 800) {
      useEditor.getState().pushHistory();
      last.current = now;
    }
  };
}

// ---------------------------------------------------------------------------
// Clip info
// ---------------------------------------------------------------------------

function ClipInfo({ clip, clipType }: { clip: Clip; clipType: string }) {
  const s = useEditor.getState();
  const track = s.tracks.find((t) => t.id === clip.trackId);
  const graded = clip.kind === "media" && isGraded(clip.props);
  return (
    <div className="mb-4 rounded-lg border border-white/[0.07] bg-white/[0.03] p-2.5">
      <div className="flex items-center gap-1.5">
        <div className="truncate text-xs font-semibold text-zinc-100" title={clip.name}>
          {clip.name}
        </div>
        {graded && (
          <span className="shrink-0 rounded bg-fuchsia-500/80 px-1 text-[8px] font-bold uppercase text-white">
            เกรดสี
          </span>
        )}
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1 font-mono text-[10px] text-zinc-500">
        <div>
          <span className="block text-zinc-600">เริ่ม</span>
          {formatTimeFull(clip.start)}
        </div>
        <div>
          <span className="block text-zinc-600">ความยาว</span>
          {clip.duration.toFixed(2)}s
        </div>
        <div>
          <span className="block text-zinc-600">แทร็ก</span>
          {track?.name ?? clipType}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 h-6 w-full text-[10px] text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
        onClick={() => useEditor.getState().deleteClip(clip.id)}
      >
        ลบคลิปนี้
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

function TransformSection({ clip }: { clip: Clip }) {
  const p = clip.props;
  const set = (patch: Partial<ClipProps>) => useEditor.getState().updateClipProps(clip.id, patch);
  return (
    <Panel
      title="ทรานส์ฟอร์ม"
      icon={<Move className="h-3.5 w-3.5 text-violet-400" />}
      onReset={() =>
        set({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 })
      }
    >
      <Row label="ขนาด" value={`${Math.round(p.scale * 100)}%`}>
        <Slider
          value={[p.scale]}
          min={0.1}
          max={10}
          step={0.01}
          onValueChange={([v]) => set({ scale: v })}
        />
      </Row>
      <Row label="ตำแหน่ง X" value={p.x.toFixed(2)}>
        <Slider
          value={[p.x]}
          min={-1}
          max={1}
          step={0.01}
          onValueChange={([v]) => set({ x: v })}
        />
      </Row>
      <Row label="ตำแหน่ง Y" value={p.y.toFixed(2)}>
        <Slider
          value={[p.y]}
          min={-1}
          max={1}
          step={0.01}
          onValueChange={([v]) => set({ y: v })}
        />
      </Row>
      <Row label="หมุน" value={`${p.rotation}°`}>
        <Slider
          value={[p.rotation]}
          min={-180}
          max={180}
          step={1}
          onValueChange={([v]) => set({ rotation: v })}
        />
      </Row>
      <Row label="ความทึบ" value={`${Math.round(p.opacity * 100)}%`}>
        <Slider
          value={[p.opacity]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={([v]) => set({ opacity: v })}
        />
      </Row>
      {clip.kind === "media" && (
        <>
          <Row label="การวางภาพ">
            <Select value={p.fit} onValueChange={(v) => set({ fit: v as "contain" | "cover" })}>
              <SelectTrigger className="h-7 border-white/10 bg-white/[0.05] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contain">ใส่ทั้งภาพ (มีขอบดำ)</SelectItem>
                <SelectItem value="cover">เต็มจอ (ตัดบางส่วน)</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="ความเร็ว" value={`${p.speed}×`}>
            <Slider
              value={[p.speed]}
              min={0.25}
              max={4}
              step={0.05}
              onValueChange={([v]) => set({ speed: v })}
            />
          </Row>
          <div className="flex gap-1">
            {[0.5, 1, 1.5, 2, 4].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={p.speed === s ? "secondary" : "ghost"}
                className={`h-6 flex-1 px-0 text-[10px] ${p.speed === s ? "bg-violet-600/40 text-violet-100" : "text-zinc-400 hover:bg-white/10"}`}
                onClick={() => set({ speed: s })}
              >
                {s}×
              </Button>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Color grading suite
// ---------------------------------------------------------------------------

function ColorSection({ clip }: { clip: Clip }) {
  const p = clip.props;
  const media = useEditor((s) => s.media);
  const compare = useEditor((s) => s.compare);
  const set = (patch: Partial<ClipProps>) => useEditor.getState().updateClipProps(clip.id, patch);
  const begin = useGradeHistory();
  const mediaItem = media.find((m) => m.id === clip.mediaId);

  return (
    <Panel
      title="เกรดสี"
      icon={<Palette className="h-3.5 w-3.5 text-fuchsia-400" />}
      actions={
        <>
          <Button
            variant={compare ? "secondary" : "ghost"}
            size="icon"
            className={`h-6 w-6 ${compare ? "bg-fuchsia-600/30 text-fuchsia-200" : "text-zinc-500 hover:text-zinc-200"}`}
            onClick={() => useEditor.getState().setCompare(!compare)}
            title="เทียบก่อน/หลัง (B)"
          >
            <SplitSquareHorizontal className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-zinc-200"
            title="คัดลอกเกรดสี"
            onClick={() => {
              copyGrade(clip.props);
              toast.success("คัดลอกเกรดสีแล้ว");
            }}
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-zinc-200"
            title="วางเกรดสี"
            disabled={!hasGradeClipboard()}
            onClick={() => {
              const g = pasteGrade();
              if (g) {
                begin();
                set(g);
                toast.success("วางเกรดสีแล้ว");
              }
            }}
          >
            <ClipboardPaste className="h-3 w-3" />
          </Button>
        </>
      }
      onReset={() => set(NEUTRAL_GRADE)}
    >
      <Tabs defaultValue="wheels" className="space-y-3">
        <TabsList className="grid h-8 w-full grid-cols-3 bg-white/[0.05]">
          <TabsTrigger value="wheels" className="h-6 text-[11px]">วีลสี</TabsTrigger>
          <TabsTrigger value="curves" className="h-6 text-[11px]">เส้นโค้ง</TabsTrigger>
          <TabsTrigger value="looks" className="h-6 text-[11px]">ลุคส์</TabsTrigger>
        </TabsList>

        <TabsContent value="wheels" className="mt-0 space-y-3">
          <Histogram />
          <div className="grid grid-cols-3 gap-2">
            <WheelGroup
              label="Lift (เงามืด)"
              m={p.liftM}
              w={{ r: p.liftR, g: p.liftG, b: p.liftB }}
              maxOff={0.25}
              sliderRange={0.5}
              onWheel={(r, g, b) => {
                begin();
                set({ liftR: r, liftG: g, liftB: b });
              }}
              onMaster={(m) => {
                begin();
                set({ liftM: m });
              }}
            />
            <WheelGroup
              label="Gamma (กลาง)"
              m={p.gammaM}
              w={{ r: p.gammaR, g: p.gammaG, b: p.gammaB }}
              maxOff={0.5}
              sliderRange={1}
              onWheel={(r, g, b) => {
                begin();
                set({ gammaR: r, gammaG: g, gammaB: b });
              }}
              onMaster={(m) => {
                begin();
                set({ gammaM: m });
              }}
            />
            <WheelGroup
              label="Gain (สว่าง)"
              m={p.gainM}
              w={{ r: p.gainR, g: p.gainG, b: p.gainB }}
              maxOff={0.4}
              sliderRange={1}
              onWheel={(r, g, b) => {
                begin();
                set({ gainR: r, gainG: g, gainB: b });
              }}
              onMaster={(m) => {
                begin();
                set({ gainM: m });
              }}
            />
          </div>
          <details className="rounded-md border border-white/[0.07] bg-white/[0.02] p-2">
            <summary className="cursor-pointer select-none text-[10px] font-medium text-zinc-300">
              ปรับ RGB แยกช่องแบบละเอียด
            </summary>
            <div className="mt-3 space-y-3">
              {(
                [
                  ["Lift", "lift", -0.25, 0.25],
                  ["Gamma", "gamma", -0.5, 0.5],
                  ["Gain", "gain", -0.4, 0.4],
                ] as const
              ).map(([label, key, min, max]) => (
                <div key={key} className="space-y-2 rounded border border-white/[0.05] p-2">
                  <div className="text-[10px] font-semibold text-zinc-300">{label}</div>
                  {(["R", "G", "B"] as const).map((channel) => {
                    const prop = `${key}${channel}` as "liftR" | "liftG" | "liftB" | "gammaR" | "gammaG" | "gammaB" | "gainR" | "gainG" | "gainB";
                    return (
                      <RgbSlider
                        key={prop}
                        label={channel}
                        value={p[prop]}
                        min={min}
                        max={max}
                        onBegin={begin}
                        onChange={(value) => set({ [prop]: value })}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </details>
          <Row label="อุณหภูมิสี" value={p.temp === 0 ? "กลาง" : p.temp > 0 ? `อบอุ่น +${p.temp}` : `เย็น ${p.temp}`}>
            <Slider
              value={[p.temp]}
              min={-100}
              max={100}
              step={1}
              onPointerDown={begin}
              onValueChange={([v]) => set({ temp: v })}
            />
          </Row>
          <Row label="โทนม่วง-เขียว (Tint)" value={p.tint === 0 ? "กลาง" : `${p.tint > 0 ? "ม่วง" : "เขียว"} ${Math.abs(p.tint)}`}>
            <Slider
              value={[p.tint]}
              min={-100}
              max={100}
              step={1}
              onPointerDown={begin}
              onValueChange={([v]) => set({ tint: v })}
            />
          </Row>
          <Row label="ไฮไลต์" value={`${p.highlights > 0 ? "+" : ""}${p.highlights}`}>
            <Slider
              value={[p.highlights]}
              min={-100}
              max={100}
              step={1}
              onPointerDown={begin}
              onValueChange={([v]) => set({ highlights: v })}
            />
          </Row>
          <Row label="เงามืด" value={`${p.shadows > 0 ? "+" : ""}${p.shadows}`}>
            <Slider
              value={[p.shadows]}
              min={-100}
              max={100}
              step={1}
              onPointerDown={begin}
              onValueChange={([v]) => set({ shadows: v })}
            />
          </Row>
          <Row label="คอนทราสต์" value={p.contrast.toFixed(0)}>
            <Slider
              value={[p.contrast]}
              min={50}
              max={200}
              step={1}
              onPointerDown={begin}
              onValueChange={([v]) => set({ contrast: v })}
            />
          </Row>
          <Row label="ความอิ่มสี" value={p.saturation.toFixed(0)}>
            <Slider
              value={[p.saturation]}
              min={0}
              max={200}
              step={1}
              onPointerDown={begin}
              onValueChange={([v]) => set({ saturation: v })}
            />
          </Row>
          <Row label="ความสว่าง" value={p.brightness.toFixed(0)}>
            <Slider
              value={[p.brightness]}
              min={50}
              max={200}
              step={1}
              onPointerDown={begin}
              onValueChange={([v]) => set({ brightness: v })}
            />
          </Row>
          <Row label="เฉดสี (Hue)" value={`${p.hue}°`}>
            <Slider
              value={[p.hue]}
              min={-180}
              max={180}
              step={1}
              onPointerDown={begin}
              onValueChange={([v]) => set({ hue: v })}
            />
          </Row>
          <Row label="ฟิล์มซีด (Fade)" value={`${p.fade}%`}>
            <Slider
              value={[p.fade]}
              min={0}
              max={100}
              step={1}
              onPointerDown={begin}
              onValueChange={([v]) => set({ fade: v })}
            />
          </Row>
        </TabsContent>

        <TabsContent value="curves" className="mt-0">
          <CurvesEditor clip={clip} />
        </TabsContent>

        <TabsContent value="looks" className="mt-0">
          <LooksPanel clip={clip} mediaItem={mediaItem} />
        </TabsContent>
      </Tabs>

      <Row label="เอฟเฟกต์เพิ่มเติม" value={`เบลอ ${p.blur}px`}>
        <Slider
          value={[p.blur]}
          min={0}
          max={12}
          step={0.5}
          onPointerDown={begin}
          onValueChange={([v]) => set({ blur: v })}
        />
      </Row>
      <div className="grid grid-cols-2 gap-3">
        <Row label="ขาวดำ" value={`${p.grayscale}%`}>
          <Slider
            value={[p.grayscale]}
            min={0}
            max={100}
            step={1}
            onPointerDown={begin}
            onValueChange={([v]) => set({ grayscale: v })}
          />
        </Row>
        <Row label="ซีเปีย" value={`${p.sepia}%`}>
          <Slider
            value={[p.sepia]}
            min={0}
            max={100}
            step={1}
            onPointerDown={begin}
            onValueChange={([v]) => set({ sepia: v })}
          />
        </Row>
        <Row label="วิกเนต" value={`${p.vignette}%`}>
          <Slider
            value={[p.vignette]}
            min={0}
            max={100}
            step={1}
            onPointerDown={begin}
            onValueChange={([v]) => set({ vignette: v })}
          />
        </Row>
        <Row label="เกรนฟิล์ม" value={`${p.grain}%`}>
          <Slider
            value={[p.grain]}
            min={0}
            max={100}
            step={1}
            onPointerDown={begin}
            onValueChange={([v]) => set({ grain: v })}
          />
        </Row>
        <Row label="คมชัด (Sharpen)" value={`${p.sharpen}%`}>
          <Slider
            value={[p.sharpen]}
            min={0}
            max={100}
            step={1}
            onPointerDown={begin}
            onValueChange={([v]) => set({ sharpen: v })}
          />
        </Row>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Histogram (RGB) — reads the live preview canvas
// ---------------------------------------------------------------------------

const Histogram = memo(function Histogram() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tmp = document.createElement("canvas");
    tmp.width = 64;
    tmp.height = 36;
    const tctx = tmp.getContext("2d", { willReadFrequently: true });

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - last < 250) return;
      last = ts;
      const canvas = ref.current;
      const src = playerBus.canvas;
      if (!canvas || !src || !tctx) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      tctx.drawImage(src, 0, 0, 64, 36);
      let data: Uint8ClampedArray;
      try {
        data = tctx.getImageData(0, 0, 64, 36).data;
      } catch {
        return;
      }
      const bins = 64;
      const r = new Array(bins).fill(0);
      const g = new Array(bins).fill(0);
      const b = new Array(bins).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        r[Math.min(bins - 1, data[i] >> 2)]++;
        g[Math.min(bins - 1, data[i + 1] >> 2)]++;
        b[Math.min(bins - 1, data[i + 2] >> 2)]++;
      }
      const max = Math.max(...r, ...g, ...b, 1);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "screen";
      const drawCh = (arr: number[], color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < bins; i++) {
          const x = (i / (bins - 1)) * w;
          const y = h - (arr[i] / max) * (h - 2);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      };
      drawCh(r, "rgba(255,70,70,0.75)");
      drawCh(g, "rgba(70,255,120,0.75)");
      drawCh(b, "rgba(80,140,255,0.75)");
      ctx.globalCompositeOperation = "source-over";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] text-zinc-400">ฮิสโตแกรม RGB</span>
        <span className="text-[9px] text-zinc-600">สดจากพรีวิว</span>
      </div>
      <canvas
        ref={ref}
        width={280}
        height={72}
        className="w-full rounded-md border border-white/[0.07]"
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Color wheels (Lift / Gamma / Gain)
// ---------------------------------------------------------------------------

function WheelGroup({
  label,
  m,
  w,
  maxOff,
  sliderRange,
  onWheel,
  onMaster,
}: {
  label: string;
  m: number;
  w: { r: number; g: number; b: number };
  maxOff: number;
  sliderRange: number;
  onWheel: (r: number, g: number, b: number) => void;
  onMaster: (m: number) => void;
}) {
  const begin = useGradeHistory();
  const { angle, radius } = offsetToWheel(w, maxOff);
  return (
    <div className="flex flex-col items-center gap-1">
      <ColorWheel
        angle={angle}
        radius={radius}
        onBegin={() => begin()}
        onChange={(a, rad) => {
          const o = wheelToOffset(a, rad, maxOff);
          onWheel(o.r, o.g, o.b);
        }}
        onReset={() => {
          begin();
          onWheel(0, 0, 0);
        }}
      />
      <span className="text-[9px] font-medium text-zinc-400">{label}</span>
      <Slider
        value={[m]}
        min={-sliderRange}
        max={sliderRange}
        step={0.01}
        onPointerDown={() => begin()}
        onValueChange={(v) => onMaster(v[0])}
        className="h-1 w-full"
        aria-label={`${label} master`}
      />
      <span className="font-mono text-[8px] text-zinc-600">
        {m === 0 ? "กลาง" : m > 0 ? `+${m.toFixed(2)}` : m.toFixed(2)}
      </span>
    </div>
  );
}

function ColorWheel({
  angle,
  radius,
  onChange,
  onBegin,
  onReset,
}: {
  angle: number;
  radius: number;
  onChange: (angleDeg: number, radius: number) => void;
  onBegin: () => void;
  onReset: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const size = 88;

  const posFromEvent = (e: React.PointerEvent | PointerEvent) => {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxR = rect.width / 2;
    const rad = Math.min(1, dist / maxR);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { ang: (ang + 360) % 360, rad };
  };

  const dragging = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    onBegin();
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = posFromEvent(e);
    if (p) onChange(p.ang, p.rad);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const p = posFromEvent(e);
    if (p) onChange(p.ang, p.rad);
  };
  const stop = () => {
    dragging.current = false;
  };

  // dot position: hue ring — angle maps to hue directly
  const rad = (angle * Math.PI) / 180;
  const r = radius * (size / 2 - 8);
  const dx = Math.cos(rad) * r;
  const dy = Math.sin(rad) * r;

  return (
    <div
      ref={ref}
      aria-label="วีลสี"
      aria-valuetext={`hue ${Math.round(angle)}° radius ${Math.round(radius * 100)}%`}
      tabIndex={0}
      className="relative cursor-crosshair touch-none rounded-full ring-1 ring-white/15"
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle, rgba(128,128,128,0.25) 0%, rgba(0,0,0,0.55) 78%), conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={onReset}
      title="ลากเพื่อเลื่อนสี · ดับเบิลคลิกเพื่อรีเซ็ต"
    >
      <div
        className="pointer-events-none absolute h-3.5 w-3.5 rounded-full border-2 border-white bg-white/20 shadow-[0_0_6px_rgba(0,0,0,0.8)]"
        style={{
          left: `calc(50% + ${dx}px - 7px)`,
          top: `calc(50% + ${dy}px - 7px)`,
        }}
      />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Curves editor
// ---------------------------------------------------------------------------

type CurveChannel = "master" | "r" | "g" | "b";

function CurvesEditor({ clip }: { clip: Clip }) {
  const begin = useGradeHistory();
  const [channel, setChannel] = useState<CurveChannel>("master");
  const curves: GradeCurves = clip.props.curves ?? {};
  const pts: CurvePt[] =
    (curves[channel] as CurvePt[] | undefined) ?? [
      [0, 0],
      [1, 1],
    ];
  const size = 236;
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const setPoints = (next: CurvePt[]) => {
    const newCurves: GradeCurves = { ...curves, [channel]: next };
    useEditor.getState().updateClipProps(clip.id, { curves: newCurves });
  };

  const toLocal = (e: React.PointerEvent): CurvePt => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    return [x, y];
  };

  // build smooth path
  const path = (() => {
    let d = "";
    for (let i = 0; i <= 64; i++) {
      const x = i / 64;
      const y = sampleCurve(pts, x);
      d += `${i === 0 ? "M" : "L"} ${(x * size).toFixed(1)} ${((1 - y) * size).toFixed(1)} `;
    }
    return d;
  })();
  const identityPath = `M 0 ${size} L ${size} 0`;

  const onPointerDown = (e: React.PointerEvent, idx: number) => {
    begin();
    setActiveIdx(idx);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (activeIdx === null) return;
    const [x, y] = toLocal(e);
    const p: CurvePt = activeIdx === 0
      ? [0, y]
      : activeIdx === pts.length - 1
        ? [1, y]
        : [Math.min(pts[activeIdx + 1][0] - 0.005, Math.max(pts[activeIdx - 1][0] + 0.005, x)), y];
    const next = pts.map((pt, i) => (i === activeIdx ? p : pt));
    setPoints(next);
  };
  const stopDrag = () => {
    setActiveIdx(null);
  };

  const onSvgDoubleClick = (e: React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = Math.min(0.98, Math.max(0.02, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    if (pts.length >= 24) {
      toast.info("เพิ่มจุดควบคุมได้สูงสุด 24 จุดต่อช่องสี");
      return;
    }
    const sorted = [...pts].sort((a, b) => a[0] - b[0]);
    const insertionIndex = sorted.findIndex((point) => point[0] > x);
    const index = insertionIndex < 0 ? sorted.length : insertionIndex;
    const minX = index > 0 ? sorted[index - 1][0] + 0.005 : 0.005;
    const maxX = index < sorted.length ? sorted[index][0] - 0.005 : 0.995;
    if (minX > maxX) return;
    const point: CurvePt = [Math.min(maxX, Math.max(minX, x)), y];
    sorted.splice(index, 0, point);
    begin();
    setPoints(sorted);
    setActiveIdx(index);
  };

  const chColor = channel === "r" ? "#ff5555" : channel === "g" ? "#4ade80" : channel === "b" ? "#60a5fa" : "#f0f0f0";
  const isIdentity = !curves[channel] && channel !== "master";

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        {(
          [
            ["master", "RGB"],
            ["r", "R"],
            ["g", "G"],
            ["b", "B"],
          ] as const
        ).map(([ch, label]) => (
          <Button
            key={ch}
            size="sm"
            variant={channel === ch ? "secondary" : "ghost"}
            className={`h-6 flex-1 px-0 text-[10px] font-semibold ${
              channel === ch
                ? ch === "r"
                  ? "bg-red-500/30 text-red-200"
                  : ch === "g"
                    ? "bg-green-500/30 text-green-200"
                    : ch === "b"
                      ? "bg-blue-500/30 text-blue-200"
                      : "bg-zinc-500/30 text-zinc-100"
                : "text-zinc-400 hover:bg-white/10"
            }`}
            onClick={() => setChannel(ch)}
          >
            {label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 px-0 text-zinc-500 hover:text-zinc-200"
          title="รีเซ็ตช่องนี้"
          onClick={() => {
            begin();
            const newCurves = { ...curves };
            delete newCurves[channel];
            const hasAny = Object.keys(newCurves).some((k) => newCurves[k as CurveChannel]);
            useEditor.getState().updateClipProps(clip.id, { curves: hasAny ? newCurves : null });
          }}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>
      <div className="rounded-md border border-white/[0.07] bg-black/40 p-1.5">
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${size} ${size}`}
          className="touch-none select-none"
          onDoubleClick={onSvgDoubleClick}
          onPointerMove={onPointerMove}
          onPointerUp={stopDrag}
          onPointerLeave={stopDrag}
        >
          <defs>
            <linearGradient id="cvbg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1a1a22" />
              <stop offset="1" stopColor="#101018" />
            </linearGradient>
          </defs>
          <rect width={size} height={size} rx="6" fill="url(#cvbg)" />
          {[1, 2, 3].map((i) => (
            <line key={`v${i}`} x1={(size / 4) * i} y1="0" x2={(size / 4) * i} y2={size} stroke="rgba(255,255,255,0.06)" />
          ))}
          {[1, 2, 3].map((i) => (
            <line key={`h${i}`} x1="0" y1={(size / 4) * i} x2={size} y2={(size / 4) * i} stroke="rgba(255,255,255,0.06)" />
          ))}
          <line x1="0" y1={size} x2={size} y2="0" stroke="rgba(255,255,255,0.14)" strokeDasharray="4 4" />
          <path d={identityPath} fill="none" stroke="rgba(255,255,255,0.14)" strokeDasharray="4 4" />
          <path
            d={path}
            fill="none"
            stroke={chColor}
            strokeWidth="2"
            strokeLinecap="round"
            opacity={isIdentity ? 0.9 : 1}
          />
          {pts.map((pt, i) => (
            <circle
              key={i}
              cx={pt[0] * size}
              cy={(1 - pt[1]) * size}
              r={activeIdx === i ? 7 : 5.5}
              fill={chColor}
              stroke="#fff"
              strokeWidth="1.5"
              className="cursor-grab"
              onPointerDown={(e) => onPointerDown(e, i)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (i > 0 && i < pts.length - 1) {
                  begin();
                  setPoints(pts.filter((_, j) => j !== i));
                  setActiveIdx(null);
                }
              }}
            />
          ))}
        </svg>
      </div>
      {activeIdx !== null && pts[activeIdx] && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Row label="ตำแหน่ง X" value={pts[activeIdx][0].toFixed(3)}>
            <Slider
              value={[pts[activeIdx][0]]}
              min={activeIdx === 0 ? 0 : pts[activeIdx - 1][0] + 0.005}
              max={activeIdx === pts.length - 1 ? 1 : pts[activeIdx + 1][0] - 0.005}
              step={0.005}
              disabled={activeIdx === 0 || activeIdx === pts.length - 1}
              onPointerDown={begin}
              onValueChange={([x]) => {
                const next = [...pts];
                next[activeIdx] = [x, next[activeIdx][1]];
                setPoints(next);
              }}
            />
          </Row>
          <Row label="ตำแหน่ง Y" value={pts[activeIdx][1].toFixed(3)}>
            <Slider
              value={[pts[activeIdx][1]]}
              min={0}
              max={1}
              step={0.005}
              onPointerDown={begin}
              onValueChange={([y]) => {
                const next = [...pts];
                next[activeIdx] = [next[activeIdx][0], y];
                setPoints(next);
              }}
            />
          </Row>
        </div>
      )}
      <p className="mt-1.5 text-[9px] leading-relaxed text-zinc-500">
        ลากจุดหรือใช้ X/Y เพื่อปรับละเอียด · ดับเบิลคลิกเพิ่มจุด · คลิกขวาที่จุดกลางเพื่อลบ
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Looks panel
// ---------------------------------------------------------------------------

function LooksPanel({ clip, mediaItem }: { clip: Clip; mediaItem?: { id: string; thumbnail?: string; name: string } }) {
  const [userLooks, setUserLooks] = useState(() => (typeof window === "undefined" ? [] : loadUserLooks()));

  const apply = (params: Partial<ClipProps>, name: string) => {
    useEditor.getState().pushHistory();
    useEditor.getState().updateClipProps(clip.id, { ...NEUTRAL_GRADE, ...params });
    toast.success(`ใส่ลุคส์ "${name}" แล้ว`);
  };

  const applyToAll = (params: Partial<ClipProps>, name: string) => {
    const s = useEditor.getState();
    const ids = s.clips.filter((c) => c.kind === "media").map((c) => c.id);
    if (ids.length === 0) {
      toast.info("ไม่มีคลิปสื่อบนไทม์ไลน์");
      return;
    }
    s.pushHistory();
    s.updateClipsProps(ids, { ...NEUTRAL_GRADE, ...params });
    toast.success(`ใส่ลุคส์ "${name}" กับ ${ids.length} คลิปแล้ว`);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-500">
          {mediaItem ? `พรีวิวจาก: ${mediaItem.name.slice(0, 18)}` : "เลือกลุคส์สำเร็จรูป"}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-[10px] text-zinc-400 hover:bg-white/10"
          title="บันทึกเกรดปัจจุบันของคลิปนี้เป็นลุคส์"
          onClick={() => {
            const name = prompt("ตั้งชื่อลุคส์ของคุณ", "ลุคส์ของฉัน");
            if (name && name.trim()) {
              const params: Record<string, unknown> = {};
              for (const k of ["brightness", "contrast", "saturation", "hue", "grayscale", "sepia", "liftM", "liftR", "liftG", "liftB", "gammaM", "gammaR", "gammaG", "gammaB", "gainM", "gainR", "gainG", "gainB", "temp", "tint", "highlights", "shadows", "fade", "vignette", "grain", "sharpen"]) {
                params[k] = clip.props[k as keyof ClipProps];
              }
              params.curves = clip.props.curves ? structuredClone(clip.props.curves) : null;
              setUserLooks(addUserLook(name.trim(), params as Partial<ClipProps>));
              toast.success(`บันทึกลุคส์ "${name.trim()}" แล้ว`);
            }
          }}
        >
          <Save className="h-3 w-3" /> บันทึกลุคส์นี้
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {LOOKS.map((look) => (
          <LookTile
            key={look.id}
            name={look.name}
            css={look.css}
            params={look.params}
            thumb={mediaItem?.thumbnail}
            cacheKey={mediaItem ? `${mediaItem.id}:${look.id}` : undefined}
            onClick={() => apply(look.params, look.name)}
            onApplyAll={look.id !== "original" ? () => applyToAll(look.params, look.name) : undefined}
          />
        ))}
        {userLooks.map((ul) => (
          <LookTile
            key={ul.id}
            name={ul.name}
            css=""
            params={ul.params}
            thumb={mediaItem?.thumbnail}
            cacheKey={mediaItem ? `${mediaItem.id}:${ul.id}` : undefined}
            onClick={() => apply(ul.params, ul.name)}
            onApplyAll={() => applyToAll(ul.params, ul.name)}
            onDelete={() => setUserLooks(removeUserLook(ul.id))}
          />
        ))}
      </div>
    </div>
  );
}

const LookTile = memo(function LookTile({
  name,
  css,
  params,
  thumb,
  cacheKey,
  onClick,
  onApplyAll,
  onDelete,
}: {
  name: string;
  css: string;
  params: Partial<ClipProps>;
  thumb?: string;
  cacheKey?: string;
  onClick: () => void;
  onApplyAll?: () => void;
  onDelete?: () => void;
}) {
  const [rendered, setRendered] = useState<{ key: string; url: string } | null>(null);
  const url = rendered && rendered.key === (cacheKey ?? "") ? rendered.url : null;

  useEffect(() => {
    let alive = true;
    if (!thumb || !grader.available || !cacheKey) return;
    const img = new Image();
    img.src = thumb;
    img
      .decode()
      .then(() => {
        if (!alive) return;
        const data = grader.renderPreview(img, params, 96, 54, cacheKey);
        if (data) setRendered({ key: cacheKey, url: data });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [thumb, cacheKey, params]);

  return (
    <div className="group relative">
      <button
        className="w-full overflow-hidden rounded-md border border-white/[0.08] bg-black/40 transition hover:border-fuchsia-400/70"
        onClick={onClick}
        title={`ใส่ลุคส์ ${name}${onApplyAll ? " · คลิกขวา = ใส่ทุกคลิป" : ""}`}
        onContextMenu={(e) => {
          if (onApplyAll) {
            e.preventDefault();
            onApplyAll();
          }
        }}
      >
        <div className="flex h-[54px] w-full items-center justify-center overflow-hidden">
          {thumb ? (
            <img
              src={url ?? thumb}
              alt={name}
              className="h-full w-full object-cover"
              style={url ? undefined : { filter: css || undefined }}
            />
          ) : (
            <Wand2 className="h-4 w-4 text-zinc-600" />
          )}
        </div>
        <div className="truncate px-1 py-0.5 text-center text-[9px] font-medium text-zinc-300">
          {name}
        </div>
      </button>
      {onDelete && (
        <button
          className="absolute right-0.5 top-0.5 hidden rounded bg-black/70 p-0.5 text-rose-300 hover:text-rose-200 group-hover:block"
          title="ลบลุคส์นี้"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

function AudioSection({ clip }: { clip: Clip }) {
  const p = clip.props;
  const set = (patch: Partial<ClipProps>) => useEditor.getState().updateClipProps(clip.id, patch);
  return (
    <Panel
      title="เสียง"
      icon={<Volume2 className="h-3.5 w-3.5 text-emerald-400" />}
      onReset={() => set({ volume: 1, muted: false, fadeIn: 0, fadeOut: 0 })}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-400">ปิดเสียงคลิปนี้</span>
        <Switch checked={p.muted} onCheckedChange={(v) => set({ muted: v })} />
      </div>
      <Row label="ระดับเสียง" value={`${Math.round(p.volume * 100)}%`}>
        <Slider
          value={[p.volume]}
          min={0}
          max={2}
          step={0.01}
          onValueChange={([v]) => set({ volume: v })}
          disabled={p.muted}
        />
      </Row>
      <Row label="เฟดเข้า" value={`${p.fadeIn.toFixed(1)}s`}>
        <Slider value={[p.fadeIn]} min={0} max={5} step={0.1} onValueChange={([v]) => set({ fadeIn: v })} />
      </Row>
      <Row label="เฟดออก" value={`${p.fadeOut.toFixed(1)}s`}>
        <Slider value={[p.fadeOut]} min={0} max={5} step={0.1} onValueChange={([v]) => set({ fadeOut: v })} />
      </Row>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function TextSection({ clip }: { clip: Clip }) {
  const p = clip.props;
  const media = useEditor((s) => s.media);
  const fonts = media.filter((item) => item.type === "font");
  const set = (patch: Partial<ClipProps>) => useEditor.getState().updateClipProps(clip.id, patch);
  return (
    <Panel
      title="ข้อความ"
      icon={<TypeIcon className="h-3.5 w-3.5 text-amber-400" />}
      onReset={() => set({ fontSize: 56, fontFamily: "", color: "#ffffff", fontWeight: 700, textBg: 0, stroke: true })}
    >
      <textarea
        value={p.text}
        onChange={(e) => set({ text: e.target.value })}
        rows={3}
        className="w-full resize-none rounded-md border border-white/10 bg-white/[0.05] p-2 text-xs text-zinc-100 outline-none focus:border-fuchsia-400/60"
        placeholder="พิมพ์ข้อความที่นี่…"
      />
      <Row label="ฟอนต์">
        <Select
          value={p.fontFamily || "default"}
          onValueChange={(value) => set({ fontFamily: value === "default" ? "" : value })}
        >
          <SelectTrigger className="h-7 border-white/10 bg-white/[0.05] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">ค่าเริ่มต้น</SelectItem>
            {fonts.map((font) => (
              <SelectItem key={font.id} value={font.id}>{font.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="ขนาด" value={`${p.fontSize}px`}>
        <Slider value={[p.fontSize]} min={16} max={180} step={1} onValueChange={([v]) => set({ fontSize: v })} />
      </Row>
      <Row label="น้ำหนักฟอนต์">
        <Select
          value={String(p.fontWeight)}
          onValueChange={(v) => set({ fontWeight: Number(v) })}
        >
          <SelectTrigger className="h-7 border-white/10 bg-white/[0.05] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="400">ปกติ</SelectItem>
            <SelectItem value="600">กึ่งหนา</SelectItem>
            <SelectItem value="700">หนา</SelectItem>
            <SelectItem value="800">หนามาก</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="สีข้อความ">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={p.color}
            onChange={(e) => set({ color: e.target.value })}
            className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-white/[0.05]"
            aria-label="เลือกสีข้อความ"
          />
          <div className="flex gap-1">
            {["#ffffff", "#facc15", "#f87171", "#4ade80", "#e879f9", "#000000"].map((c) => (
              <button
                key={c}
                className="h-6 w-6 rounded-full border border-zinc-600"
                style={{ background: c }}
                onClick={() => set({ color: c })}
                aria-label={`สี ${c}`}
              />
            ))}
          </div>
        </div>
      </Row>
      <Row label="ตำแหน่งจัด">
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((a) => (
            <Button
              key={a}
              size="sm"
              variant={p.align === a ? "secondary" : "ghost"}
              className={`h-6 flex-1 px-0 text-[10px] ${p.align === a ? "bg-violet-600/40 text-violet-100" : "text-zinc-400 hover:bg-white/10"}`}
              onClick={() => set({ align: a })}
            >
              {a === "left" ? "ซ้าย" : a === "center" ? "กลาง" : "ขวา"}
            </Button>
          ))}
        </div>
      </Row>
      <Row label="แถบพื้นหลัง" value={`${Math.round(p.textBg * 100)}%`}>
        <Slider value={[p.textBg]} min={0} max={1} step={0.05} onValueChange={([v]) => set({ textBg: v })} />
      </Row>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-400">ขอบตัวอักษร</span>
        <Switch checked={p.stroke} onCheckedChange={(v) => set({ stroke: v })} />
      </div>
      <Row label="ตำแหน่ง Y" value={p.y.toFixed(2)}>
        <Slider value={[p.y]} min={-1} max={1} step={0.01} onValueChange={([v]) => set({ y: v })} />
      </Row>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Project panel (no selection)
// ---------------------------------------------------------------------------

function ProjectPanel({ aspect }: { aspect: AspectRatio }) {
  return (
    <ScrollArea className="h-full">
      <div className="p-3">
        <section className="mb-4">
          <h3 className="mb-2.5 text-xs font-semibold text-zinc-200">ตั้งค่าโปรเจกต์</h3>
          <Row label="สัดส่วนภาพ">
            <Select value={aspect} onValueChange={(v) => useEditor.getState().setAspect(v as AspectRatio)}>
              <SelectTrigger className="h-8 border-white/10 bg-white/[0.05] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="16:9">16:9 — ยูทูบ</SelectItem>
                <SelectItem value="9:16">9:16 — ติ๊กต็อก/รีลส์</SelectItem>
                <SelectItem value="1:1">1:1 — สี่เหลี่ยม</SelectItem>
                <SelectItem value="4:5">4:5 — โพสต์ฟีด</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Separator className="mt-4 bg-white/[0.06]" />
        </section>

        <section className="mb-4 space-y-2">
          <details className="group rounded-lg border border-white/[0.07] bg-white/[0.02]">
            <summary className="cursor-pointer list-none px-2.5 py-2.5 text-xs font-semibold text-zinc-200 marker:hidden">
              <span className="flex items-center justify-between">
                วิธีใช้งานเร็ว ๆ
                <span className="text-zinc-500 transition-transform group-open:rotate-180">⌄</span>
              </span>
            </summary>
            <ul className="space-y-1.5 px-2.5 pb-3 text-[11px] leading-relaxed text-zinc-400">
              <li>1. นำเข้าวิดีโอ/เสียง/รูป/ฟอนต์ ที่แท็บ &ldquo;สื่อ&rdquo; หรือลากไฟล์มาวาง</li>
              <li>2. ลากสื่อจากคลังลงไทม์ไลน์ หรือกด &ldquo;+ ไทม์ไลน์&rdquo;</li>
              <li>3. ลากขอบซ้าย-ขวาของคลิปเพื่อตัดสั้น/ยาว</li>
              <li>4. วางเคอร์เซอร์แล้วกด &ldquo;แบ่ง&rdquo; (S) เพื่อตัดคลิป</li>
              <li>5. คลิกขวาที่คลิป = เมนูคำสั่งเต็มรูปแบบ</li>
              <li>6. เกรดสีมืออาชีพที่แท็บ &ldquo;เกรดสี&rdquo; — วีลสี เส้นโค้ง ลุคส์</li>
              <li>7. กด &ldquo;ส่งออกวิดีโอ&rdquo; ด้านบนเมื่อตัดต่อเสร็จ</li>
            </ul>
          </details>

          <details className="group rounded-lg border border-white/[0.07] bg-white/[0.02]">
            <summary className="cursor-pointer list-none px-2.5 py-2.5 text-xs font-semibold text-zinc-200 marker:hidden">
              <span className="flex items-center justify-between">
                คีย์ลัด
                <span className="text-zinc-500 transition-transform group-open:rotate-180">⌄</span>
              </span>
            </summary>
            <div className="space-y-1.5 px-2.5 pb-3">
              {[
                ["Space", "เล่น / หยุด"],
                ["S", "แบ่งคลิปที่เคอร์เซอร์"],
                ["Delete", "ลบคลิปที่เลือก"],
                ["Ctrl + C / X / V", "คัดลอก / ตัด / วางคลิป"],
                ["Ctrl + Z / Y", "ย้อน / ทำซ้ำ"],
                ["Ctrl + D", "ทำสำเนาคลิป"],
                ["Ctrl + A", "เลือกทุกคลิป"],
                ["B", "เทียบเกรดสีก่อน/หลัง"],
                ["F", "ซูมไทม์ไลน์พอดีจอ"],
                ["Alt + ลาก", "ทำสำเนาแล้วลาก"],
                ["Ctrl + คลิก", "เลือกหลายคลิป"],
                ["← / →", "เลื่อน 1 เฟรม (Shift = 1 วิ)"],
                ["+ / -", "ซูมไทม์ไลน์"],
                ["Ctrl + ล้อเมาส์", "ซูมไทม์ไลน์นุ่มนวล"],
                ["Home / End", "ไปต้น / ท้าย"],
                ["Esc", "ยกเลิกการเลือก"],
              ].map(([k, d]) => (
                <div key={k} className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">{d}</span>
                  <kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                    {k}
                  </kbd>
                </div>
              ))}
            </div>
          </details>
        </section>

        <button
          className="mt-4 w-full rounded-md border border-white/[0.07] bg-white/[0.03] p-2 text-[11px] text-zinc-400 hover:bg-white/[0.07]"
          onClick={() => {
            if (confirm("ล้างโปรเจกต์ทั้งหมด? (สื่อและคลิปทั้งหมดจะถูกลบ)")) {
              useEditor.getState().clearProject();
              toast.info("ล้างโปรเจกต์แล้ว");
            }
          }}
        >
          ล้างโปรเจกต์ทั้งหมด
        </button>
      </div>
    </ScrollArea>
  );
}
