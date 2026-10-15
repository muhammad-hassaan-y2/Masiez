import { Router } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { CONFIG } from '../config';
import { SIMULATION, CAMERA } from 'drone-autonomy-shared';
import type { SimEngine } from '../sim/SimEngine';
import type { ReplayStore } from '../sim/ReplayStore';
import type { LeaderboardStore } from '../api/LeaderboardStore';
import { scoreDetection, type CvArenaSubmission, type CvArenaCamera, type GroundTruthItem } from '../cv/ArenaScorer';

export function createRoutes(
  telemetryStore: any,
  droneCommands: any,
  droneState: any,
  geofence: any,
  simEngine: SimEngine,
  replayStore: ReplayStore,
  leaderboard: LeaderboardStore
) {
  const router = Router();

  // LiveKit Robotics Token Endpoint (OPTIONAL alternative transport)
  const generateLiveKitToken = async (req: any, res: any) => {
    try {
      const room = (req.query.room || req.body?.room || CONFIG.livekitRoom) as string;
      const identity = (req.query.identity || req.body?.identity || `participant-${Date.now().toString(36)}`) as string;
      const canPublish = req.query.canPublish !== 'false' && req.body?.canPublish !== false;
      const canSubscribe = req.query.canSubscribe !== 'false' && req.body?.canSubscribe !== false;
      const canPublishData = req.query.canPublishData !== 'false' && req.body?.canPublishData !== false;

      const at = new AccessToken(CONFIG.livekitApiKey, CONFIG.livekitApiSecret, {
        identity,
        ttl: '6h',
      });
      at.addGrant({
        roomJoin: true,
        room,
        canPublish,
        canSubscribe,
        canPublishData,
      });

      const token = await at.toJwt();
      res.json({ token, url: CONFIG.livekitUrl, room, identity });
    } catch (err: any) {
      console.error('[LiveKit] Failed to generate token:', err);
      res.status(500).json({ error: 'Failed to generate LiveKit token', details: err.message });
    }
  };

  router.get('/livekit/token', generateLiveKitToken);
  router.post('/livekit/token', generateLiveKitToken);

  router.get('/livekit/config', (req, res) => {
    res.json({ url: CONFIG.livekitUrl, room: CONFIG.livekitRoom, apiKey: CONFIG.livekitApiKey });
  });

  // --- Authoritative realtime world ---

  router.get('/world/state', (req, res) => {
    res.json({
      serverTime: Date.now(),
      drone: simEngine.droneState(),
      connected: simEngine.isConnected(),
      mission: simEngine.missionSummary(),
      targets: simEngine.targetsList(),
    });
  });

  router.put('/world/config', (req, res) => {
    const spawn = req.body?.spawn;
    if (!Array.isArray(spawn) || spawn.length !== 3 || !spawn.every((n: unknown) => typeof n === 'number')) {
      res.status(400).json({ error: 'spawn must be [x, y, z] numbers' });
      return;
    }
    if (typeof req.body?.mapId === 'string') process.env.MAP_ID = req.body.mapId;
    simEngine.configuredSpawn(
      spawn as [number, number, number],
      Number(req.body?.groundElevation) || 0,
      Number(req.body?.worldRadius) || undefined
    );
    res.json({ ok: true, drone: simEngine.droneState() });
  });

  router.get('/drone/telemetry', (req, res) => {
    res.json(telemetryStore.getLatest() || {});
  });

  router.get('/drone/sensors', (req, res) => {
    const latest = telemetryStore.getLatest();
    res.json(latest?.sensors || {});
  });

  router.get('/drone/camera/snapshot', (req, res) => {
    res.status(410).json({
      error: 'Camera frames never pass through this server. Perception runs in-browser on the game canvas; the optional LiveKit robotics link streams frames peer-to-peer (room: "drone", track: "drone-fpv").',
    });
  });

  router.get('/drone/camera/depth', (req, res) => {
    res.status(501).json({ error: 'Not implemented' });
  });

  router.get('/drone/mission/state', (req, res) => {
    res.json({ state: droneState.state, realtime: simEngine.missionSummary() });
  });

  router.get('/drone/geofence', (req, res) => {
    res.json(geofence.getConfig());
  });

  router.post('/drone/command', async (req, res) => {
    try {
      const response = await droneCommands.execute(req.body);
      res.json(response);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // --- Replays ---

  router.get('/replays', (req, res) => {
    res.json(replayStore.list());
  });

  router.get('/replays/:id', (req, res) => {
    const data = replayStore.load(req.params.id);
    if (!data) {
      res.status(404).json({ error: 'Replay not found' });
      return;
    }
    res.json(data);
  });

  // --- Leaderboard ---

  router.get('/leaderboard', (req, res) => {
    res.json(leaderboard.top(Number(req.query.limit) || 25));
  });

  // --- CV Arena: score a submitted detector against the live world ---

  router.post('/cv/arena/submit', (req, res) => {
    const submission = req.body as CvArenaSubmission;
    if (!Array.isArray(submission?.detections) || !submission.frame) {
      res.status(400).json({ error: 'Expected { frame: {width,height}, detections: [{label,bbox}] }' });
      return;
    }
    const cam: CvArenaCamera = submission.camera || {};
    const drone = simEngine.droneState();
    const groundTruth: GroundTruthItem[] = [];
    for (const t of simEngine.targetsList()) {
      if (!t.isAlive) continue;
      const box = projectToPixel(t, drone, cam, submission.frame.width, submission.frame.height);
      if (box) groundTruth.push({ id: t.id, label: t.type.toLowerCase(), worldPos: t.pos, pixelBBox: box });
    }
    // calibrate:1 returns the projected ground truth unscored, so agents can map
    // world targets into their own pixel frame without burning a leaderboard row.
    if (req.query.calibrate === '1' || submission.calibrate) {
      res.json({ groundTruth, frame: submission.frame, camera: cam });
      return;
    }
    const result = scoreDetection(submission, groundTruth);
    leaderboard.record({
      id: `cvarena-${Date.now().toString(36)}`,
      startedAt: Date.now(),
      endedAt: Date.now(),
      mapId: String(submission.mapId || 'arena'),
      mission: JSON.stringify({
        score: result.matchScore,
        targetsHit: result.matches,
        totalTargets: groundTruth.length,
        dronesRemaining: 0,
        totalDrones: 1,
        missionStatus: 'ARENA',
      }),
      pilot: submission.pilot || 'agent',
      autonomy: submission.model || 'opencv',
    });
    res.json({
      ...result,
      groundTruthCount: groundTruth.length,
      detectionsCount: submission.detections.length,
      groundTruth,
    });
  });

  return router;
}

// Pinhole-project an authoritative world target into the submitting agent's
// pixel frame, using the server's drone pose plus the camera the agent reports.
function numOr(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function projectToPixel(
  t: { pos: [number, number, number]; radius: number; height: number },
  drone: { pos: [number, number, number]; headingRad: number; pitchDeg: number },
  cam: CvArenaCamera,
  frameW: number,
  frameH: number
): [number, number, number, number] | null {
  const yaw = (numOr(cam.yawDeg, drone.headingRad * (180 / Math.PI)) * Math.PI) / 180;
  const pitch = (numOr(cam.pitchDeg, drone.pitchDeg) * Math.PI) / 180;
  const fovV = numOr(cam.fovDeg, CAMERA.fpv.fovDegrees) * (Math.PI / 180);

  const fx = Math.sin(yaw) * Math.cos(pitch);
  const fy = Math.sin(pitch);
  const fz = Math.cos(yaw) * Math.cos(pitch);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  // camera up = forward × right
  const ux = -Math.sin(yaw) * Math.sin(pitch);
  const uy = Math.cos(pitch);
  const uz = -Math.cos(yaw) * Math.sin(pitch);

  const dx = t.pos[0] - drone.pos[0];
  const dy = t.pos[1] + t.height / 2 - drone.pos[1];
  const dz = t.pos[2] - drone.pos[2];

  const zc = dx * fx + dy * fy + dz * fz;
  if (zc < 0.5) return null;
  const xc = dx * rx + dz * rz;
  const yc = dx * ux + dy * uy + dz * uz;

  const focal = frameH / 2 / Math.tan(fovV / 2);
  const w = ((2 * t.radius) * focal) / zc;
  const h = (t.height * focal) / zc;
  const cx = frameW / 2 + (xc * focal) / zc;
  const cy = frameH / 2 - (yc * focal) / zc;
  if (cx + w < 0 || cx - w > frameW || cy + h < 0 || cy - h > frameH) return null;
  return [cx - w / 2, cy - h / 2, w, h];
}
