import fs from 'fs';
import path from 'path';
import { REALTIME } from 'drone-autonomy-shared';

export interface ReplayFrame {
  t: number;
  drone: unknown;
  mission: unknown;
  targets: unknown[];
}

export interface ReplayMeta {
  id: string;
  startedAt: number;
  endedAt: number;
  mapId: string;
  mission: string;
  frameCount: number;
}

const REPLAY_DIR = path.resolve(process.env.REPLAY_DIR || path.join(process.cwd(), 'data', 'replays'));

/** Records authoritative world snapshots while a mission runs and persists finished missions as JSON replays. */
export class ReplayStore {
  private frames: ReplayFrame[] = [];
  private current: ReplayMeta | null = null;
  private lastRecordMs = 0;
  private cache: Map<string, unknown> = new Map();

  start(mapId: string, missionSummary: unknown): void {
    this.frames = [];
    this.current = {
      id: `${Date.now().toString(36)}-${mapId}`,
      startedAt: Date.now(),
      endedAt: 0,
      mapId,
      mission: JSON.stringify(missionSummary),
      frameCount: 0,
    };
    this.lastRecordMs = 0;
  }

  record(nowMs: number, drone: unknown, mission: unknown, targets: unknown[]): void {
    if (!this.current) return;
    const interval = 1000 / REALTIME.replayTickHz;
    if (nowMs - this.lastRecordMs < interval) return;
    this.lastRecordMs = nowMs;
    this.frames.push({ t: nowMs - this.current.startedAt, drone, mission, targets });
  }

  isRecording(): boolean {
    return this.current !== null;
  }

  end(): ReplayMeta | null {
    if (!this.current || this.frames.length === 0) {
      this.current = null;
      this.frames = [];
      return null;
    }
    this.current.endedAt = Date.now();
    this.current.frameCount = this.frames.length;
    fs.mkdirSync(REPLAY_DIR, { recursive: true });
    const file = path.join(REPLAY_DIR, `${this.current.id}.json`);
    fs.writeFileSync(file, JSON.stringify({ meta: this.current, frames: this.frames }));
    const meta = this.current;
    this.current = null;
    this.frames = [];
    this.cache.clear();
    console.log(`[Replay] Saved ${meta.frameCount} frames → ${file}`);
    return meta;
  }

  list(): ReplayMeta[] {
    if (!fs.existsSync(REPLAY_DIR)) return [];
    const out: ReplayMeta[] = [];
    for (const f of fs.readdirSync(REPLAY_DIR)) {
      if (!f.endsWith('.json')) continue;
      try {
        const data = this.load(f.replace(/\.json$/, ''));
        out.push((data as { meta: ReplayMeta }).meta);
      } catch {
        // ignore corrupt files
      }
    }
    out.sort((a, b) => b.startedAt - a.startedAt);
    return out;
  }

  load(id: string): unknown {
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
    const cached = this.cache.get(safe);
    if (cached) return cached;
    const file = path.join(REPLAY_DIR, `${safe}.json`);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    this.cache.set(safe, data);
    return data;
  }
}
