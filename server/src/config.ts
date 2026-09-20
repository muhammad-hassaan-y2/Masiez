import { SERVER, SIMULATION } from 'drone-autonomy-shared/constants';

export const CONFIG = {
  httpPort: process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT) : 3001,
  wsGamePath: process.env.WS_GAME_PATH || '/ws/game',
  wsAiPath: process.env.WS_AI_PATH || '/ws/ai',
  apiBasePath: process.env.API_BASE_PATH || '/api/v1',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
  telemetryBufferSeconds: process.env.TELEMETRY_BUFFER_SECONDS ? parseInt(process.env.TELEMETRY_BUFFER_SECONDS) : 300,
  maxSessions: process.env.MAX_SESSIONS ? parseInt(process.env.MAX_SESSIONS) : 100,
  referenceLat: 33.6,
  referenceLon: 72.9
};
