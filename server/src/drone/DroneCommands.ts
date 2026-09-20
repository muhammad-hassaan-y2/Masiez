import { DroneState, DroneFlightState } from './DroneState';
import { SafetyValidator } from '../safety/SafetyValidator';

export class DroneCommands {
  private droneState: DroneState;
  private safetyValidator: SafetyValidator;
  private activeCommandId: string | null = null;
  private activeCommandTimeout: NodeJS.Timeout | null = null;

  constructor(droneState: DroneState, safetyValidator: SafetyValidator) {
    this.droneState = droneState;
    this.safetyValidator = safetyValidator;
  }

  public async execute(command: any): Promise<any> {
    const validation = this.safetyValidator.validate(command);
    if (!validation.valid) {
      return { status: 'REJECTED', reason: validation.errors.join(', ') };
    }

    let newState: DroneFlightState | null = null;

    switch (command.type) {
      case 'ARM_AND_TAKEOFF':
        if (this.droneState.state === DroneFlightState.DISARMED) {
          this.droneState.transition(DroneFlightState.ARMED, 'Command: ARM_AND_TAKEOFF');
        }
        newState = DroneFlightState.TAKING_OFF;
        break;
      case 'GOTO_LOCATION':
        newState = DroneFlightState.NAVIGATING;
        break;
      case 'ORBIT_POINT':
        newState = DroneFlightState.ORBITING;
        break;
      case 'LAND':
        newState = DroneFlightState.LANDING;
        break;
      case 'RETURN_TO_LAUNCH':
        newState = DroneFlightState.RETURNING;
        break;
      case 'EMERGENCY_STOP':
        newState = DroneFlightState.EMERGENCY_HOLD;
        break;
      case 'PAUSE':
        newState = DroneFlightState.HOVERING;
        break;
      case 'SET_GIMBAL':
      case 'CAPTURE_IMAGE':
      case 'SET_FLIGHT_MODE':
        // no state change
        break;
      default:
        return { status: 'REJECTED', reason: 'Unknown command type' };
    }

    if (newState) {
      const success = this.droneState.transition(newState, `Command: ${command.type}`);
      if (!success) {
        return { status: 'REJECTED', reason: `Invalid state transition to ${newState}` };
      }
    }

    this.activeCommandId = command.id || Math.random().toString(36).substring(7);
    
    if (this.activeCommandTimeout) clearTimeout(this.activeCommandTimeout);
    this.activeCommandTimeout = setTimeout(() => {
      console.warn(`Command ${this.activeCommandId} timed out after 30s`);
    }, 30000);

    return { status: 'ACCEPTED', commandId: this.activeCommandId };
  }
}
