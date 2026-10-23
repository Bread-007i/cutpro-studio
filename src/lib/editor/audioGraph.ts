// Shared AudioContext graph: routes per-clip media elements through gain nodes
// so we can control volume precisely (incl. fades) and capture a mixed stream for export.

class AudioGraph {
  private ctx: AudioContext | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private nodes = new Map<string, { src: MediaElementAudioSourceNode; gain: GainNode }>();

  get context(): AudioContext | null {
    return this.ctx;
  }

  ensure(key: string, el: HTMLMediaElement) {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      if (el instanceof HTMLImageElement) return;
      if (this.nodes.has(key)) return;
      const src = this.ctx.createMediaElementSource(el);
      const gain = this.ctx.createGain();
      gain.gain.value = 1;
      src.connect(gain);
      gain.connect(this.ctx.destination);
      if (this.dest) gain.connect(this.dest);
      this.nodes.set(key, { src, gain });
    } catch {
      // WebAudio unavailable — fallback to element volume handled by caller
    }
  }

  setGain(key: string, v: number) {
    const n = this.nodes.get(key);
    if (n) {
      try {
        n.gain.gain.value = v;
      } catch {
        /* noop */
      }
    }
  }

  drop(key: string) {
    const n = this.nodes.get(key);
    if (n) {
      try {
        n.src.disconnect();
        n.gain.disconnect();
      } catch {
        /* noop */
      }
      this.nodes.delete(key);
    }
  }

  /** Mixed audio stream for MediaRecorder export (null if no context yet) */
  stream(): MediaStream | null {
    if (!this.ctx) return null;
    try {
      if (!this.dest) {
        this.dest = this.ctx.createMediaStreamDestination();
        for (const { gain } of this.nodes.values()) gain.connect(this.dest);
      }
      return this.dest.stream;
    } catch {
      return null;
    }
  }
}

export const audioGraph = new AudioGraph();
