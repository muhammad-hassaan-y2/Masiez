import {
  REALTIME,
  SPEED_PROFILES,
  SPEED_MODES,
  type SpeedMode,
  type DroneAxes,
  type WorldTargetState,
  type WorldMissionSummary,
  type WorldDroneState,
  type WorldEventKind,
} from 'drone-autonomy-shared';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface WorldEvent {
  kind: WorldEventKind;
  message: string;
  serverTime: number;
}

interface MissionMirror extends WorldMissionSummary {
  elapsedSec: number;
}

/**
 * Authoritative realtime drone simulation.
 *
 * The browser renders and senses, but the server owns the drone's kinematic
 * truth: control axes streamed from any pilot (human, in-browser AI, or a
 * remote Jupyter/LiveKit controller) are integrated here at a fixed timestep
 * with the same flight model the client was using locally, then broadcast
 * as world snapshots. Clients reconcile their physics to this state.
 */
export class SimEngine {
  public pos: [number, number, number] = [0, 10, 0];
  public vel: [number, number, number] = [0, 0, 0];
  public headingRad = 0;
  public rollDeg = 0;
  public pitchDeg = 0;
  public batteryPct = 100;
  public speedMode: SpeedMode = 'CRUISE';
  public armed = true;
  public crashed = false;
  public spawn: [number, number, number] = [0, 10, 0];
  public groundElevation = 0;
  public worldRadius: number = REALTIME.geofenceRadiusM;

  private axes: DroneAxes = { throttle: 0, pitch: 0, roll: 0, yaw: 0, headingDeg: 0 };
  private lastAxisMs = 0;
  private clientCount = 0;
  private mission: MissionMirror = {
    score: 0,
    targetsHit: 0,
    totalTargets: 0,
    dronesRemaining: 0,
    totalDrones: 0,
    missionStatus: 'IDLE',
    elapsedSec: 0,
  };
  private targets: WorldTargetState[] = [];
  private eventQueue: WorldEvent[] = [];

  public onStrike: ((mission: WorldMissionSummary, reason: string) => void) | null = null;
  public onMissionReset: ((mission: WorldMissionSummary) => void) | null = null;

  public setSpeedMode(mode: SpeedMode): boolean {
    if (!SPEED_MODES.includes(mode)) return false;
    this.speedMode = mode;
    this.pushEvent('DEPLOY', `Speed mode → ${mode}`);
    return true;
  }

  public deploy(): void {
    this.pos = [...this.spawn];
    this.vel = [0, 0, 0];
    this.rollDeg = 0;
    this.pitchDeg = 0;
    this.armed = true;
    this.crashed = false;
    this.mission.dronesRemaining = clamp(this.mission.dronesRemaining, 0, this.mission.totalDrones);
    this.pushEvent('DEPLOY', 'FPV drone deployed from base');
  }

  public reset(): void {
    this.deploy();
    this.batteryPct = 100;
    this.warned25 = false;
    this.warned10 = false;
    this.mission = {
      score: 0,
      targetsHit: 0,
      totalTargets: this.targets.length || this.mission.totalTargets,
      dronesRemaining: this.mission.totalDrones || 8,
      totalDrones: this.mission.totalDrones || 8,
      missionStatus: 'ACTIVE',
      elapsedSec: 0,
    };
    this.pushEvent('DEPLOY', 'New kamikaze mission started');
    if (this.onMissionReset) this.onMissionReset(this.missionSummary());
  }

  public recordStrike(
    reason: string,
    destroyed: Array<{ id: string; roleName: string }>,
    mission: WorldMissionSummary
  ): void {
    // The client owns detonation fx and entity destruction; the server adopts
    // the validated outcome as the authoritative mission record for AI/spectators.
    this.mission = { ...mission, elapsedSec: this.mission.elapsedSec };
    for (const d of destroyed) {
      const t = this.targets.find(t => t.id === d.id);
      if (t) t.isAlive = false;
    }
    this.crashed = true;
    this.armed = false;
    this.pushEvent('STRIKE', `💥 ${reason} — ${destroyed.length} target(s) destroyed`);
    if (mission.missionStatus !== 'ACTIVE') {
      this.pushEvent('MISSION_END', `Mission ${mission.missionStatus} — score ${mission.score}`);
    }
    if (this.onStrike) this.onStrike(mission, reason);
  }

