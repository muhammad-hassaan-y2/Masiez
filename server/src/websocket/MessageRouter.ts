import { WebSocketServer } from './WebSocketServer';
import { TelemetryStore } from '../drone/TelemetryStore';
import { DroneCommands } from '../drone/DroneCommands';
import { SimEngine } from '../sim/SimEngine';
import type { WorldTargetState } from 'drone-autonomy-shared';

export class MessageRouter {
  private telemetryStore: TelemetryStore;
  private droneCommands: DroneCommands;
  private simEngine: SimEngine;

  constructor(telemetryStore: TelemetryStore, droneCommands: DroneCommands, simEngine: SimEngine) {
    this.telemetryStore = telemetryStore;
    this.droneCommands = droneCommands;
    this.simEngine = simEngine;
  }

  public handleMessage(message: any, sessionId: string, source: 'game' | 'ai', wsServer: WebSocketServer) {
    if (message.type !== 'game:telemetry' && message.type !== 'game:axes') {
      console.log(`[${new Date().toISOString()}] Routed message from ${source}: ${message.type}`);
    }

    if (message.type === 'game:axes' && source === 'game') {
      this.simEngine.updateAxes(message.axes || {});
      return;
    }

    if (message.type === 'game:world_cmd' && source === 'game') {
      switch (message.action) {
        case 'set_speed_mode':
          if (message.speedMode) this.simEngine.setSpeedMode(message.speedMode);
          break;
        case 'deploy':
          this.simEngine.deploy();
          break;
        case 'reset':
          this.simEngine.reset();
          break;
        case 'strike':
          if (message.strike) {
            this.simEngine.recordStrike(
              message.strike.reason,
              message.strike.destroyedTargets || [],
              message.strike.mission
            );
          }
          break;
      }
      return;
    }

    if (message.type.startsWith('game:')) {
      if (message.type === 'game:telemetry') {
        const data = message.telemetry || message.payload;
        this.telemetryStore.update(data);
        if (Array.isArray(message.targets)) {
          this.simEngine.ingestTargets(message.targets as WorldTargetState[]);
        }
        wsServer.broadcastToAI({ type: 'ai:telemetry', payload: data, mission: message.mission, targets: message.targets });
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
      } else if (message.type === 'ai:axes' && source === 'ai') {
        // Remote AI pilots (Jupyter/Kaggle/headless harnesses) can drive the
        // authoritative drone directly over the /ws/ai channel.
        this.simEngine.updateAxes(message.axes || {});
      }
    }
  }
}
