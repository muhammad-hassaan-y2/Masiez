import express from 'express';
import http from 'http';
import cors from 'cors';
import { CONFIG } from './config';
import { WebSocketServer } from './websocket/WebSocketServer';
import { MessageRouter } from './websocket/MessageRouter';
import { TelemetryStore } from './drone/TelemetryStore';
import { DroneCommands } from './drone/DroneCommands';
import { DroneState } from './drone/DroneState';
import { Geofence } from './safety/Geofence';
import { SafetyValidator } from './safety/SafetyValidator';
import { createRoutes } from './api/routes';
import { MCPServer } from './mcp/MCPServer';
import { Tools } from './mcp/Tools';
import { Resources } from './mcp/Resources';

const app = express();
app.use(cors({ origin: CONFIG.corsOrigins }));
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);

const telemetryStore = new TelemetryStore();
const droneState = new DroneState();
const geofence = new Geofence();
const safetyValidator = new SafetyValidator(geofence);
const droneCommands = new DroneCommands(droneState, safetyValidator);

const router = new MessageRouter(telemetryStore, droneCommands);
const wsServer = new WebSocketServer(server, router);

const tools = new Tools();
const resources = new Resources();
const mcpServer = new MCPServer(tools, resources, droneCommands, telemetryStore);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', telemetry: telemetryStore.getLatest() ? 1 : 0 });
});

app.use(CONFIG.apiBasePath, createRoutes(telemetryStore, droneCommands, droneState, geofence));

// MCP JSON-RPC endpoint for external AI agents
app.post('/mcp', async (req, res) => {
  res.json(await mcpServer.handleRequest(req.body));
});

// start
server.listen(CONFIG.httpPort, () => {
  console.log(`Masiez Backend 1 — Game Server running on port ${CONFIG.httpPort}`);
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
