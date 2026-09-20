import { GPUDeviceContext } from './Device';
import { Camera, Mat4 } from '../scene/Camera';
import modelShaderCode from '../shaders/model.wgsl?raw';

interface PrimitiveMesh {
    vertexBuffer: GPUBuffer;
    indexBuffer?: GPUBuffer;
    indexCount: number;
    vertexCount: number;
    baseColorFactor: [number, number, number, number];
    bindGroup?: GPUBindGroup;
}

export class ModelRenderer {
    private ctx: GPUDeviceContext;
    private pipeline!: GPURenderPipeline;
    private sampler!: GPUSampler;
    private uniformBuffer!: GPUBuffer;
    private defaultTexture!: GPUTexture;

    private primitives: PrimitiveMesh[] = [];

    constructor(ctx: GPUDeviceContext) {
        this.ctx = ctx;
    }

    public async init(): Promise<void> {
        const device = this.ctx.device;

        this.uniformBuffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // 1x1 white default texture
        this.defaultTexture = device.createTexture({
            size: [1, 1, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture(
            { texture: this.defaultTexture },
            new Uint8Array([255, 255, 255, 255]),
            { bytesPerRow: 4 },
            [1, 1]
        );

        this.sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });

        const shaderModule = device.createShaderModule({ code: modelShaderCode });

        this.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 8 * 4, // pos: 3, normal: 3, uv: 2
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },
                        { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' },
                        { shaderLocation: 2, offset: 6 * 4, format: 'float32x2' },
                    ],
                }],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format: this.ctx.format }],
            },
            primitive: { topology: 'triangle-list', cullMode: 'none' },
            depthStencil: {
                format: this.ctx.depthFormat,
                depthWriteEnabled: true,
                depthCompare: 'less-equal',
            },
        });

        // Create fallback procedural drone box & rotor geometry
        this.createFallbackDrone();
    }

    private createFallbackDrone(): void {
        // Simple procedural quadcopter mesh as fallback/base
        // Center body + 4 arms + 4 rotors
        const vertices: number[] = [];
        const indices: number[] = [];

        function addBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
            const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
            const startIdx = vertices.length / 8;
            
            // 8 corners
            const corners = [
                [cx - hx, cy - hy, cz - hz],
                [cx + hx, cy - hy, cz - hz],
                [cx + hx, cy + hy, cz - hz],
                [cx - hx, cy + hy, cz - hz],
                [cx - hx, cy - hy, cz + hz],
                [cx + hx, cy - hy, cz + hz],
                [cx + hx, cy + hy, cz + hz],
                [cx - hx, cy + hy, cz + hz],
            ];

            // 6 faces
            const faces = [
                { idx: [0, 1, 2, 3], norm: [0, 0, -1] },
                { idx: [5, 4, 7, 6], norm: [0, 0, 1] },
                { idx: [4, 0, 3, 7], norm: [-1, 0, 0] },
                { idx: [1, 5, 6, 2], norm: [1, 0, 0] },
                { idx: [3, 2, 6, 7], norm: [0, 1, 0] },
                { idx: [4, 5, 1, 0], norm: [0, -1, 0] },
            ];

            let vCount = startIdx;
            for (const face of faces) {
                const base = vCount;
                for (let i = 0; i < 4; ++i) {
                    const c = corners[face.idx[i]];
                    vertices.push(c[0], c[1], c[2], face.norm[0], face.norm[1], face.norm[2], i === 0 || i === 3 ? 0 : 1, i < 2 ? 0 : 1);
                }
                indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
                vCount += 4;
            }
        }

        // Center fuselage
        addBox(0, 0, 0, 0.4, 0.08, 0.4);
        // Diagonal arms
        addBox(0.25, 0.02, 0.25, 0.04, 0.03, 0.4);
        addBox(-0.25, 0.02, 0.25, 0.04, 0.03, 0.4);
        addBox(0.25, 0.02, -0.25, 0.04, 0.03, 0.4);
        addBox(-0.25, 0.02, -0.25, 0.04, 0.03, 0.4);
        // 4 Rotors
        addBox(0.35, 0.05, 0.35, 0.25, 0.01, 0.03);
        addBox(-0.35, 0.05, 0.35, 0.25, 0.01, 0.03);
        addBox(0.35, 0.05, -0.35, 0.25, 0.01, 0.03);
        addBox(-0.35, 0.05, -0.35, 0.25, 0.01, 0.03);

        const vertexBuffer = this.ctx.createBuffer(new Float32Array(vertices), GPUBufferUsage.VERTEX);
        const indexBuffer = this.ctx.createBuffer(new Uint32Array(indices), GPUBufferUsage.INDEX);

        const bindGroup = this.ctx.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: this.defaultTexture.createView() },
                { binding: 2, resource: this.sampler },
            ],
        });

        this.primitives.push({
            vertexBuffer,
            indexBuffer,
            indexCount: indices.length,
            vertexCount: vertices.length / 8,
            baseColorFactor: [0.15, 0.2, 0.25, 1.0],
            bindGroup,
        });
    }

    public async loadGLB(url: string): Promise<boolean> {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`Could not load GLB from ${url}: status ${res.status}`);
                return false;
            }
            const arrayBuffer = await res.arrayBuffer();
            const dataView = new DataView(arrayBuffer);

            const magic = dataView.getUint32(0, true);
            if (magic !== 0x46546C67) {
                console.warn("Invalid GLB magic header");
                return false;
            }

            const totalLength = dataView.getUint32(8, true);
            let offset = 12;

            let jsonChunk: any = null;
            let binBuffer: ArrayBuffer | null = null;

            while (offset < totalLength) {
                const chunkLength = dataView.getUint32(offset, true);
                const chunkType = dataView.getUint32(offset + 4, true);
                const chunkData = arrayBuffer.slice(offset + 8, offset + 8 + chunkLength);

                if (chunkType === 0x4E4F534A) {
                    const jsonStr = new TextDecoder().decode(chunkData);
                    jsonChunk = JSON.parse(jsonStr);
                } else if (chunkType === 0x004E4942) {
                    binBuffer = chunkData;
                }
                offset += 8 + chunkLength;
            }

            if (!jsonChunk || !binBuffer) return false;

            const getAccessorData = (accessorIndex: number) => {
                const acc = jsonChunk.accessors[accessorIndex];
                const bv = jsonChunk.bufferViews[acc.bufferView];
                const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
                return { acc, slice: binBuffer!.slice(byteOffset, byteOffset + bv.byteLength) };
            };

            const loadedPrimitives: PrimitiveMesh[] = [];

            for (const mesh of jsonChunk.meshes || []) {
                for (const prim of mesh.primitives || []) {
                    if (prim.attributes.POSITION === undefined) continue;
                    const posInfo = getAccessorData(prim.attributes.POSITION);
                    const normInfo = prim.attributes.NORMAL !== undefined ? getAccessorData(prim.attributes.NORMAL) : null;
                    const uvInfo = prim.attributes.TEXCOORD_0 !== undefined ? getAccessorData(prim.attributes.TEXCOORD_0) : null;

                    const posArray = new Float32Array(posInfo.slice);
                    const normArray = normInfo ? new Float32Array(normInfo.slice) : null;
                    const uvArray = uvInfo ? new Float32Array(uvInfo.slice) : null;

                    const count = posInfo.acc.count;
                    const interleaved = new Float32Array(count * 8);

                    for (let i = 0; i < count; ++i) {
                        interleaved[i * 8 + 0] = posArray[i * 3 + 0];
                        interleaved[i * 8 + 1] = posArray[i * 3 + 1];
                        interleaved[i * 8 + 2] = posArray[i * 3 + 2];

                        interleaved[i * 8 + 3] = normArray ? normArray[i * 3 + 0] : 0.0;
                        interleaved[i * 8 + 4] = normArray ? normArray[i * 3 + 1] : 1.0;
                        interleaved[i * 8 + 5] = normArray ? normArray[i * 3 + 2] : 0.0;

                        interleaved[i * 8 + 6] = uvArray ? uvArray[i * 2 + 0] : 0.0;
                        interleaved[i * 8 + 7] = uvArray ? uvArray[i * 2 + 1] : 0.0;
                    }

                    const vertexBuffer = this.ctx.createBuffer(interleaved, GPUBufferUsage.VERTEX);
                    let indexBuffer: GPUBuffer | undefined;
                    let indexCount = 0;

                    if (prim.indices !== undefined) {
                        const idxInfo = getAccessorData(prim.indices);
                        indexCount = idxInfo.acc.count;
                        if (idxInfo.acc.componentType === 5123) {
                            const idxArray16 = new Uint16Array(idxInfo.slice);
                            const idxArray32 = new Uint32Array(idxArray16.length);
                            for (let j = 0; j < idxArray16.length; ++j) idxArray32[j] = idxArray16[j];
                            indexBuffer = this.ctx.createBuffer(idxArray32, GPUBufferUsage.INDEX);
                        } else {
                            indexBuffer = this.ctx.createBuffer(new Uint32Array(idxInfo.slice), GPUBufferUsage.INDEX);
                        }
                    }

                    let baseColor: [number, number, number, number] = [0.8, 0.2, 0.2, 1.0];
                    if (prim.material !== undefined && jsonChunk.materials?.[prim.material]) {
                        const mat = jsonChunk.materials[prim.material];
                        if (mat.pbrMetallicRoughness?.baseColorFactor) {
                            baseColor = mat.pbrMetallicRoughness.baseColorFactor;
                        }
                    }

                    const bindGroup = this.ctx.device.createBindGroup({
                        layout: this.pipeline.getBindGroupLayout(0),
                        entries: [
                            { binding: 0, resource: { buffer: this.uniformBuffer } },
                            { binding: 1, resource: this.defaultTexture.createView() },
                            { binding: 2, resource: this.sampler },
                        ],
                    });

                    loadedPrimitives.push({
                        vertexBuffer,
                        indexBuffer,
                        indexCount,
                        vertexCount: count,
                        baseColorFactor: baseColor,
                        bindGroup,
                    });
                }
            }

            if (loadedPrimitives.length > 0) {
                this.primitives = loadedPrimitives;
                console.log(`Loaded Drone GLB: ${this.primitives.length} primitives replaced procedural fallback.`);
                return true;
            }
            return false;
        } catch (e) {
            console.warn("Could not parse GLB, using procedural drone:", e);
            return false;
        }
    }

    public render(
        pass: GPURenderPassEncoder,
        camera: Camera,
        position: [number, number, number],
        rotationDeg: [number, number, number],
        scale: number = 1.0,
        time: number = 0
    ): void {
        if (this.primitives.length === 0) return;

        const modelMat = Mat4.create();
        const rollRad = rotationDeg[0] * (Math.PI / 180.0);
        const pitchRad = rotationDeg[1] * (Math.PI / 180.0);
        const yawRad = rotationDeg[2] * (Math.PI / 180.0);

        const cy = Math.cos(yawRad), sy = Math.sin(yawRad);
        const cp = Math.cos(pitchRad), sp = Math.sin(pitchRad);
        const cr = Math.cos(rollRad), sr = Math.sin(rollRad);

        modelMat[0] = (cy * cr + sy * sp * sr) * scale;
        modelMat[1] = (cp * sr) * scale;
        modelMat[2] = (-sy * cr + cy * sp * sr) * scale;

        modelMat[4] = (-cy * sr + sy * sp * cr) * scale;
        modelMat[5] = (cp * cr) * scale;
        modelMat[6] = (sy * sr + cy * sp * cr) * scale;

        modelMat[8] = (sy * cp) * scale;
        modelMat[9] = (-sp) * scale;
        modelMat[10] = (cy * cp) * scale;

        modelMat[12] = position[0];
        modelMat[13] = position[1];
        modelMat[14] = position[2];
        modelMat[15] = 1.0;

        pass.setPipeline(this.pipeline);

        for (const prim of this.primitives) {
            const uniforms = new Float32Array(64); // 256 bytes
            uniforms.set(camera.viewProjMatrix, 0); // offset 0..63 (0..15)
            uniforms.set(modelMat, 16);             // offset 64..127 (16..31)
            uniforms[32] = camera.position[0];      // offset 128..139 (32..34)
            uniforms[33] = camera.position[1];
            uniforms[34] = camera.position[2];
            uniforms[35] = time;                    // offset 140..143 (35)

            uniforms[36] = 0.6; // sunDir offset 144..155 (36..38)
            uniforms[37] = 0.8;
            uniforms[38] = 0.4;
            uniforms[39] = 0.0;

            uniforms[40] = 1.0; // sunColor offset 160..171 (40..42)
            uniforms[41] = 0.95;
            uniforms[42] = 0.85;
            uniforms[43] = 0.0;

            uniforms[44] = prim.baseColorFactor[0]; // baseColorFactor offset 176..191 (44..47)
            uniforms[45] = prim.baseColorFactor[1];
            uniforms[46] = prim.baseColorFactor[2];
            uniforms[47] = prim.baseColorFactor[3];
            uniforms[48] = 0; // hasTexture

            this.ctx.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

            pass.setBindGroup(0, prim.bindGroup!);
            pass.setVertexBuffer(0, prim.vertexBuffer);

            if (prim.indexBuffer) {
                pass.setIndexBuffer(prim.indexBuffer, 'uint32');
                pass.drawIndexed(prim.indexCount);
            } else {
                pass.draw(prim.vertexCount);
            }
        }
    }
}
