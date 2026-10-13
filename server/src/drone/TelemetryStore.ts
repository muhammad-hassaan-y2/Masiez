export class TelemetryStore {
  private history: any[] = [];
  private latest: any = null;
  private alertCallbacks: ((alert: any) => void)[] = [];
  private batteryThresholds = new Set<number>();
  private lastSensorHealth = true;

  public update(telemetry: any) {
    if (!telemetry) return;
    this.latest = telemetry;
    this.history.push(telemetry);
    if (this.history.length > 3000) {
      this.history.shift(); // 300 seconds at 10Hz
    }

    this.checkAlerts(telemetry);
  }

  private checkAlerts(telemetry: any) {
    if (!telemetry || !telemetry.battery) return;
    const { percentage } = telemetry.battery;
    
    [25, 15, 10].forEach(level => {
      if (percentage <= level && !this.batteryThresholds.has(level)) {
        this.batteryThresholds.add(level);
        this.emitAlert({ type: 'BATTERY_LOW', level, message: `Battery below ${level}%` });
      }
    });

    if (percentage > 25) this.batteryThresholds.clear(); // Reset on charge

    if (telemetry.sensors) {
        const allHealthy = Object.values(telemetry.sensors).every(v => v === true);
        if (this.lastSensorHealth !== allHealthy) {
            this.emitAlert({ type: 'SENSOR_HEALTH', healthy: allHealthy, message: `Sensor health changed` });
            this.lastSensorHealth = allHealthy;
        }
    }
  }

  public getLatest() {
    return this.latest;
  }

  public getHistory(seconds: number) {
    const entries = seconds * 10;
    return this.history.slice(-entries);
  }

  public onAlert(cb: (alert: any) => void) {
    this.alertCallbacks.push(cb);
  }

  private emitAlert(alert: any) {
    this.alertCallbacks.forEach(cb => cb(alert));
  }
}
