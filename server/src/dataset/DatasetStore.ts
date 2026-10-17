import fs from 'node:fs';
import path from 'node:path';

export interface DatasetFrameRecord {
  /** JPEG bytes, base64 without the data URL prefix. */
  image: string;
  width: number;
  height: number;
  annotations: Array<{ label: string; bbox: [number, number, number, number]; confidence: number }>;
  drone: { pos: [number, number, number]; vel: [number, number, number]; headingDeg: number; agl: number };
  mapId: string;
  serverTime: number;
}

export interface DatasetSessionMeta {
  id: string;
  createdAt: number;
  pilot: string;
  mapId: string;
  frames: number;
}

const ROOT = path.resolve(process.env.DATASET_DIR || path.join(process.cwd(), 'data', 'dataset'));

/**
 * Stores recorded flights as frames plus a JSONL label sidecar so a Kaggle
 * notebook can fine-tune a detector on real simulator renders instead of
 * synthetic scenes. Sessions are append-only and cheap to pull back down.
 */
export class DatasetStore {
  constructor() {
    fs.mkdirSync(ROOT, { recursive: true });
  }

  public createSession(pilot: string, mapId: string): DatasetSessionMeta {
    const id = `ds-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    fs.mkdirSync(path.join(ROOT, id, 'frames'), { recursive: true });
    const meta: DatasetSessionMeta = { id, createdAt: Date.now(), pilot, mapId, frames: 0 };
    fs.writeFileSync(metaPath(id), JSON.stringify(meta, null, 2));
    fs.writeFileSync(path.join(ROOT, id, 'labels.jsonl'), '');
    return meta;
  }

  public append(id: string, frames: DatasetFrameRecord[]): { accepted: number; total: number } {
    const dir = path.join(ROOT, id);
    if (!fs.existsSync(dir)) throw new Error(`unknown dataset session ${id}`);
    const labels = path.join(dir, 'labels.jsonl');
    const meta = this.readMeta(id);
    let accepted = 0;
    const lines: string[] = [];
    for (const f of frames) {
      const file = `${String(meta.frames + accepted).padStart(6, '0')}.jpg`;
      const bytes = Buffer.from(f.image.startsWith('data:') ? f.image.split(',')[1] : f.image, 'base64');
      if (bytes.length === 0 || bytes.length > 4 * 1024 * 1024) continue;
      fs.writeFileSync(path.join(dir, 'frames', file), bytes);
      lines.push(JSON.stringify({
        frame: file,
        width: f.width,
        height: f.height,
        annotations: f.annotations,
        drone: f.drone,
        mapId: f.mapId,
        serverTime: f.serverTime,
      }));
      accepted++;
    }
    if (lines.length) fs.appendFileSync(labels, lines.join('\n') + '\n');
    if (accepted) {
      meta.frames += accepted;
      fs.writeFileSync(metaPath(id), JSON.stringify(meta, null, 2));
    }
    return { accepted, total: meta.frames };
  }

  public list(): DatasetSessionMeta[] {
    if (!fs.existsSync(ROOT)) return [];
    const out: DatasetSessionMeta[] = [];
    for (const entry of fs.readdirSync(ROOT)) {
      const file = metaPath(entry);
      if (!fs.existsSync(file)) continue;
      try {
        out.push(JSON.parse(fs.readFileSync(file, 'utf-8')) as DatasetSessionMeta);
      } catch {
        // a half-written session directory is skipped rather than breaking the list
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  public labels(id: string): string {
    const file = path.join(path.join(ROOT, id), 'labels.jsonl');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  }

  public frameFile(id: string, name: string): string | null {
    // Only ever serve files that live in this session's own frames directory.
    const safe = path.basename(name);
    const file = path.join(ROOT, id, 'frames', safe);
    return fs.existsSync(file) ? file : null;
  }

  public remove(id: string): boolean {
    const dir = path.join(ROOT, id);
    if (!fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }

  private readMeta(id: string): DatasetSessionMeta {
    const file = metaPath(id);
    if (!fs.existsSync(file)) throw new Error(`unknown dataset session ${id}`);
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as DatasetSessionMeta;
  }
}

function metaPath(id: string): string {
  return path.join(ROOT, id, 'session.json');
}
