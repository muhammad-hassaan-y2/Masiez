export class Mat4 {
    public static create(): Float32Array {
        const out = new Float32Array(16);
        out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
        return out;
    }

    public static perspective(out: Float32Array, fovRad: number, aspect: number, near: number, far: number): Float32Array {
        const f = 1.0 / Math.tan(fovRad / 2);
        const nf = 1 / (near - far);
        out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
        out[8] = 0; out[9] = 0; out[10] = far * nf; out[11] = -1;
        out[12] = 0; out[13] = 0; out[14] = (far * near) * nf; out[15] = 0;
        return out;
    }

    public static lookAt(out: Float32Array, eye: [number, number, number], center: [number, number, number], up: [number, number, number]): Float32Array {
        let z0 = eye[0] - center[0];
        let z1 = eye[1] - center[1];
        let z2 = eye[2] - center[2];
        let len = 1 / Math.hypot(z0, z1, z2);
        z0 *= len; z1 *= len; z2 *= len;

        let x0 = up[1] * z2 - up[2] * z1;
        let x1 = up[2] * z0 - up[0] * z2;
        let x2 = up[0] * z1 - up[1] * z0;
        len = Math.hypot(x0, x1, x2);
        if (!len) {
            x0 = 0; x1 = 0; x2 = 0;
        } else {
            len = 1 / len;
            x0 *= len; x1 *= len; x2 *= len;
        }

        let y0 = z1 * x2 - z2 * x1;
        let y1 = z2 * x0 - z0 * x2;
        let y2 = z0 * x1 - z1 * x0;

        // Column 0
        out[0] = x0;
        out[1] = x1;
        out[2] = x2;
        out[3] = 0;

        // Column 1
        out[4] = y0;
        out[5] = y1;
        out[6] = y2;
        out[7] = 0;

        // Column 2
        out[8] = z0;
        out[9] = z1;
        out[10] = z2;
        out[11] = 0;

        // Column 3
        out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
        out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
        out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
        out[15] = 1;
        return out;
    }

    public static multiply(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
        for (let i = 0; i < 4; ++i) {
            const ai0 = a[i], ai1 = a[i + 4], ai2 = a[i + 8], ai3 = a[i + 12];
            out[i]      = ai0 * b[0]  + ai1 * b[1]  + ai2 * b[2]  + ai3 * b[3];
            out[i + 4]  = ai0 * b[4]  + ai1 * b[5]  + ai2 * b[6]  + ai3 * b[7];
            out[i + 8]  = ai0 * b[8]  + ai1 * b[9]  + ai2 * b[10] + ai3 * b[11];
            out[i + 12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
        }
        return out;
    }

    public static invert(out: Float32Array, a: Float32Array): Float32Array {
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

        const b00 = a00 * a11 - a01 * a10;
        const b01 = a00 * a12 - a02 * a10;
        const b02 = a00 * a13 - a03 * a10;
        const b03 = a01 * a12 - a02 * a11;
        const b04 = a01 * a13 - a03 * a11;
        const b05 = a02 * a13 - a03 * a12;
        const b06 = a20 * a31 - a21 * a30;
        const b07 = a20 * a32 - a22 * a30;
        const b08 = a20 * a33 - a23 * a30;
        const b09 = a21 * a32 - a22 * a31;
        const b10 = a21 * a33 - a23 * a31;
        const b11 = a22 * a33 - a23 * a32;

        let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
        if (!det) return out;
        det = 1.0 / det;

        out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
        out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
        out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
        out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
        out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
        out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
        out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
        out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
        out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
        out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
        out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
        out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
        out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
        out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
        out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
        out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
        return out;
    }
}

export function getTerrainHeight(px: number, pz: number): number {
    const dist = Math.hypot(px, pz);
    const airfieldBlend = Math.max(0.0, Math.min(1.0, (dist - 40.0) / 50.0));
    if (airfieldBlend <= 0.0) {
        return 0.0;
    }
    const h1 = Math.sin(px * 0.012 + 0.4) * Math.cos(pz * 0.012 + 0.6) * 22.0;
    const h2 = Math.sin(px * 0.024 + pz * 0.016) * 10.0;
    const h3 = Math.sin(px * 0.005 - 1.0) * Math.cos(pz * 0.006 + 0.5) * 28.0;
    const h4 = Math.sin(px * 0.05 + pz * 0.035) * 2.0;
    const rawHeight = h1 + h2 + h3 + h4 + 14.0;
    return Math.max(0.0, rawHeight * airfieldBlend);
}

export class Camera {
    public position: [number, number, number] = [0, 5, 8];
    public target: [number, number, number] = [0, 1, 0];
    public viewMatrix = Mat4.create();
    public projMatrix = Mat4.create();
    public viewProjMatrix = Mat4.create();
    public invViewProjMatrix = Mat4.create();

    public fovRad: number = Math.PI / 3.0;
    public mode: 'CHASE' | 'FPV' | 'ORBIT' = 'CHASE';

    // Interactive mouse look offsets
    public mouseOrbitYaw: number = 0;   // radians
    public mouseOrbitPitch: number = 0.28; // radians (~16 deg down, perfect angle for viewing drone & horizon)
    public baseDistance: number = 3.5; // Closer, crisp view of the custom drone

    private initialized: boolean = false;

    public applyMouseDelta(dx: number, dy: number, zoomDelta: number): void {
        const sensitivity = 0.0035;
        this.mouseOrbitYaw += dx * sensitivity;
        this.mouseOrbitPitch += dy * sensitivity;

        // Clamp pitch to avoid gimbal flipping (-85 deg to +85 deg)
        this.mouseOrbitPitch = Math.max(-1.4, Math.min(1.4, this.mouseOrbitPitch));
        this.baseDistance = Math.max(1.5, Math.min(20.0, this.baseDistance + zoomDelta));
    }

    public update(dronePos: [number, number, number], droneYawDeg: number, aspect: number): void {
        if (this.mode === 'CHASE') {
            const distHoriz = this.baseDistance * Math.cos(this.mouseOrbitPitch);
            const distVert  = this.baseDistance * Math.sin(this.mouseOrbitPitch);

            const targetX = dronePos[0] - Math.sin(this.mouseOrbitYaw) * distHoriz;
            const targetZ = dronePos[2] - Math.cos(this.mouseOrbitYaw) * distHoriz;

            // Ground height under candidate camera position
            const camGroundY = getTerrainHeight(targetX, targetZ);
            // Minimum camera Y is 0.7m above terrain to prevent clipping into hills or ground
            const targetY = Math.max(camGroundY + 0.7, dronePos[1] + distVert);

            if (!this.initialized) {
                this.position[0] = targetX;
                this.position[1] = targetY;
                this.position[2] = targetZ;
                this.initialized = true;
            } else {
                // Smooth responsive camera follow
                const followSpeed = 0.45;
                this.position[0] += (targetX - this.position[0]) * followSpeed;
                this.position[1] += (targetY - this.position[1]) * followSpeed;
                this.position[2] += (targetZ - this.position[2]) * followSpeed;
            }

            // Guarantee camera never penetrates ground after interpolation
            const actualGroundY = getTerrainHeight(this.position[0], this.position[2]);
            this.position[1] = Math.max(actualGroundY + 0.7, this.position[1]);

            // Keep view strictly centered on the drone
            this.target[0] = dronePos[0];
            this.target[1] = dronePos[1] + 0.15;
            this.target[2] = dronePos[2];
        } else if (this.mode === 'FPV') {
            this.position[0] = dronePos[0];
            this.position[1] = dronePos[1] + 0.15;
            this.position[2] = dronePos[2];

            this.target[0] = dronePos[0] + Math.sin(this.mouseOrbitYaw) * 10.0;
            this.target[1] = dronePos[1] - Math.sin(this.mouseOrbitPitch) * 10.0;
            this.target[2] = dronePos[2] + Math.cos(this.mouseOrbitYaw) * 10.0;
        }

        Mat4.perspective(this.projMatrix, this.fovRad, aspect, 0.1, 2000.0);
        Mat4.lookAt(this.viewMatrix, this.position, this.target, [0, 1, 0]);
        Mat4.multiply(this.viewProjMatrix, this.projMatrix, this.viewMatrix);
        Mat4.invert(this.invViewProjMatrix, this.viewProjMatrix);
    }
}
