import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';

const BUFFER_CAP = 6;

function averageLandmarks(frames: NormalizedLandmark[][]): NormalizedLandmark[] {
  const nPts = frames[0].length;
  const acc = Array.from({ length: nPts }, () => ({ x: 0, y: 0, z: 0 }));
  for (const frame of frames) {
    for (let i = 0; i < nPts; i++) {
      acc[i].x += frame[i].x;
      acc[i].y += frame[i].y;
      acc[i].z += frame[i].z ?? 0;
    }
  }
  const n = frames.length;
  return acc.map((p) => ({
    x: p.x / n,
    y: p.y / n,
    z: p.z / n,
  }));
}

export class HandPipeline {
  private landmarker: HandLandmarker | null = null;
  private buffer: NormalizedLandmark[][] = [];
  initError: string | null = null;

  async init(): Promise<void> {
    try {
      const wasmDir = chrome.runtime.getURL('wasm/');
      const fileset = await FilesetResolver.forVisionTasks(wasmDir);
      const modelUrl = chrome.runtime.getURL('wasm/hand_landmarker.task');
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: modelUrl,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        numHands: 1,
      });
    } catch (e) {
      this.initError = e instanceof Error ? e.message : String(e);
      this.landmarker = null;
    }
  }

  get ready(): boolean {
    return this.landmarker !== null;
  }

  /** Call from rAF while preview is running. */
  processFrame(video: HTMLVideoElement): void {
    if (!this.landmarker || video.readyState < 2) return;
    try {
      const result = this.landmarker.detect(video);
      const hand = result.landmarks[0];
      if (hand?.length === 21) {
        this.buffer.push(hand);
        if (this.buffer.length > BUFFER_CAP) this.buffer.shift();
      }
    } catch {
      /* frame skip */
    }
  }

  getAveragedLandmarks(): NormalizedLandmark[] | null {
    if (this.buffer.length === 0) return null;
    return averageLandmarks(this.buffer);
  }

  clearBuffer(): void {
    this.buffer = [];
  }
}
