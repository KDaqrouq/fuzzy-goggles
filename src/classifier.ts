import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { PHRASES, phraseLabel, type PhraseIndex } from './phrases';

export type Prediction = {
  index: PhraseIndex;
  caption: string;
  confidence: number;
};

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Tip farther from wrist than PIP → finger reads as extended (rotation-invariant-ish). */
function fingerExtended(
  wrist: NormalizedLandmark,
  tip: NormalizedLandmark,
  pip: NormalizedLandmark,
): boolean {
  return dist(wrist, tip) > dist(wrist, pip) * 1.06;
}

function thumbExtendedLike(
  wrist: NormalizedLandmark,
  thumbTip: NormalizedLandmark,
  thumbIp: NormalizedLandmark,
  thumbMcp: NormalizedLandmark,
): boolean {
  return dist(wrist, thumbTip) > dist(wrist, thumbIp) * 1.04 && dist(wrist, thumbTip) > dist(wrist, thumbMcp) * 1.15;
}

/** Index tip near thumb tip → pinch / “bless you” style hold. */
function indexThumbPinch(
  thumbTip: NormalizedLandmark,
  indexTip: NormalizedLandmark,
): boolean {
  return dist(thumbTip, indexTip) < 0.09;
}

/**
 * Maps a single-frame hand pose to one of nine phrases using simple geometry.
 * Intended for hackathon MVP: a known signer can rehearse finger-count / thumb cues.
 * For stable real demos, pair with mock mode or replace with a trained model.
 */
export function classifyLandmarks(landmarks: NormalizedLandmark[]): Prediction {
  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const thumbMcp = landmarks[2];
  const indexTip = landmarks[8];
  const indexPip = landmarks[6];
  const middleTip = landmarks[12];
  const middlePip = landmarks[10];
  const ringTip = landmarks[16];
  const ringPip = landmarks[14];
  const pinkyTip = landmarks[20];
  const pinkyPip = landmarks[18];

  const extIndex = fingerExtended(wrist, indexTip, indexPip);
  const extMiddle = fingerExtended(wrist, middleTip, middlePip);
  const extRing = fingerExtended(wrist, ringTip, ringPip);
  const extPinky = fingerExtended(wrist, pinkyTip, pinkyPip);
  const extThumb = thumbExtendedLike(wrist, thumbTip, thumbIp, thumbMcp);

  const n = [extIndex, extMiddle, extRing, extPinky].filter(Boolean).length;
  const pinch = indexThumbPinch(thumbTip, indexTip);

  if (pinch && n <= 1) {
    return { index: 6, caption: PHRASES[6], confidence: 0.78 };
  }

  if (extThumb && n === 0) {
    return { index: 7, caption: PHRASES[7], confidence: 0.84 };
  }

  if (n === 4 && extThumb) {
    return { index: 5, caption: PHRASES[5], confidence: 0.82 };
  }

  if (n === 4 && !extThumb) {
    return { index: 3, caption: PHRASES[3], confidence: 0.72 };
  }

  if (!extThumb && n === 0) {
    const spread =
      (dist(wrist, indexTip) + dist(wrist, middleTip) + dist(wrist, ringTip) + dist(wrist, pinkyTip)) / 4;
    if (spread < 0.24) {
      return { index: 8, caption: PHRASES[8], confidence: 0.76 };
    }
    if (spread < 0.36) {
      return { index: 4, caption: PHRASES[4], confidence: 0.64 };
    }
    return { index: 8, caption: PHRASES[8], confidence: 0.58 };
  }

  if (!extThumb && n === 1 && extIndex) {
    return { index: 0, caption: PHRASES[0], confidence: 0.76 };
  }

  if (!extThumb && n === 2 && extIndex && extMiddle) {
    return { index: 1, caption: PHRASES[1], confidence: 0.72 };
  }

  if (!extThumb && n === 3 && extIndex && extMiddle && extRing) {
    return { index: 2, caption: PHRASES[2], confidence: 0.7 };
  }

  const bestGuess = n >= 3 ? 2 : n === 2 ? 1 : n === 1 ? 0 : 8;
  return {
    index: bestGuess as PhraseIndex,
    caption: PHRASES[bestGuess as PhraseIndex],
    confidence: 0.35,
  };
}

export function mockPredict(frameTick: number): Prediction {
  const index = (frameTick % 9) as PhraseIndex;
  return { index, caption: PHRASES[index], confidence: 0.93 };
}

export function formatPredictionForUi(p: Prediction): string {
  return `${phraseLabel(p.index)} · ${Math.round(p.confidence * 100)}%`;
}
