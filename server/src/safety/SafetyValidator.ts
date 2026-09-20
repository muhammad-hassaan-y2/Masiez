import { Geofence } from './Geofence';
import { DroneState } from '../drone/DroneState';

export class SafetyValidator {
  private geofence: Geofence;

  constructor(geofence: Geofence) {
    this.geofence = geofence;
  }

  public validate(command: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (command.type === 'GOTO_LOCATION') {
      if (command.params?.lat && command.params?.lon) {
         if (!this.geofence.isInsideGeofence(command.params.lat, command.params.lon)) {
           errors.push('Destination is outside the geofence');
         }
      }
      if (command.params?.altitude !== undefined) {
         if (!this.geofence.validateAltitude(command.params.altitude)) {
           errors.push('Altitude out of safe range (1-120m)');
         }
      }
    }

    if (command.params?.speed !== undefined) {
      if (command.params.speed < 0 || command.params.speed > 15) {
        errors.push('Speed out of safe range (0-15 m/s)');
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
