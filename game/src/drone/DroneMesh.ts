import { Scene, MeshBuilder, StandardMaterial, Color3, TransformNode, Mesh } from '@babylonjs/core';

export class DroneMesh {
    private root: TransformNode;
    private propellers: Mesh[] = [];
    private ledMaterial: StandardMaterial;
    private gimbal: TransformNode;

    constructor(scene: Scene) {
        this.root = new TransformNode("drone_root", scene);

        const chassisMaterial = new StandardMaterial("chassisMat", scene);
        chassisMaterial.diffuseColor = new Color3(0.2, 0.2, 0.2);

        // Chassis
        const chassis = MeshBuilder.CreateBox("chassis", { width: 0.3, height: 0.05, depth: 0.3 }, scene);
        chassis.material = chassisMaterial;
        chassis.parent = this.root;

        // Arms and Motors
        const armLength = 0.25;
        const positions = [
            { x: 1, z: 1 }, // Front-Right
            { x: -1, z: 1 }, // Front-Left
            { x: 1, z: -1 }, // Rear-Right
            { x: -1, z: -1 } // Rear-Left
        ];

        const motorMaterial = new StandardMaterial("motorMat", scene);
        motorMaterial.diffuseColor = new Color3(0.1, 0.1, 0.1);

        const propRedMaterial = new StandardMaterial("propRedMat", scene);
        propRedMaterial.diffuseColor = new Color3(0.8, 0.1, 0.1);
        const propBlackMaterial = new StandardMaterial("propBlackMat", scene);
        propBlackMaterial.diffuseColor = new Color3(0.1, 0.1, 0.1);

        positions.forEach((pos, index) => {
            // Arm
            const arm = MeshBuilder.CreateBox(`arm_${index}`, { width: 0.02, height: 0.02, depth: armLength }, scene);
            arm.material = chassisMaterial;
            arm.position.x = pos.x * armLength / 2;
            arm.position.z = pos.z * armLength / 2;
            // Rotate arm to diagonal
            arm.rotation.y = Math.atan2(pos.x, pos.z);
            arm.parent = this.root;

            // Motor
            const motor = MeshBuilder.CreateCylinder(`motor_${index}`, { height: 0.04, diameter: 0.03 }, scene);
            motor.material = motorMaterial;
            motor.position.x = pos.x * armLength;
            motor.position.z = pos.z * armLength;
            motor.position.y = 0.02;
            motor.parent = this.root;

            // Propeller
            const prop = MeshBuilder.CreateBox(`prop_${index}`, { width: 0.2, height: 0.005, depth: 0.02 }, scene);
            prop.material = index < 2 ? propRedMaterial : propBlackMaterial; // Red for front, black for rear
            prop.position.y = 0.02;
            prop.parent = motor;
            this.propellers.push(prop);
        });

        // LED
        const led = MeshBuilder.CreateSphere("led", { diameter: 0.04 }, scene);
        this.ledMaterial = new StandardMaterial("ledMat", scene);
        this.ledMaterial.emissiveColor = new Color3(1, 0, 0); // Red by default (disarmed)
        led.material = this.ledMaterial;
        led.position.y = 0.04;
        led.parent = this.root;

        // Gimbal
        this.gimbal = new TransformNode("gimbal", scene);
        this.gimbal.position.y = -0.05;
        this.gimbal.position.z = 0.1;
        this.gimbal.parent = this.root;
    }

    public updatePropellerSpin(rpms: number[]): void {
        for (let i = 0; i < 4; i++) {
            // Spin CW or CCW based on index
            const direction = (i === 0 || i === 3) ? -1 : 1;
            // Convert RPM to radians per frame (approximate visual effect)
            this.propellers[i].rotation.y += direction * (rpms[i] / 60) * Math.PI * 0.1; 
        }
    }

    public setArmedVisual(armed: boolean): void {
        if (armed) {
            this.ledMaterial.emissiveColor = new Color3(0, 1, 0); // Green
        } else {
            this.ledMaterial.emissiveColor = new Color3(1, 0, 0); // Red
        }
    }

    public getGimbalNode(): TransformNode {
        return this.gimbal;
    }

    public getRootNode(): TransformNode {
        return this.root;
    }

    public dispose(): void {
        this.root.dispose();
    }
}
