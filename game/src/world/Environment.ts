import { Scene, MeshBuilder, StandardMaterial, Color3, PhysicsImpostor, Mesh, Vector3 } from '@babylonjs/core';
import { Terrain } from './Terrain';

export class Environment {
    public buildings: Mesh[] = [];
    public trees: Mesh[] = [];

    constructor(scene: Scene, terrain: Terrain) {
        this.createBuildings(scene, terrain);
        this.createTrees(scene, terrain);
    }

    private createBuildings(scene: Scene, terrain: Terrain): void {
        const buildingMaterial = new StandardMaterial("buildingMat", scene);
        buildingMaterial.diffuseColor = new Color3(0.6, 0.6, 0.6);

        const numBuildings = 15 + Math.floor(Math.random() * 11); // 15-25

        for (let i = 0; i < numBuildings; i++) {
            const width = 10 + Math.random() * 10;
            const depth = 10 + Math.random() * 10;
            const height = 5 + Math.random() * 25;

            const building = MeshBuilder.CreateBox(`building_${i}`, { width, height, depth }, scene);
            building.material = buildingMaterial;

            const x = (Math.random() - 0.5) * 800;
            const z = (Math.random() - 0.5) * 800;
            const y = terrain.getHeightAtPoint(x, z) + height / 2;

            building.position = new Vector3(x, y, z);
            
            if (scene.isPhysicsEnabled()) {
                building.physicsImpostor = new PhysicsImpostor(building, PhysicsImpostor.BoxImpostor, { mass: 0 }, scene);
            }

            this.buildings.push(building);
        }
    }

    private createTrees(scene: Scene, terrain: Terrain): void {
        const trunkMaterial = new StandardMaterial("trunkMat", scene);
        trunkMaterial.diffuseColor = new Color3(0.4, 0.2, 0.0);

        const canopyMaterial = new StandardMaterial("canopyMat", scene);
        canopyMaterial.diffuseColor = new Color3(0.1, 0.6, 0.1);

        const numTrees = 30 + Math.floor(Math.random() * 21); // 30-50

        for (let i = 0; i < numTrees; i++) {
            const trunkHeight = 2 + Math.random() * 3;
            const trunk = MeshBuilder.CreateCylinder(`trunk_${i}`, { height: trunkHeight, diameter: 0.5 }, scene);
            trunk.material = trunkMaterial;

            const canopy = MeshBuilder.CreateSphere(`canopy_${i}`, { diameter: 3 + Math.random() * 2 }, scene);
            canopy.material = canopyMaterial;
            canopy.position.y = trunkHeight / 2 + 1;
            canopy.parent = trunk;

            const x = (Math.random() - 0.5) * 900;
            const z = (Math.random() - 0.5) * 900;
            const y = terrain.getHeightAtPoint(x, z) + trunkHeight / 2;

            trunk.position = new Vector3(x, y, z);
            
            // Note: simple physics for trees (just the trunk)
            if (scene.isPhysicsEnabled()) {
                trunk.physicsImpostor = new PhysicsImpostor(trunk, PhysicsImpostor.CylinderImpostor, { mass: 0 }, scene);
            }

            this.trees.push(trunk);
        }
    }
}
