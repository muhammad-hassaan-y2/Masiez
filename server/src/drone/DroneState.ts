export enum DroneFlightState {
  DISARMED = 'DISARMED',
  ARMED = 'ARMED',
  TAKING_OFF = 'TAKING_OFF',
  HOVERING = 'HOVERING',
  NAVIGATING = 'NAVIGATING',
  ORBITING = 'ORBITING',
  LANDING = 'LANDING',
  RETURNING = 'RETURNING',
  EMERGENCY_HOLD = 'EMERGENCY_HOLD'
}

export class DroneState {
  private currentState: DroneFlightState = DroneFlightState.DISARMED;
  private history: { state: DroneFlightState, timestamp: number, reason: string }[] = [];
  private onStateChangeCallbacks: ((state: DroneFlightState) => void)[] = [];

  private transitions: Map<DroneFlightState, DroneFlightState[]> = new Map([
    [DroneFlightState.DISARMED, [DroneFlightState.ARMED, DroneFlightState.EMERGENCY_HOLD]],
    [DroneFlightState.ARMED, [DroneFlightState.DISARMED, DroneFlightState.TAKING_OFF, DroneFlightState.EMERGENCY_HOLD]],
    [DroneFlightState.TAKING_OFF, [DroneFlightState.HOVERING, DroneFlightState.LANDING, DroneFlightState.EMERGENCY_HOLD]],
    [DroneFlightState.HOVERING, [DroneFlightState.NAVIGATING, DroneFlightState.ORBITING, DroneFlightState.LANDING, DroneFlightState.RETURNING, DroneFlightState.EMERGENCY_HOLD]],
    [DroneFlightState.NAVIGATING, [DroneFlightState.HOVERING, DroneFlightState.ORBITING, DroneFlightState.RETURNING, DroneFlightState.EMERGENCY_HOLD]],
    [DroneFlightState.ORBITING, [DroneFlightState.HOVERING, DroneFlightState.NAVIGATING, DroneFlightState.RETURNING, DroneFlightState.EMERGENCY_HOLD]],
    [DroneFlightState.RETURNING, [DroneFlightState.HOVERING, DroneFlightState.LANDING, DroneFlightState.EMERGENCY_HOLD]],
    [DroneFlightState.LANDING, [DroneFlightState.DISARMED, DroneFlightState.EMERGENCY_HOLD]],
    [DroneFlightState.EMERGENCY_HOLD, [DroneFlightState.DISARMED, DroneFlightState.LANDING]]
  ]);

  public canTransition(to: DroneFlightState): boolean {
    const allowed = this.transitions.get(this.currentState) || [];
    return allowed.includes(to) || to === DroneFlightState.EMERGENCY_HOLD;
  }

  public transition(to: DroneFlightState, reason: string): boolean {
    if (!this.canTransition(to)) {
      console.warn(`Invalid state transition from ${this.currentState} to ${to}`);
      return false;
    }

    this.history.unshift({ state: to, timestamp: Date.now(), reason });
    if (this.history.length > 50) this.history.pop();
    
    this.currentState = to;
    this.onStateChangeCallbacks.forEach(cb => cb(this.currentState));
    return true;
  }

  public get state(): DroneFlightState {
    return this.currentState;
  }

  public getHistory() {
    return this.history;
  }

  public onStateChange(cb: (state: DroneFlightState) => void) {
    this.onStateChangeCallbacks.push(cb);
  }
}
