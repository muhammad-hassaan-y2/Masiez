import { Router } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { CONFIG } from '../config';

export function createRoutes(telemetryStore: any, droneCommands: any, droneState: any, geofence: any) {
  const router = Router();

  // LiveKit Robotics Token Endpoint
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
      res.json({
        token,
        url: CONFIG.livekitUrl,
        room,
        identity,
      });
    } catch (err: any) {
      console.error('[LiveKit] Failed to generate token:', err);
      res.status(500).json({ error: 'Failed to generate LiveKit token', details: err.message });
    }
  };

  router.get('/livekit/token', generateLiveKitToken);
  router.post('/livekit/token', generateLiveKitToken);
  router.get('/drone/livekit/token', generateLiveKitToken);
  router.post('/drone/livekit/token', generateLiveKitToken);

  router.get('/livekit/config', (req, res) => {
    res.json({
      url: CONFIG.livekitUrl,
      room: CONFIG.livekitRoom,
      apiKey: CONFIG.livekitApiKey,
    });
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
      error: 'Camera frames are streamed directly from the drone robot via LiveKit WebRTC (room: "drone", track: "drone-fpv").',
    });
  });

  router.get('/drone/camera/depth', (req, res) => {
    res.status(501).json({ error: 'Not implemented' });
  });

  router.get('/drone/mission/state', (req, res) => {
    res.json({ state: droneState.state });
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

  router.post('/drone/chat', (req, res) => {
    // forward to chat
    res.json({ status: 'sent' });
  });

  return router;
}
