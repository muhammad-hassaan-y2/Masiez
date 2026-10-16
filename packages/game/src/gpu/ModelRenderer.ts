import { GPUDeviceContext } from './Device';
import { Camera, Mat4 } from '../scene/Camera';
import modelShaderCode from '../shaders/model.wgsl?raw';

interface PrimitiveMesh {
    vertexBuffer: GPUBuffer;
    indexBuffer?: GPUBuffer;
    indexCount: number;
    vertexCount: number;
    baseColorFactor: [number, number, number, number];
    hasTexture: boolean;
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
}

export class ModelRenderer {
    private ctx: GPUDeviceContext;
    private pipeline!: GPURenderPipeline;
    private sampler!: GPUSampler;
    private defaultTexture!: GPUTexture;

    private primitives: PrimitiveMesh[] = [];

    constructor(ctx: GPUDeviceContext) {
        this.ctx = ctx;
    }

    public async init(): Promise<void> {
        const device = this.ctx.device;

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

        this.createFallbackDrone();
    }

    private createFallbackDrone(): void {
        const vertices: number[] = [];
        const indices: number[] = [];

        function addBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) {
            const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
            const startIdx = vertices.length / 8;
            
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
                    vertices.push(c[0], c[1], c[2], face.norm[0], face.norm[1], face.norm[2], (i === 0 || i === 3) ? 0 : 1, i < 2 ? 0 : 1);
                }
                indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
                vCount += 4;
            }
        }

        // Center fuselage
        addBox(0, 0.05, 0, 0.4, 0.08, 0.4);
        // Arms
        addBox(0.3, 0.04, 0.3, 0.06, 0.03, 0.35);
        addBox(-0.3, 0.04, 0.3, 0.06, 0.03, 0.35);
        addBox(0.3, 0.04, -0.3, 0.06, 0.03, 0.35);
        addBox(-0.3, 0.04, -0.3, 0.06, 0.03, 0.35);

        const vertexBuffer = this.ctx.createBuffer(new Float32Array(vertices), GPUBufferUsage.VERTEX);
        const indexBuffer = this.ctx.createBuffer(new Uint32Array(indices), GPUBufferUsage.INDEX);

        const uniformBuffer = this.ctx.device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const bindGroup = this.ctx.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: this.defaultTexture.createView() },
                { binding: 2, resource: this.sampler },
            ],
        });

        this.primitives = [{
            vertexBuffer,
            indexBuffer,
            indexCount: indices.length,
            vertexCount: vertices.length / 8,
            baseColorFactor: [0.95, 0.75, 0.1, 1.0],
            hasTexture: false,
            uniformBuffer,
            bindGroup,
        }];
    }

    public async loadGLB(url: string): Promise<boolean> {
        try {
            const res = await fetch(url);
            if (!res.ok) return false;
            const arrayBuffer = await res.arrayBuffer();
            const dataView = new DataView(arrayBuffer);

            const magic = dataView.getUint32(0, true);
            if (magic !== 0x46546C67) return false;

            const totalLength = dataView.getUint32(8, true);
            let offset = 12;

            let jsonChunk: any = null;
            let binBuffer: ArrayBuffer | null = null;

            while (offset < totalLength) {
                const chunkLength = dataView.getUint32(offset, true);
                const chunkType = dataView.getUint32(offset + 4, true);
                const chunkData = arrayBuffer.slice(offset + 8, offset + 8 + chunkLength);

                if (chunkType === 0x4E4F534A) {
                    jsonChunk = JSON.parse(new TextDecoder().decode(chunkData));
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

            // Load all embedded textures
            const loadedTextures: GPUTextureView[] = [];
            if (jsonChunk.images && jsonChunk.textures) {
                for (const imgInfo of jsonChunk.images) {
                    try {
                        const bv = jsonChunk.bufferViews[imgInfo.bufferView];
                        const byteOffset = bv.byteOffset || 0;
                        const slice = binBuffer.slice(byteOffset, byteOffset + bv.byteLength);
                        const blob = new Blob([slice], { type: imgInfo.mimeType || 'image/png' });
                        const bmp = await createImageBitmap(blob);
                        const tex = this.ctx.device.createTexture({
                            size: [bmp.width, bmp.height, 1],
                            format: 'rgba8unorm',
                            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
                        });
                        this.ctx.device.queue.copyExternalImageToTexture(
                            { source: bmp },
                            { texture: tex },
                            [bmp.width, bmp.height]
                        );
                        loadedTextures.push(tex.createView());
                    } catch (err) {
                        console.warn("Failed to load embedded GLB image:", imgInfo.name, err);
                        loadedTextures.push(this.defaultTexture.createView());
                    }
                }
            }

            // First pass: compute global bounding box for automatic centering & normalization
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

            for (const mesh of jsonChunk.meshes || []) {
                for (const prim of mesh.primitives || []) {
                    if (prim.attributes.POSITION === undefined) continue;
                    const posInfo = getAccessorData(prim.attributes.POSITION);
                    const posArray = new Float32Array(posInfo.slice);
                    for (let i = 0; i < posInfo.acc.count; ++i) {
                        const px = posArray[i * 3 + 0];
                        const py = posArray[i * 3 + 1];
                        const pz = posArray[i * 3 + 2];
                        if (px < minX) minX = px; if (px > maxX) maxX = px;
                        if (py < minY) minY = py; if (py > maxY) maxY = py;
                        if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
                    }
                }
            }

            const centerX = (minX + maxX) * 0.5;
            const centerY = (minY + maxY) * 0.5;
            const centerZ = (minZ + maxZ) * 0.5;
            const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.001);
            const normScale = 1.0 / maxDim; // Normalize to 1.0 unit diameter

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
                        // Centered & normalized positions
                        interleaved[i * 8 + 0] = (posArray[i * 3 + 0] - centerX) * normScale;
                        interleaved[i * 8 + 1] = (posArray[i * 3 + 1] - centerY) * normScale;
                        interleaved[i * 8 + 2] = (posArray[i * 3 + 2] - centerZ) * normScale;

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

                    let baseColor: [number, number, number, number] = [0.85, 0.75, 0.1, 1.0];
                    let textureView = this.defaultTexture.createView();
                    let hasTexture = false;

                    if (prim.material !== undefined && jsonChunk.materials?.[prim.material]) {
                        const mat = jsonChunk.materials[prim.material];
                        if (mat.pbrMetallicRoughness?.baseColorFactor) {
                            baseColor = mat.pbrMetallicRoughness.baseColorFactor;
                        }
                        if (mat.pbrMetallicRoughness?.baseColorTexture !== undefined) {
                            const texIdx = mat.pbrMetallicRoughness.baseColorTexture.index;
                            const textureDef = jsonChunk.textures?.[texIdx];
                            if (textureDef !== undefined && loadedTextures[textureDef.source]) {
                                textureView = loadedTextures[textureDef.source];
                                hasTexture = true;
                            }
                        }
                    }

                    const primUniformBuffer = this.ctx.device.createBuffer({
                        size: 256,
                        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                    });

                    const bindGroup = this.ctx.device.createBindGroup({
                        layout: this.pipeline.getBindGroupLayout(0),
                        entries: [
                            { binding: 0, resource: { buffer: primUniformBuffer } },
                            { binding: 1, resource: textureView },
                            { binding: 2, resource: this.sampler },
                        ],
                    });

                    loadedPrimitives.push({
                        vertexBuffer,
                        indexBuffer,
                        indexCount,
                        vertexCount: count,
                        baseColorFactor: baseColor,
                        hasTexture,
                        uniformBuffer: primUniformBuffer,
                        bindGroup,
                    });
                }
            }

            if (loadedPrimitives.length > 0) {
                this.primitives = loadedPrimitives;
                console.log(`Loaded and normalized custom drone GLB: ${this.primitives.length} primitives.`);
                return true;
            }
            return false;
        } catch (e) {
            console.warn("Using procedural drone mesh fallback:", e);
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

        const uniforms = new Float32Array(64);
        const uniformsUint = new Uint32Array(uniforms.buffer);

        uniforms.set(camera.viewProjMatrix, 0);
        uniforms.set(modelMat, 16);
        uniforms[32] = camera.position[0];
        uniforms[33] = camera.position[1];
        uniforms[34] = camera.position[2];
        uniforms[35] = time;

        uniforms[36] = 0.6;
        uniforms[37] = 0.8;
        uniforms[38] = 0.4;
        uniforms[39] = 0.0;

        uniforms[40] = 1.0;
        uniforms[41] = 0.95;
        uniforms[42] = 0.85;
        uniforms[43] = 0.0;

        pass.setPipeline(this.pipeline);

        for (const prim of this.primitives) {
            uniforms[44] = prim.baseColorFactor[0];
            uniforms[45] = prim.baseColorFactor[1];
            uniforms[46] = prim.baseColorFactor[2];
            uniforms[47] = prim.baseColorFactor[3];
            uniformsUint[48] = prim.hasTexture ? 1 : 0;

            this.ctx.device.queue.writeBuffer(prim.uniformBuffer, 0, uniforms);

            pass.setBindGroup(0, prim.bindGroup);
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
