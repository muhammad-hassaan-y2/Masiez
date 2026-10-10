export class SoundManager {
    private ctx: AudioContext | null = null;
    private isMuted: boolean = false;
    private initialized: boolean = false;

    // Engine sound nodes
    private motorOsc1: OscillatorNode | null = null;
    private motorOsc2: OscillatorNode | null = null;
    private motorGain: GainNode | null = null;
    private motorFilter: BiquadFilterNode | null = null;

    // Wind rush sound nodes
    private windGain: GainNode | null = null;
    private windFilter: BiquadFilterNode | null = null;

    // Master volume
    private masterGain: GainNode | null = null;

    constructor() {
        // AudioContext will be initialized on first user interaction (browser policy)
        const initOnInteraction = () => {
            if (!this.initialized) {
                this.init();
            }
            window.removeEventListener('keydown', initOnInteraction);
            window.removeEventListener('mousedown', initOnInteraction);
        };
        window.addEventListener('keydown', initOnInteraction);
        window.addEventListener('mousedown', initOnInteraction);
    }

    public init(): void {
        if (this.initialized) return;
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            this.ctx = new AudioCtx();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);

            // 1. Dual Motor Engine Synthesizer
            this.motorFilter = this.ctx.createBiquadFilter();
            this.motorFilter.type = 'lowpass';
            this.motorFilter.frequency.setValueAtTime(800, this.ctx.currentTime);

            this.motorGain = this.ctx.createGain();
            this.motorGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

            // Motor Osc 1: Low-frequency quadcopter body vibration
            this.motorOsc1 = this.ctx.createOscillator();
            this.motorOsc1.type = 'sawtooth';
            this.motorOsc1.frequency.setValueAtTime(65, this.ctx.currentTime);

            // Motor Osc 2: High-RPM propeller blade aerodynamic whine
            this.motorOsc2 = this.ctx.createOscillator();
            this.motorOsc2.type = 'triangle';
            this.motorOsc2.frequency.setValueAtTime(140, this.ctx.currentTime);

            this.motorOsc1.connect(this.motorFilter);
            this.motorOsc2.connect(this.motorFilter);
            this.motorFilter.connect(this.motorGain);
            this.motorGain.connect(this.masterGain);

            this.motorOsc1.start();
            this.motorOsc2.start();

            // 2. Procedural Wind Rush Synthesizer (White Noise Buffer)
            const bufferSize = this.ctx.sampleRate * 2;
            const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }

            const whiteNoise = this.ctx.createBufferSource();
            whiteNoise.buffer = noiseBuffer;
            whiteNoise.loop = true;

            this.windFilter = this.ctx.createBiquadFilter();
            this.windFilter.type = 'bandpass';
            this.windFilter.frequency.setValueAtTime(400, this.ctx.currentTime);
            this.windFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

            this.windGain = this.ctx.createGain();
            this.windGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

            whiteNoise.connect(this.windFilter);
            this.windFilter.connect(this.windGain);
            this.windGain.connect(this.masterGain);

            whiteNoise.start();

            this.initialized = true;
            console.log("SoundManager audio synthesizer active.");
        } catch (e) {
            console.warn("Web Audio API initialization failed:", e);
        }
    }

    public update(
        isArmed: boolean,
        motorRpms: [number, number, number, number],
        groundSpeed: number,
        verticalSpeed: number
    ): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;

        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const now = this.ctx.currentTime;
        const avgRpm = (motorRpms[0] + motorRpms[1] + motorRpms[2] + motorRpms[3]) * 0.25;
        const rpmNorm = Math.min(1.0, Math.max(0.0, avgRpm / 12000.0));

        if (!isArmed) {
            // Smoothly silence engine when disarmed
            this.motorGain?.gain.setTargetAtTime(0.0, now, 0.15);
            this.windGain?.gain.setTargetAtTime(0.0, now, 0.2);
            return;
        }

        // Engine Pitch Modulation
        const baseFreq1 = 60 + rpmNorm * 110;  // 60Hz to 170Hz
        const baseFreq2 = 130 + rpmNorm * 260; // 130Hz to 390Hz
        this.motorOsc1?.frequency.setTargetAtTime(baseFreq1, now, 0.08);
        this.motorOsc2?.frequency.setTargetAtTime(baseFreq2, now, 0.08);

        // Filter cutoff opens up as throttle increases
        const cutoff = 600 + rpmNorm * 1800;
        this.motorFilter?.frequency.setTargetAtTime(cutoff, now, 0.08);

        // Engine volume: idle hum up to vigorous high-speed roar
        const engineVol = 0.18 + rpmNorm * 0.45;
        this.motorGain?.gain.setTargetAtTime(engineVol, now, 0.08);

        // Wind Rush volume: increases with total airspeed
        const speedMagnitude = Math.sqrt(groundSpeed * groundSpeed + verticalSpeed * verticalSpeed);
        const speedNorm = Math.min(1.0, speedMagnitude / 55.0);
        const windVol = speedNorm * 0.35;
        const windFreq = 250 + speedNorm * 800;

        this.windGain?.gain.setTargetAtTime(windVol, now, 0.12);
        this.windFilter?.frequency.setTargetAtTime(windFreq, now, 0.12);
    }

    public playCheckpointChime(): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;

        // Dual-tone harmonic crystal chime
        const playTone = (freq: number, startDelay: number, duration: number) => {
            if (!this.ctx || !this.masterGain) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + startDelay);

            gain.gain.setValueAtTime(0.0, now + startDelay);
            gain.gain.linearRampToValueAtTime(0.35, now + startDelay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + startDelay + duration);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now + startDelay);
            osc.stop(now + startDelay + duration);
        };

        playTone(587.33, 0.00, 0.30); // D5
        playTone(880.00, 0.08, 0.45); // A5
        playTone(1174.66, 0.16, 0.60); // D6
    }

    public playSpeedModeChime(modeName: string): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        const startFreq = modeName === 'TURBO' ? 440 : (modeName === 'SPORT' ? 330 : 260);
        const endFreq = modeName === 'TURBO' ? 880 : (modeName === 'SPORT' ? 520 : 390);

        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.18);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.22);
    }

    public playLapCompleteChime(): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const chords = [523.25, 659.25, 783.99, 1046.50]; // C Major arpeggio
        chords.forEach((freq, idx) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.07);
            gain.gain.setValueAtTime(0.3, now + idx * 0.07);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.5);
            osc.connect(gain);
            gain.connect(this.masterGain!);
            osc.start(now + idx * 0.07);
            osc.stop(now + idx * 0.07 + 0.5);
        });
    }

    public playLaserShot(): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(960, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.12);
    }

    public playImpact(): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.15);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.15);
    }

    public playThud(): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    public playExplosion(): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.5);

        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.5);
    }

    public playCrash(): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;

        // 1. Harsh metallic impact and airframe crunch
        const crunchOsc = this.ctx.createOscillator();
        const crunchGain = this.ctx.createGain();
        crunchOsc.type = 'sawtooth';
        crunchOsc.frequency.setValueAtTime(340, now);
        crunchOsc.frequency.exponentialRampToValueAtTime(35, now + 0.4);

        crunchGain.gain.setValueAtTime(0.55, now);
        crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        crunchOsc.connect(crunchGain);
        if (this.masterGain) crunchGain.connect(this.masterGain);
        crunchOsc.start(now);
        crunchOsc.stop(now + 0.4);

        // 2. Heavy sub-bass hull destruction boom
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(150, now);
        subOsc.frequency.exponentialRampToValueAtTime(22, now + 0.65);

        subGain.gain.setValueAtTime(0.65, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        subOsc.connect(subGain);
        if (this.masterGain) subGain.connect(this.masterGain);
        subOsc.start(now);
        subOsc.stop(now + 0.65);
    }

    public playTargetAcquired(): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1174, now + 0.05);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    public playTargetLocked(): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        [0, 0.08].forEach((offset) => {
            const osc = this.ctx!.createOscillator();
            const gain = this.ctx!.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(1320, now + offset);
            gain.gain.setValueAtTime(0.28, now + offset);
            gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);
            osc.connect(gain);
            if (this.masterGain) gain.connect(this.masterGain);
            osc.start(now + offset);
            osc.stop(now + offset + 0.07);
        });
    }

    public playLockLost(): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.16);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.16);
    }

    public playScopeZoom(gear: number = 1): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const baseF = 440 + gear * 150;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(baseF, now);
        osc.frequency.exponentialRampToValueAtTime(baseF * 1.6, now + 0.06);

        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        osc.connect(gain);
        if (this.masterGain) gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.06);
    }

    public playRailgunShot(): void {
        if (!this.ctx || !this.initialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        // Deep kinetic kick
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(140, now);
        osc1.frequency.exponentialRampToValueAtTime(30, now + 0.28);
        gain1.gain.setValueAtTime(0.45, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc1.connect(gain1);
        if (this.masterGain) gain1.connect(this.masterGain);
        osc1.start(now);
        osc1.stop(now + 0.28);

        // High frequency electric discharge
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1800, now);
        osc2.frequency.exponentialRampToValueAtTime(400, now + 0.18);
        gain2.gain.setValueAtTime(0.3, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc2.connect(gain2);
        if (this.masterGain) gain2.connect(this.masterGain);
        osc2.start(now);
        osc2.stop(now + 0.18);
    }

    public toggleMute(): boolean {
        this.isMuted = !this.isMuted;
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0 : 0.25, this.ctx.currentTime);
        }
        return this.isMuted;
    }

    public getMuted(): boolean {
        return this.isMuted;
    }
}
