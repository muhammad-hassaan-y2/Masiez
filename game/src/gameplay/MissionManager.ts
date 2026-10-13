import { GPUDeviceContext } from '../gpu/Device';
import { SoundManager } from './SoundManager';
import { BaseEntity } from './EntityManager';

export interface KamikazeMissionStats {
    score: number;
    targetsHit: number;
    totalTargets: number;
    dronesRemaining: number;
    totalDrones: number;
    missionStatus: 'ACTIVE' | 'SUCCESS' | 'FAILED';
    lastStrikeSuccess: boolean;
    lastStrikeTitle: string;
    lastStrikeDetail: string;
}

export class MissionManager {
    private ctx: GPUDeviceContext;
    private soundManager: SoundManager;

    public score: number = 0;
    public targetsHit: number = 0;
    public totalTargets: number = 6;
    public totalDrones: number = 8;
    public dronesRemaining: number = 8;
    public missionStatus: 'ACTIVE' | 'SUCCESS' | 'FAILED' = 'ACTIVE';

    public lastStrikeSuccess: boolean = false;
    public lastStrikeTitle: string = '';
    public lastStrikeDetail: string = '';

    public notificationText: string = "";
    public notificationTimer: number = 0;

    constructor(ctx: GPUDeviceContext, soundManager: SoundManager) {
        this.ctx = ctx;
        this.soundManager = soundManager;
    }

    public async init(): Promise<void> {
        this.startMission(6, 8);
    }

    public startMission(totalTargets: number = 6, totalDrones: number = 8): void {
        this.totalTargets = totalTargets;
        this.targetsHit = 0;
        this.totalDrones = totalDrones;
        this.dronesRemaining = totalDrones;
        this.score = 0;
        this.missionStatus = 'ACTIVE';
        this.lastStrikeSuccess = false;
        this.lastStrikeTitle = '';
        this.lastStrikeDetail = '';
        this.showNotification(`KAMIKAZE FPV MISSION: ${totalTargets} TARGETS | ${totalDrones} DRONES AVAILABLE`);
    }

    public loadCourse(_mapId: string, totalTargets: number = 6, totalDrones: number = 8): void {
        this.startMission(totalTargets, totalDrones);
    }

    public recordKamikazeStrike(
        destroyedTargets: BaseEntity[],
        totalDestroyedHostiles: number,
        impactReason: string
    ): KamikazeMissionStats {
        this.dronesRemaining = Math.max(0, this.dronesRemaining - 1);
        this.targetsHit = Math.min(this.totalTargets, totalDestroyedHostiles);

        if (destroyedTargets.length > 0) {
            this.lastStrikeSuccess = true;
            const pointsEarned = destroyedTargets.reduce(
                (sum, ent) => sum + (ent.type === 'TANK' ? 150 : 100),
                0
            );
            this.score += pointsEarned;
            const targetNames = destroyedTargets.map(t => t.roleName.toUpperCase()).join(', ');
            this.lastStrikeTitle = `🎯 TARGET HIT — KAMIKAZE STRIKE SUCCESS!`;
            this.lastStrikeDetail = `DESTROYED: ${targetNames} (+${pointsEarned} PTS) • [${this.targetsHit}/${this.totalTargets} TARGETS]`;
            this.showNotification(`🎯 STRIKE SUCCESS: ${targetNames} DESTROYED! (${this.targetsHit}/${this.totalTargets})`);
        } else {
            this.lastStrikeSuccess = false;
            this.lastStrikeTitle = `💥 KAMIKAZE DRONE LOST — TARGET MISSED`;
            this.lastStrikeDetail = `IMPACTED: ${impactReason.toUpperCase()} • [${this.dronesRemaining}/${this.totalDrones} DRONES LEFT]`;
            this.showNotification(`💥 DRONE DESTROYED — MISSED TARGET (${this.dronesRemaining} DRONES LEFT)`);
        }

        if (this.targetsHit >= this.totalTargets) {
            this.missionStatus = 'SUCCESS';
            const fleetBonus = this.dronesRemaining * 50;
            this.score += fleetBonus;
            this.lastStrikeTitle = `🏆 MISSION ACCOMPLISHED — ALL ${this.totalTargets} TARGETS DESTROYED!`;
            this.lastStrikeDetail = `FINAL SCORE: ${this.score} PTS • DRONES REMAINING: ${this.dronesRemaining}/${this.totalDrones}`;
            this.showNotification(`🏆 MISSION ACCOMPLISHED! SCORE: ${this.score}`);
        } else if (this.dronesRemaining <= 0) {
            this.missionStatus = 'FAILED';
            this.lastStrikeTitle = `⚠️ MISSION FAILED — OUT OF KAMIKAZE DRONES`;
            this.lastStrikeDetail = `TARGETS DESTROYED: ${this.targetsHit}/${this.totalTargets} • FINAL SCORE: ${this.score} PTS`;
            this.showNotification(`⚠️ MISSION FAILED: OUT OF DRONES (${this.targetsHit}/${this.totalTargets} TARGETS)`);
        } else {
            this.missionStatus = 'ACTIVE';
        }

        return this.getStats();
    }

    public getStats(): KamikazeMissionStats {
        return {
            score: this.score,
            targetsHit: this.targetsHit,
            totalTargets: this.totalTargets,
            dronesRemaining: this.dronesRemaining,
            totalDrones: this.totalDrones,
            missionStatus: this.missionStatus,
            lastStrikeSuccess: this.lastStrikeSuccess,
            lastStrikeTitle: this.lastStrikeTitle,
            lastStrikeDetail: this.lastStrikeDetail,
        };
    }

    public update(_dronePos: [number, number, number], deltaSec: number): void {
        if (this.notificationTimer > 0) {
            this.notificationTimer -= deltaSec;
            if (this.notificationTimer <= 0) {
                this.notificationText = "";
            }
        }
    }

    public showNotification(text: string): void {
        this.notificationText = text;
        this.notificationTimer = 3.5;
    }
}
