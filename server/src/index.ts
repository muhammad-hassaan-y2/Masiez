import express from 'express';
import http from 'http';
import cors from 'cors';
import { REALTIME } from 'drone-autonomy-shared';
import { CONFIG } from './config';
import { WebSocketServer } from './websocket/WebSocketServer';
import { MessageRouter } from './websocket/MessageRouter';
import { TelemetryStore } from './drone/TelemetryStore';
import { DroneCommands } from './drone/DroneCommands';
import { DroneState } from './drone/DroneState';
import { Geofence } from './safety/Geofence';
import { SafetyValidator } from './safety/SafetyValidator';
import { SimEngine } from './sim/SimEngine';
import { ReplayStore } from './sim/ReplayStore';
import { LeaderboardStore } from './api/LeaderboardStore';
import { createRoutes } from './api/routes';
import { MCPServer } from './mcp/MCPServer';
import { Tools } from './mcp/Tools';
import { Resources } from './mcp/Resources';

const app = express();
app.use(cors({ origin: CONFIG.corsOrigins }));
app.use(express.json({ limit: '8mb' }));

const server = http.createServer(app);

const telemetryStore = new TelemetryStore();
const droneState = new DroneState();
const geofence = new Geofence();
const safetyValidator = new SafetyValidator(geofence);
const droneCommands = new DroneCommands(droneState, safetyValidator);
const simEngine = new SimEngine();
const replayStore = new ReplayStore();
const leaderboard = new LeaderboardStore();

const router = new MessageRouter(telemetryStore, droneCommands, simEngine);
const wsServer = new WebSocketServer(server, router);

const tools = new Tools();
const resources = new Resources();
const mcpServer = new MCPServer(tools, resources, droneCommands, telemetryStore);

// --- Authoritative realtime simulation loop ---
// Fixed timestep at REALTIME.simTickHz; snapshots broadcast at REALTIME.snapshotHz.
wsServer.onClientCountChange = (games) => {
  simEngine.noteClients(games);
  if (games === 0) {
    const meta = replayStore.end();
    if (meta) leaderboard.record(meta);
  }
};

const tickDt = 1.0 / REALTIME.simTickHz;
setInterval(() => {
  simEngine.tick(tickDt);
}, Math.round(1000 / REALTIME.simTickHz));

setInterval(() => {
  const snapshot = {
    type: 'world:state',
    serverTime: Date.now(),
    drone: simEngine.droneState(),
    connected: simEngine.isConnected(),
    mission: simEngine.missionSummary(),
    targets: simEngine.aliveTargets(),
  };
  wsServer.sendToAllGames(snapshot);
  wsServer.broadcastToAI({ type: 'ai:world_state', payload: snapshot });
  replayStore.record(
    Date.now(),
    snapshot.drone,
    snapshot.mission,
    simEngine.targetsList ? simEngine.targetsList() : snapshot.targets
  );
  const events = simEngine.drainEvents();
  for (const ev of events) {
    const msg = { type: 'world:event', ...ev };
    wsServer.sendToAllGames(msg);
    wsServer.broadcastToAI(msg);
  }
}, Math.round(1000 / REALTIME.snapshotHz));

// Mission lifecycle → replay + leaderboard bookkeeping
const mapIdForReplay = () => process.env.MAP_ID || 'airfield';
simEngine.onStrike = (mission) => {
  if (!replayStore.isRecording()) replayStore.start(mapIdForReplay(), mission);
  if (mission.missionStatus !== 'ACTIVE') {
    const meta = replayStore.end();
    if (meta) leaderboard.record(meta);
  }
};
simEngine.onMissionReset = (mission) => {
  const meta = replayStore.end();
  if (meta) leaderboard.record(meta);
  replayStore.start(mapIdForReplay(), mission);
};

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    realtime: true,
    telemetry: telemetryStore.getLatest() ? 1 : 0,
    clients: simEngine.connectedCount(),
    tick_hz: REALTIME.simTickHz,
  });
});

app.use(
  CONFIG.apiBasePath,
  createRoutes(telemetryStore, droneCommands, droneState, geofence, simEngine, replayStore, leaderboard)
);

// MCP JSON-RPC endpoint for external AI agents
app.post('/mcp', async (req, res) => {
  res.json(await mcpServer.handleRequest(req.body));
});

// start
server.listen(CONFIG.httpPort, () => {
  console.log(`Masiez Backend 1 — Authoritative realtime game server on port ${CONFIG.httpPort} (${REALTIME.simTickHz}Hz sim, ${REALTIME.snapshotHz}Hz snapshots)`);
});

process.on('SIGINT', () => {
  server.close(() => {
    console.log('Server shutting down gracefully');
    process.exit(0);
  });
});
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server shutting down gracefully');
    process.exit(0);
  });
});
