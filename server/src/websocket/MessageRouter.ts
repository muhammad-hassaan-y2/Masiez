import { WebSocketServer } from './WebSocketServer';
import { TelemetryStore } from '../drone/TelemetryStore';
import { DroneCommands } from '../drone/DroneCommands';

export class MessageRouter {
  private telemetryStore: TelemetryStore;
  private droneCommands: DroneCommands;

  constructor(telemetryStore: TelemetryStore, droneCommands: DroneCommands) {
    this.telemetryStore = telemetryStore;
    this.droneCommands = droneCommands;
  }

  public handleMessage(message: any, sessionId: string, source: 'game' | 'ai', wsServer: WebSocketServer) {
    console.log(`[${new Date().toISOString()}] Routed message from ${source}: ${message.type}`);
    
    if (message.type.startsWith('game:')) {
      if (message.type === 'game:telemetry') {
        this.telemetryStore.update(message.payload);
        wsServer.broadcastToAI({ type: 'ai:telemetry', payload: message.payload });
      }
    } else if (message.type.startsWith('user:')) {
      if (message.type === 'user:chat') {
        wsServer.broadcastToAI({ type: 'ai:chat', payload: message.payload });
      } else if (message.type === 'user:override') {
        this.droneCommands.execute(message.payload).then(response => {
           wsServer.sendToGame(sessionId, { type: 'game:command_response', payload: response });
        });
      }
    } else if (message.type.startsWith('ai:')) {
       if (message.type === 'ai:command') {
          this.droneCommands.execute(message.payload).then(response => {
             wsServer.broadcastToAI({ type: 'ai:command_response', payload: response });
          });
       }
    }
  }
}
