import { Engine as BabylonEngine, WebGPUEngine, Scene, Vector3, HavokPlugin } from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';

/**
 * Initializes Babylon.js with WebGPU (or WebGL fallback).
 * Creates the scene and enables Havok physics.
 */
export class Engine {
    public canvas: HTMLCanvasElement;
    public engine: BabylonEngine;
    public scene: Scene;

    constructor() {
        this.canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error("Canvas 'renderCanvas' not found");
        }
        // Initialize with default engine for now, upgraded to WebGPU in initAsync
        this.engine = new BabylonEngine(this.canvas, true, { adaptToDeviceRatio: true });
        this.scene = new Scene(this.engine);
    }

    public async initAsync(): Promise<void> {
        const webgpuSupported = await WebGPUEngine.IsSupportedAsync;
        if (webgpuSupported) {
            console.log("Initializing WebGPU Engine");
            this.engine.dispose(); // Dispose WebGL engine
            const webgpuEngine = new WebGPUEngine(this.canvas, { adaptToDeviceRatio: true });
            await webgpuEngine.initAsync();
            this.engine = webgpuEngine as unknown as BabylonEngine;
            this.scene = new Scene(this.engine);
        } else {
            console.warn("WebGPU not supported, falling back to WebGL2");
        }

        // Initialize Havok Physics
        try {
            const havokInstance = await HavokPhysics();
            const havokPlugin = new HavokPlugin(true, havokInstance);
            this.scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);
        } catch (e) {
            console.warn("Havok physics failed to load.", e);
        }

        // Handle window resize
        window.addEventListener('resize', () => {
            this.engine.resize();
        });
    }

    public runRenderLoop(callback: () => void): void {
        this.engine.runRenderLoop(() => {
            callback();
            this.scene.render();
        });
    }

    public dispose(): void {
        this.scene.dispose();
        this.engine.dispose();
    }
}
