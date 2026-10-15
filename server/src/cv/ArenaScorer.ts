export interface ArenaDetection {
  label: string;
  bbox: [number, number, number, number]; // x, y, w, h in frame pixels
  confidence?: number;
}

export interface CvArenaCamera {
  yawDeg?: number;
  pitchDeg?: number;
  fovDeg?: number;
}

export interface CvArenaSubmission {
  frame: { width: number; height: number };
  detections: ArenaDetection[];
  camera?: CvArenaCamera;
  calibrate?: boolean;
  model?: string;
  pilot?: string;
  mapId?: string;
}

export interface GroundTruthItem {
  id: string;
  label: string;
  worldPos: [number, number, number];
  pixelBBox: [number, number, number, number];
}

export interface ArenaScore {
  matches: number;
  precision: number;
  recall: number;
  f1: number;
  meanIoU: number;
  matchScore: number;
}

function iou(a: [number, number, number, number], b: [number, number, number, number]): number {
  const ax2 = a[0] + a[2], ay2 = a[1] + a[3];
  const bx2 = b[0] + b[2], by2 = b[1] + b[3];
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

/** Greedy one-to-one matching (highest IoU first) of detections vs ground truth. */
export function scoreDetection(sub: CvArenaSubmission, groundTruth: GroundTruthItem[]): ArenaScore {
  const pairs: Array<{ d: number; g: number; iou: number }> = [];
  for (let di = 0; di < sub.detections.length; di++) {
    for (let gi = 0; gi < groundTruth.length; gi++) {
      const det = sub.detections[di];
      const gt = groundTruth[gi];
      if (det.label.trim().toLowerCase() !== gt.label.trim().toLowerCase()) continue;
      const v = iou(det.bbox, gt.pixelBBox);
      if (v >= 0.1) pairs.push({ d: di, g: gi, iou: v });
    }
  }
  pairs.sort((a, b) => b.iou - a.iou);

  const usedD = new Set<number>();
  const usedG = new Set<number>();
  let iouSum = 0;
  for (const p of pairs) {
    if (usedD.has(p.d) || usedG.has(p.g)) continue;
    usedD.add(p.d);
    usedG.add(p.g);
    iouSum += p.iou;
  }

  const matches = usedG.size;
  const precision = sub.detections.length > 0 ? matches / sub.detections.length : 0;
  const recall = groundTruth.length > 0 ? matches / groundTruth.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const meanIoU = matches > 0 ? iouSum / matches : 0;
  const matchScore = Math.round(f1 * 1000 + meanIoU * 200);

  return { matches, precision, recall, f1, meanIoU, matchScore };
}