  public noteClients(count: number): void {
    this.clientCount = count;
    if (this.mission.missionStatus === 'IDLE' && count > 0) {
      this.reset();
    }
  }
  public updateAxes(axes: Partial<DroneAxes>): void {
    if (this.crashed) return;
    const next: DroneAxes = {
      throttle: clamp(Number(axes.throttle) || 0, -1, 1),
      pitch: clamp(Number(axes.pitch) || 0, -1, 1),
      roll: clamp(Number(axes.roll) || 0, -1, 1),
      yaw: clamp(Number(axes.yaw) || 0, -1, 1),
      headingDeg: Number.isFinite(axes.headingDeg) ? (axes.headingDeg as number) : this.headingRad * (180 / Math.PI),
    };
    this.axes = next;
    this.headingRad = next.headingDeg * (Math.PI / 180);
    if (!this.armed && (Math.abs(next.throttle) > 0.05 || Math.hypot(next.pitch, next.roll) > 0.05)) {
      this.armed = true; // auto-arm on first control authority, mirroring client rules
    }
    this.lastAxisMs = Date.now();
  }

  public ingestTargets(targets: WorldTargetState[]): void {
    this.targets = targets.map(t => ({
      id: t.id,
      roleName: t.roleName,
      type: t.type,
      pos: t.pos,
      radius: t.radius,
      height: t.height,
      isAlive: t.isAlive,
    }));
    if (this.mission.totalTargets === 0 && targets.length > 0) {
      this.mission.totalTargets = targets.length;
      this.mission.missionStatus = 'ACTIVE';
    }
  }

  public tick(dtSec: number): void {
    // Fail-safe: pilot silent → neutralize sticks (hover/air-brake), not freeze
    if (this.lastAxisMs > 0 && Date.now() - this.lastAxisMs > REALTIME.inputTimeoutMs) {
      if (Math.abs(this.axes.throttle) + Math.abs(this.axes.pitch) + Math.abs(this.axes.roll) > 0) {
        this.axes = { ...this.axes, throttle: 0, pitch: 0, roll: 0, yaw: 0 };
        this.pushEvent('INPUT_LOST', 'Control stream timeout — axes neutralized (fail-safe hover)');
      }
    }
    if (this.crashed) return;

    const profile = SPEED_PROFILES[this.speedMode];
    const p = this.pos;
    const v = this.vel;

    if (this.armed) {
      const fwdX = Math.sin(this.headingRad);
      const fwdZ = Math.cos(this.headingRad);
      const rgtX = Math.cos(this.headingRad);
      const rgtZ = -Math.sin(this.headingRad);

      let inP = this.axes.pitch;
      let inR = this.axes.roll;
      const mag = Math.hypot(inP, inR);
      if (mag > 1.0) {
        inP /= mag;
        inR /= mag;
      }

      if (mag > 0.02) {
        const targetVx = (fwdX * inP + rgtX * inR) * profile.maxSpeed;
        const targetVz = (fwdZ * inP + rgtZ * inR) * profile.maxSpeed;
        const blendH = Math.min(1.0, dtSec * profile.accelRate);
        v[0] += (targetVx - v[0]) * blendH;
        v[2] += (targetVz - v[2]) * blendH;
      } else {
        const blendBrake = Math.min(1.0, dtSec * profile.brakeRate);
        v[0] += (0 - v[0]) * blendBrake;
        v[2] += (0 - v[2]) * blendBrake;
        if (Math.hypot(v[0], v[2]) < 0.1) {
          v[0] = 0;
          v[2] = 0;
        }
      }

      if (this.axes.throttle > 0.05) {
        const blendClimb = Math.min(1.0, dtSec * 18.0);
        v[1] += (profile.climbSpeed * this.axes.throttle - v[1]) * blendClimb;
      } else if (this.axes.throttle < -0.05) {
        const blendDescend = Math.min(1.0, dtSec * 18.0);
        v[1] += (-profile.descentSpeed * Math.abs(this.axes.throttle) - v[1]) * blendDescend;
      } else {
        const blendHover = Math.min(1.0, dtSec * 14.0);
        v[1] += (0 - v[1]) * blendHover;
        if (Math.abs(v[1]) < 0.05) v[1] = 0;
      }

      p[0] += v[0] * dtSec;
      p[1] += v[1] * dtSec;
      p[2] += v[2] * dtSec;

      // Visual banking / pitch tilt (authoritative so FPV HUD matches server truth)
      const targetPitch = inP * profile.maxTiltDeg;
      let targetRoll = inR * profile.maxTiltDeg + this.axes.yaw * 10.0;
      const blendTilt = Math.min(1.0, dtSec * 22.0);
      this.rollDeg += (targetRoll - this.rollDeg) * blendTilt;
      this.pitchDeg += (targetPitch - this.pitchDeg) * blendTilt;

      // Geofence & ceiling safety (soft clamp, not kill — client structures still detonate)
      const dx = p[0] - this.spawn[0];
      const dz = p[2] - this.spawn[2];
      const dist = Math.hypot(dx, dz);
      if (dist > this.worldRadius) {
        const k = this.worldRadius / dist;
        p[0] = this.spawn[0] + dx * k;
        p[2] = this.spawn[2] + dz * k;
        v[0] *= 0.5;
        v[2] *= 0.5;
        if (Date.now() - this.lastClampEventMs > 2000) {
          this.lastClampEventMs = Date.now();
          this.pushEvent('GEOFENCE_CLAMP', `Soft world boundary reached (${Math.round(dist)}m from base) — velocity clamped`);
        }
      }
      const maxAlt = this.groundElevation + REALTIME.maxAglM;
      if (p[1] > maxAlt) {
        p[1] = maxAlt;
        if (v[1] > 0) v[1] = 0;
      }

      // Battery drain model
      const moving = Math.hypot(v[0], v[2]) > 0.5 || Math.abs(v[1]) > 0.3;
      this.batteryPct = Math.max(
        0,
        this.batteryPct - (moving ? REALTIME.batteryFlightPctPerSec : REALTIME.batteryIdlePctPerSec) * dtSec
      );
      this.checkBatteryAlerts();
    } else {
      // Disarmed: settle on ground
      v[0] *= 0.9;
      v[2] *= 0.9;
      v[1] = Math.min(v[1], 0);
      p[0] += v[0] * dtSec;
      p[1] += v[1] * dtSec;
      p[2] += v[2] * dtSec;
      const groundY = this.groundElevation + REALTIME.landingClearanceM;
      if (p[1] < groundY) {
        p[1] = groundY;
        v[1] = 0;
      }
    }

    // Ground impact check — lethal dive into terrain destroys the airframe
    const groundY = this.groundElevation + REALTIME.landingClearanceM;
    if (p[1] <= groundY + 0.01 && v[1] <= REALTIME.impactVelY) {
      this.crashed = true;
      this.armed = false;
      this.pushEvent('GROUND_IMPACT', 'High-speed terrain impact — airframe destroyed');
    }

    this.mission.elapsedSec += dtSec;
  }

