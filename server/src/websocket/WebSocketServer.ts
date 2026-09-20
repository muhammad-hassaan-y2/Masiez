import WebSocket, { WebSocketServer as WSServer } from 'ws';
import { IncomingMessage, Server as HttpServer } from 'http';
import { MessageRouter } from './MessageRouter';

export class WebSocketServer {
  private gameServer: WSServer;
  private aiServer: WSServer;
  private gameClients: Map<string, WebSocket> = new Map();
  private aiClients: Map<string, WebSocket> = new Map();
  private router: MessageRouter;

  constructor(server: HttpServer, router: MessageRouter) {
    this.router = router;

    this.gameServer = new WSServer({ noServer: true });
    this.aiServer = new WSServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const pathname = request.url;
      if (pathname === '/ws/game') {
        this.gameServer.handleUpgrade(request, socket as any, head, (ws) => {
          this.gameServer.emit('connection', ws, request);
        });
      } else if (pathname === '/ws/ai') {
        this.aiServer.handleUpgrade(request, socket as any, head, (ws) => {
          this.aiServer.emit('connection', ws, request);
        });
      } else {
        (socket as any).destroy();
      }
    });

    this.setupGameServer();
    this.setupAiServer();
    this.setupHeartbeat();
  }

  private setupGameServer(): void {
    this.gameServer.on('connection', (ws: WebSocket) => {
      const sessionId = Math.random().toString(36).substring(7);
      this.gameClients.set(sessionId, ws);
      (ws as any).isAlive = true;

      ws.on('pong', () => { (ws as any).isAlive = true; });

      ws.on('message', (message: Buffer | string) => {
        try {
          const parsed = JSON.parse(message.toString());
          if (parsed.type) {
            this.router.handleMessage(parsed, sessionId, 'game', this);
          }
        } catch (e) {
          console.error('Failed to parse game message', e);
        }
      });

      ws.on('close', () => {
        this.gameClients.delete(sessionId);
        console.log(`Game client disconnected: ${sessionId}`);
      });

      console.log(`Game client connected: ${sessionId}`);
    });
  }

  private setupAiServer(): void {
    this.aiServer.on('connection', (ws: WebSocket) => {
      const sessionId = Math.random().toString(36).substring(7);
      this.aiClients.set(sessionId, ws);
      (ws as any).isAlive = true;

      ws.on('pong', () => { (ws as any).isAlive = true; });

      ws.on('message', (message: Buffer | string) => {
        try {
          const parsed = JSON.parse(message.toString());
          if (parsed.type) {
            this.router.handleMessage(parsed, sessionId, 'ai', this);
          }
        } catch (e) {
          console.error('Failed to parse AI message', e);
        }
      });

      ws.on('close', () => {
        this.aiClients.delete(sessionId);
        console.log(`AI client disconnected: ${sessionId}`);
      });

      console.log(`AI client connected: ${sessionId}`);
    });
  }

  private setupHeartbeat(): void {
    setInterval(() => {
      [this.gameServer, this.aiServer].forEach(server => {
        server.clients.forEach((ws) => {
          if ((ws as any).isAlive === false) { ws.terminate(); return; }
          (ws as any).isAlive = false;
          ws.ping();
        });
      });
    }, 10000);
  }

  public sendToGame(sessionId: string, msg: unknown): void {
    const ws = this.gameClients.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  public sendToAllGames(msg: unknown): void {
    const data = JSON.stringify(msg);
    this.gameClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
  }

  public sendToAI(sessionId: string, msg: unknown): void {
    const ws = this.aiClients.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  public broadcastToAI(msg: unknown): void {
    const data = JSON.stringify(msg);
    this.aiClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
  }
}
