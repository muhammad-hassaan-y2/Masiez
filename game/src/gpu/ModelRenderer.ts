import { GPUDeviceContext } from './Device';
import { Camera, Mat4 } from '../scene/Camera';
import modelShaderCode from '../shaders/model.wgsl?raw';

interface PrimitiveMesh {
    vertexBuffer: GPUBuffer;
    indexBuffer?: GPUBuffer;
    indexCount: number;
    vertexCount: number;
    baseColorFactor: [number, number, number, number];
    texture?: GPUTexture;
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
            primitive: { topology: 'triangle-list', cullMode: 'back' },
            depthStencil: {
                format: this.ctx.depthFormat,
                depthWriteEnabled: true,
                depthCompare: 'less-equal',
            },
        });
    }

    public async loadGLB(url: string): Promise<boolean> {
        try {
            const res = await fetch(url);
            const arrayBuffer = await res.arrayBuffer();
            const dataView = new DataView(arrayBuffer);

            // GLB Header
            const magic = dataView.getUint32(0, true);
            if (magic !== 0x46546C67) { // 'glTF'
                console.error("Invalid GLB magic header");
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

                if (chunkType === 0x4E4F534A) { // 'JSON'
                    const jsonStr = new TextDecoder().decode(chunkData);
                    jsonChunk = JSON.parse(jsonStr);
                } else if (chunkType === 0x004E4942) { // 'BIN\0'
                    binBuffer = chunkData;
                }
                offset += 8 + chunkLength;
            }

            if (!jsonChunk || !binBuffer) {
                console.error("Failed to parse GLB JSON or BIN chunk");
                return false;
            }

            const binBytes = new Uint8Array(binBuffer);

            // Helper to get buffer from accessor
            const getAccessorData = (accessorIndex: number) => {
                const acc = jsonChunk.accessors[accessorIndex];
                const bv = jsonChunk.bufferViews[acc.bufferView];
                const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
                return { acc, slice: binBuffer!.slice(byteOffset, byteOffset + bv.byteLength) };
            };

            // Parse meshes
            for (const mesh of jsonChunk.meshes || []) {
                for (const prim of mesh.primitives || []) {
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
                        if (idxInfo.acc.componentType === 5123) { // UNSIGNED_SHORT
                            const idxArray16 = new Uint16Array(idxInfo.slice);
                            // WebGPU 16-bit indices need 4-byte buffer alignment
                            const idxArray32 = new Uint32Array(idxArray16.length);
                            for (let j = 0; j < idxArray16.length; ++j) idxArray32[j] = idxArray16[j];
                            indexBuffer = this.ctx.createBuffer(idxArray32, GPUBufferUsage.INDEX);
                        } else {
                            indexBuffer = this.ctx.createBuffer(new Uint32Array(idxInfo.slice), GPUBufferUsage.INDEX);
                        }
                    }

                    // Material
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

                    this.primitives.push({
                        vertexBuffer,
                        indexBuffer,
                        indexCount,
                        vertexCount: count,
                        baseColorFactor: baseColor,
                        bindGroup,
                    });
                }
            }

            console.log(`Loaded Drone GLB with ${this.primitives.length} primitives.`);
            return true;
        } catch (e) {
            console.error("Error loading GLB:", e);
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

        // Construct model matrix
        const modelMat = Mat4.create();
        const rollRad = rotationDeg[0] * (Math.PI / 180.0);
        const pitchRad = rotationDeg[1] * (Math.PI / 180.0);
        const yawRad = rotationDeg[2] * (Math.PI / 180.0);

        // Scale & translation & rotation
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
            const uniforms = new Float32Array(48);
            uniforms.set(camera.viewProjMatrix, 0); // 16 floats
            uniforms.set(modelMat, 16);             // 16 floats
            uniforms[32] = camera.position[0];
            uniforms[33] = camera.position[1];
            uniforms[34] = camera.position[2];
            uniforms[35] = time;

            uniforms[36] = 0.6; // sunDir
            uniforms[37] = 0.8;
            uniforms[38] = 0.4;
            uniforms[39] = 0.0;

            uniforms[40] = 1.0; // sunColor
            uniforms[41] = 0.95;
            uniforms[42] = 0.85;
            uniforms[43] = 0.0;

            uniforms[44] = prim.baseColorFactor[0];
            uniforms[45] = prim.baseColorFactor[1];
            uniforms[46] = prim.baseColorFactor[2];
            uniforms[47] = prim.baseColorFactor[3];

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