  private lastClampEventMs = 0;
  private warned25 = false;
  private warned10 = false;

  private checkBatteryAlerts(): void {
    if (this.batteryPct <= 25 && !this.warned25) {
      this.warned25 = true;
      this.pushEvent('BATTERY_CRITICAL', 'Battery below 25% — return or strike soon');
    }
    if (this.batteryPct <= 10 && !this.warned10) {
      this.warned10 = true;
      this.pushEvent('BATTERY_CRITICAL', 'Battery below 10% — CRITICAL');
    }
    if (this.batteryPct > 30) {
      this.warned25 = false;
      this.warned10 = false;
    }
  }

  public droneState(): WorldDroneState {
    return {
      pos: [this.pos[0], this.pos[1], this.pos[2]],
      vel: [this.vel[0], this.vel[1], this.vel[2]],
      headingRad: this.headingRad,
      rollDeg: this.rollDeg,
      pitchDeg: this.pitchDeg,
      armed: this.armed,
      crashed: this.crashed,
      batteryPct: this.batteryPct,
      speedMode: this.speedMode,
      agl: this.pos[1] - this.groundElevation,
    };
  }

  public missionSummary(): WorldMissionSummary {
    return {
      score: this.mission.score,
      targetsHit: this.mission.targetsHit,
      totalTargets: this.mission.totalTargets,
      dronesRemaining: this.mission.dronesRemaining,
      totalDrones: this.mission.totalDrones,
      missionStatus: this.mission.missionStatus,
    };
  }

  public aliveTargets(): WorldTargetState[] {
    return this.targets.filter(t => t.isAlive);
  }

  public targetsList(): WorldTargetState[] {
    return this.targets;
  }

  public drainEvents(): WorldEvent[] {
    const out = this.eventQueue;
    this.eventQueue = [];
    return out;
  }

  public isConnected(): boolean {
    return this.clientCount > 0;
  }

  public connectedCount(): number {
    return this.clientCount;
  }

  public configuredSpawn(spawn: [number, number, number], groundElevation: number, worldRadius?: number): void {
    this.spawn = [...spawn];
    this.groundElevation = groundElevation;
    if (worldRadius) this.worldRadius = worldRadius;
    this.reset();
  }

  private pushEvent(kind: WorldEventKind, message: string): void {
    this.eventQueue.push({ kind, message, serverTime: Date.now() });
    if (this.eventQueue.length > 16) this.eventQueue.shift();
  }
}
