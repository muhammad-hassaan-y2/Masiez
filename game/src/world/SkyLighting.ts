import { Scene, HemisphericLight, DirectionalLight, Vector3, ShadowGenerator, MeshBuilder, StandardMaterial, Color3, Mesh, AbstractMesh } from '@babylonjs/core';

export class SkyLighting {
    private ambientLight: HemisphericLight;
    public sunLight: DirectionalLight;
    private shadowGenerator: ShadowGenerator;
    private skybox: Mesh;

    constructor(scene: Scene) {
        // Ambient Light
        this.ambientLight = new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene);
        this.ambientLight.intensity = 0.4;

        // Sun Light
        this.sunLight = new DirectionalLight("sunLight", new Vector3(-1, -2, -1), scene);
        this.sunLight.intensity = 0.8;
        this.sunLight.position = new Vector3(100, 200, 100); // Set position for shadows

        // Shadows
        this.shadowGenerator = new ShadowGenerator(2048, this.sunLight);
        this.shadowGenerator.useBlurExponentialShadowMap = true;
        this.shadowGenerator.blurKernel = 32;

        // Skybox
        this.skybox = MeshBuilder.CreateBox("skyBox", { size: 5000.0 }, scene);
        const skyboxMaterial = new StandardMaterial("skyBoxMat", scene);
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.emissiveColor = new Color3(0.5, 0.7, 1.0); // sky blue
        skyboxMaterial.disableLighting = true;
        this.skybox.material = skyboxMaterial;
    }

    public addShadowCaster(mesh: AbstractMesh): void {
        this.shadowGenerator.addShadowCaster(mesh);
        mesh.receiveShadows = true;
    }

    public setSunPosition(azimuth: number, elevation: number): void {
        // Calculate direction based on azimuth and elevation
        const azRad = azimuth * Math.PI / 180;
        const elRad = elevation * Math.PI / 180;
        
        const x = Math.cos(elRad) * Math.sin(azRad);
        const y = -Math.sin(elRad); // negative because light points downwards
        const z = Math.cos(elRad) * Math.cos(azRad);

        this.sunLight.direction = new Vector3(x, y, z);
    }
}
