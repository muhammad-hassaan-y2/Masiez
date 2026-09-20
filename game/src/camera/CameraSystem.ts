import { Scene, ArcRotateCamera, FreeCamera, Vector3, RenderTargetTexture, TransformNode } from '@babylonjs/core';

export class CameraSystem {
    private observerCamera: ArcRotateCamera;
    private fpvCamera: FreeCamera;
    private minimapCamera: FreeCamera;
    
    private fpvTexture: RenderTargetTexture;
    private minimapTexture: RenderTargetTexture;
    
    private followMode: boolean = true;
    private scene: Scene;

    constructor(scene: Scene, canvas: HTMLCanvasElement, gimbalNode: TransformNode) {
        this.scene = scene;

        // Observer Camera (ArcRotate)
        this.observerCamera = new ArcRotateCamera("observerCam", Math.PI / 2, Math.PI / 2.5, 10, Vector3.Zero(), scene);
        this.observerCamera.attachControl(canvas, true);
        this.observerCamera.wheelPrecision = 50;

        // FPV Camera
        this.fpvCamera = new FreeCamera("fpvCam", Vector3.Zero(), scene);
        this.fpvCamera.parent = gimbalNode;
        this.fpvCamera.fov = 90 * Math.PI / 180;
        
        this.fpvTexture = new RenderTargetTexture("fpvTex", { width: 640, height: 480 }, scene);
        this.scene.customRenderTargets.push(this.fpvTexture);
        this.fpvTexture.activeCamera = this.fpvCamera;
        this.scene.meshes.forEach(m => this.fpvTexture.renderList?.push(m));

        // Minimap Camera
        this.minimapCamera = new FreeCamera("minimapCam", new Vector3(0, 100, 0), scene);
        this.minimapCamera.mode = FreeCamera.ORTHOGRAPHIC_CAMERA;
        this.minimapCamera.setTarget(Vector3.Zero());
        
        const minimapSize = 200;
        this.minimapCamera.orthoLeft = -minimapSize;
        this.minimapCamera.orthoRight = minimapSize;
        this.minimapCamera.orthoTop = minimapSize;
        this.minimapCamera.orthoBottom = -minimapSize;

        this.minimapTexture = new RenderTargetTexture("minimapTex", { width: 256, height: 256 }, scene);
        this.scene.customRenderTargets.push(this.minimapTexture);
        this.minimapTexture.activeCamera = this.minimapCamera;
        this.scene.meshes.forEach(m => this.minimapTexture.renderList?.push(m));

        // Set default active camera
        scene.activeCamera = this.observerCamera;
    }

    public getObserverCamera(): ArcRotateCamera {
        return this.observerCamera;
    }

    public getFPVTexture(): RenderTargetTexture {
        return this.fpvTexture;
    }

    public getMinimapTexture(): RenderTargetTexture {
        return this.minimapTexture;
    }

    public setGimbal(pitch: number, yaw: number): void {
        this.fpvCamera.rotation.x = pitch * Math.PI / 180;
        this.fpvCamera.rotation.y = yaw * Math.PI / 180;
    }

    public setFollowMode(enabled: boolean): void {
        this.followMode = enabled;
    }

    public update(dronePosition: Vector3): void {
        if (this.followMode) {
            // Smoothly move target to drone position
            this.observerCamera.target = Vector3.Lerp(this.observerCamera.target, dronePosition, 0.1);
        }
        
        // Update minimap position to follow drone X/Z
        this.minimapCamera.position.x = dronePosition.x;
        this.minimapCamera.position.z = dronePosition.z;
    }

    public addMeshToRenderTargets(mesh: any): void {
        this.fpvTexture.renderList?.push(mesh);
        this.minimapTexture.renderList?.push(mesh);
    }
}
