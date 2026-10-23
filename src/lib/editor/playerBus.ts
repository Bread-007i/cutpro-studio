// Bridge between panels and the PreviewPlayer engine

export interface ExportOptions {
  scale: number; // 1 = full, 0.75, 0.5
  fps: number;
  bitrate?: number; // bits per second (base, before scale)
}

export interface PlayerControls {
  exportVideo: (
    opts: ExportOptions,
    onProgress: (p: number) => void
  ) => Promise<Blob>;
  seekTo: (t: number) => void;
}

export const playerBus: {
  controls: PlayerControls | null;
  canvas: HTMLCanvasElement | null; // main preview canvas (for histogram/scopes)
} = {
  controls: null,
  canvas: null,
};
