import { Scene, MeshBuilder, StandardMaterial, Color3, PhysicsImpostor, Ray, Vector3, DynamicTexture, Mesh } from '@babylonjs/core';

export class Terrain {
    public mesh: Mesh;
    private scene: Scene;

    constructor(scene: Scene) {
        this.scene = scene;
        
        // Create procedurally generated heightmap using displacement
        this.mesh = MeshBuilder.CreateGround("terrain", { width: 1000, height: 1000, subdivisions: 256 }, scene);
        
        const material = new StandardMaterial("terrainMat", scene);
        material.diffuseColor = new Color3(0.3, 0.5, 0.2); // grass-like
        this.mesh.material = material;

        // Apply random displacement for terrain height
        const positions = this.mesh.getVerticesData("position");
        if (positions) {
            for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i];
                const z = positions[i + 2];
                // Simple pseudo-noise based on sin/cos
                const y = Math.sin(x / 50) * Math.cos(z / 50) * 10 + Math.sin(x / 10 + z / 20) * 2;
                positions[i + 1] = y;
            }
            this.mesh.setVerticesData("position", positions);
        }

        // Enable physics
        if (scene.isPhysicsEnabled()) {
            this.mesh.physicsImpostor = new PhysicsImpostor(this.mesh, PhysicsImpostor.HeightmapImpostor, { mass: 0 }, scene);
        }
    }

    public getHeightAtPoint(x: number, z: number): number {
        const ray = new Ray(new Vector3(x, 1000, z), new Vector3(0, -1, 0), 2000);
        const pick = this.scene.pickWithRay(ray, (m) => m === this.mesh);
        if (pick && pick.hit && pick.pickedPoint) {
            return pick.pickedPoint.y;
        }
        return 0;
    }
}
