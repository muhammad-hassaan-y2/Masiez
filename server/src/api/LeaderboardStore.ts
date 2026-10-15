import fs from 'fs';
import path from 'path';

export interface LeaderboardEntry {
  id: string;
  startedAt: number;
  endedAt: number;
  mapId: string;
  score: number;
  targetsHit: number;
  totalTargets: number;
  dronesRemaining: number;
  totalDrones: number;
  status: string;
  durationSec: number;
  pilot: string;
  autonomy: string;
}

const STORE_FILE = path.resolve(process.env.LEADERBOARD_FILE || path.join(process.cwd(), 'data', 'leaderboard.json'));

/** Persistent strike-mission leaderboard fed by finished replays and CV Arena submissions. */
export class LeaderboardStore {
  private entries: LeaderboardEntry[] = [];
  private dirty = false;

  constructor() {
    if (fs.existsSync(STORE_FILE)) {
      try {
        this.entries = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
      } catch {
        this.entries = [];
      }
    }
    // flush every 10s if changed
    setInterval(() => this.flush(), 10_000).unref?.();
  }

  record(metaLike: {
    id: string;
    startedAt: number;
    endedAt: number;
    mapId: string;
    mission: string;
    frameCount?: number;
    pilot?: string;
    autonomy?: string;
  }): LeaderboardEntry {
    let mission: any = {};
    try {
      mission = JSON.parse(metaLike.mission);
    } catch {
      mission = {};
    }
    const entry: LeaderboardEntry = {
      id: metaLike.id,
      startedAt: metaLike.startedAt,
      endedAt: metaLike.endedAt,
      mapId: metaLike.mapId,
      score: Number(mission.score) || 0,
      targetsHit: Number(mission.targetsHit) || 0,
      totalTargets: Number(mission.totalTargets) || 0,
      dronesRemaining: Number(mission.dronesRemaining) || 0,
      totalDrones: Number(mission.totalDrones) || 0,
      status: String(mission.missionStatus || 'UNKNOWN'),
      durationSec: Math.max(0, Math.round((metaLike.endedAt - metaLike.startedAt) / 1000)),
      pilot: metaLike.pilot || 'operator',
      autonomy: metaLike.autonomy || 'manual',
    };
    this.entries.push(entry);
    this.entries.sort((a, b) => b.score - a.score || a.durationSec - b.durationSec);
    if (this.entries.length > 200) this.entries.length = 200;
    this.dirty = true;
    return entry;
  }

  top(limit = 25): LeaderboardEntry[] {
    return this.entries.slice(0, limit);
  }

  flush(): void {
    if (!this.dirty) return;
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(this.entries, null, 2));
    this.dirty = false;
  }
}
