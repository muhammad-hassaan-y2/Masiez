import { Router } from 'express';

export function createRoutes(telemetryStore: any, droneCommands: any, droneState: any, geofence: any) {
  const router = Router();

  router.get('/drone/telemetry', (req, res) => {
    res.json(telemetryStore.getLatest() || {});
  });

  router.get('/drone/sensors', (req, res) => {
    const latest = telemetryStore.getLatest();
    res.json(latest?.sensors || {});
  });

  router.get('/drone/camera/snapshot', (req, res) => {
    res.status(501).json({ error: 'Not implemented yet' });
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
