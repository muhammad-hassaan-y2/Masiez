declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}

export class SoundManager {
    private ctx?: AudioContext;
    private isMuted = false;
    private initialized = false;
    private paused = false;

    private fanGain?: GainNode;
    private fanFilter?: BiquadFilterNode;

    private masterGain?: GainNode;
    private noiseBuffer?: AudioBuffer;

    constructor() {
        const initOnInteraction = () => {
            if (!this.initialized) this.init();
            window.removeEventListener('keydown', initOnInteraction);
            window.removeEventListener('mousedown', initOnInteraction);
        };
        window.addEventListener('keydown', initOnInteraction);
        window.addEventListener('mousedown', initOnInteraction);
    }

    public init(): void {
        if (this.initialized) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            this.ctx = new AudioCtx();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);

            const bufferSize = this.ctx.sampleRate * 2;
            const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
            this.noiseBuffer = noiseBuffer;

            const whiteNoise = this.ctx.createBufferSource();
            whiteNoise.buffer = noiseBuffer;
            whiteNoise.loop = true;

            this.fanFilter = this.ctx.createBiquadFilter();
            this.fanFilter.type = 'bandpass';
            this.fanFilter.frequency.setValueAtTime(300, this.ctx.currentTime);
            this.fanFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

            this.fanGain = this.ctx.createGain();
            this.fanGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
            this.fanGain.gain.linearRampToValueAtTime(0.55, this.ctx.currentTime + 0.8);

            whiteNoise.connect(this.fanFilter);
            this.fanFilter.connect(this.fanGain);
            this.fanGain.connect(this.masterGain);
            whiteNoise.start();

            this.initialized = true;

            if (this.paused && this.ctx.state === 'running') {
                this.ctx.suspend();
            }
        } catch (e) {
            console.warn("Web Audio API initialization failed:", e);
        }
    }

    public update(motorRpms: [number, number, number, number], rotorOn: boolean): void {
        if (!this.ctx || !this.initialized) return;
        if (this.paused) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const now = this.ctx.currentTime;
        if (!rotorOn) {
            this.fanGain?.gain.setTargetAtTime(0.0, now, 0.03);
            return;
        }

        const avgRpm = (motorRpms[0] + motorRpms[1] + motorRpms[2] + motorRpms[3]) * 0.25;
        const rpmNorm = Math.min(1.0, Math.max(0.0, avgRpm / 1200.0));
        const rotorFreq = 300 + rpmNorm * 400;

        this.fanFilter?.frequency.setTargetAtTime(rotorFreq, now, 0.06);
        this.fanGain?.gain.setTargetAtTime(0.55, now, 0.1);
    }

    public toggleMute(): boolean {
        this.isMuted = !this.isMuted;
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setValueAtTime(this.isMuted ? 0.0 : 0.25, this.ctx.currentTime);
        }
        return this.isMuted;
    }

    public setPaused(paused: boolean): void {
        this.paused = paused;
        if (!this.ctx || !this.initialized) return;
        if (paused) {
            if (this.ctx.state === 'running') this.ctx.suspend();
        } else if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    public getMuted(): boolean {
        return this.isMuted;
    }
}
