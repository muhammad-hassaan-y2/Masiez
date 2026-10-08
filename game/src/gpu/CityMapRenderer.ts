import { GPUDeviceContext } from './Device';
import { Camera } from '../scene/Camera';
import cityShaderCode from '../shaders/city_map.wgsl?raw';
import { AABB } from '../gameplay/CollisionSystem';

export interface MapDefinition {
    id: string;
    name: string;
    url: string;
    spawnPos: [number, number, number];
    groundElevation: number;
    yOffset?: number;
    camDistance: number;
    description: string;
}

export const MAP_CATALOG: MapDefinition[] = [
    {
        id: 'airfield',
        name: 'Tactical Airfield Runway',
        url: '',
        spawnPos: [0, 1.5, 0],
        groundElevation: 0.0,
        camDistance: 2.5,
        description: 'Open runway airfield with hangars, radar tower, and flight obstacle courses'
    },
    {
        id: 'street_city',
        name: 'Downtown City Streets',
        url: '/assets/maps/street_city_7_for_games_free.glb',
        spawnPos: [0, 2.5, 10.0],
        groundElevation: 0.0,
        camDistance: 2.5,
        description: 'Dense commercial street sector with storefronts, avenues, and skyscrapers'
    },
    {
        id: 'tram_station',
        name: 'Tram Metropolis',
        url: '/assets/maps/tram_station.glb',
        spawnPos: [0, 8.0, 0],
        groundElevation: 2.0,
        camDistance: 3.2,
        description: 'Modern metropolis district with overhead transit rails, roads, and high-rises'
    },
    {
        id: 'amsterdam',
        name: 'Amsterdam Terminal',
        url: '/assets/maps/centraal_station_amsterdam.glb',
        spawnPos: [0, 5.0, -35],
        groundElevation: 0.5,
        camDistance: 3.5,
        description: 'Waterfront canals and historic terminal complex on the bay'
    },
    {
        id: 'erangel',
        name: 'Erangel Battleground (PUBG)',
        url: '/assets/maps/erangel_pubg.glb',
        spawnPos: [0, 22.0, 300],
        groundElevation: 19.3,
        yOffset: 208.0,
        camDistance: 2.8,
        description: 'Vast 20km tactical island battleground with military outposts, hills, and coastlines'
    }
];

interface MapPrimitive {
    vertexBuffer: GPUBuffer;
    indexBuffer?: GPUBuffer;
    indexCount: number;
    vertexCount: number;
    bindGroup: GPUBindGroup;
}

export class CityMapRenderer {
    private ctx: GPUDeviceContext;
    private pipeline!: GPURenderPipeline;
    private sampler!: GPUSampler;
    private defaultTexture!: GPUTexture;

    private globalUniformBuffer!: GPUBuffer;
    private globalBindGroup!: GPUBindGroup;

    private floorVertexBuffer!: GPUBuffer;
    private floorIndexBuffer!: GPUBuffer;
    private floorBindGroup!: GPUBindGroup;

    private activeMapId: string = 'erangel';
    private mapCache: Map<string, MapPrimitive[]> = new Map();
    private mapColliders: Map<string, AABB[]> = new Map();
    private isLoading: boolean = false;
    private currentProgress: number = 0;

    public getMapColliders(mapId: string): AABB[] {
        return this.mapColliders.get(mapId) || [];
    }

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
            new Uint8Array([180, 185, 175, 255]),
            { bytesPerRow: 4 },
            [1, 1]
        );

        this.sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'repeat',
            addressModeV: 'repeat',
        });

        // Global Uniform Buffer: 112 bytes (padded to 128)
        this.globalUniformBuffer = device.createBuffer({
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const shaderModule = device.createShaderModule({ code: cityShaderCode });

        this.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 8 * 4, // 32 bytes (pos: 3, normal: 3, uv: 2)
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x3' },
                        { shaderLocation: 1, offset: 12, format: 'float32x3' },
                        { shaderLocation: 2, offset: 24, format: 'float32x2' },
                    ],
                }],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format: this.ctx.format }],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back', // Cull backfaces so bottom/underside geometry never shows through ("flat no back")
            },
            depthStencil: {
                format: this.ctx.depthFormat,
                depthWriteEnabled: true,
                depthCompare: 'less-equal',
            },
        });

        this.globalBindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.globalUniformBuffer } },
            ],
        });

        // Solid Flat Bedrock Ground Floor ("like flat no back")
        // Extends 24km across the horizon so looking down always shows solid terrain bedrock
        const halfSize = 14000.0;
        const floorVerts = new Float32Array([
            -halfSize, -0.35, -halfSize,  0, 1, 0,    0,   0,
             halfSize, -0.35, -halfSize,  0, 1, 0,  200,   0,
             halfSize, -0.35,  halfSize,  0, 1, 0,  200, 200,
            -halfSize, -0.35,  halfSize,  0, 1, 0,    0, 200,
        ]);
        const floorIndices = new Uint32Array([
            0, 1, 2,
            0, 2, 3,
        ]);
        this.floorVertexBuffer = this.ctx.createBuffer(floorVerts, GPUBufferUsage.VERTEX);
        this.floorIndexBuffer = this.ctx.createBuffer(floorIndices, GPUBufferUsage.INDEX);

        // Bedrock material uniform (dark earth terrain color)
        const floorMatBuffer = device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const floorMatArray = new Float32Array(8);
        floorMatArray[0] = 0.25; // r
        floorMatArray[1] = 0.32; // g
        floorMatArray[2] = 0.22; // b
        floorMatArray[3] = 1.0;
        new Uint32Array(floorMatArray.buffer)[4] = 0; // hasTexture
        floorMatArray[5] = 0.9; // roughness
        floorMatArray[6] = 0.05; // metallic
        device.queue.writeBuffer(floorMatBuffer, 0, floorMatArray);

        this.floorBindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(1),
            entries: [
                { binding: 0, resource: { buffer: floorMatBuffer } },
                { binding: 1, resource: this.defaultTexture.createView() },
                { binding: 2, resource: this.sampler },
            ],
        });
    }

    public async loadMap(mapDef: MapDefinition, onProgress?: (pct: number) => void): Promise<boolean> {
        this.activeMapId = mapDef.id;
        if (!mapDef.url) {
            // Procedural map, no GLB needed
            return true;
        }

        if (this.mapCache.has(mapDef.id)) {
            console.log(`[CityMapRenderer] Activated cached map: ${mapDef.name}`);
            return true;
        }

        this.isLoading = true;
        this.currentProgress = 10;
        onProgress?.(10);

        try {
            console.log(`[CityMapRenderer] Loading map GLB: ${mapDef.url}...`);
            const res = await fetch(mapDef.url);
            if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${mapDef.url}`);

            const arrayBuffer = await res.arrayBuffer();
            this.currentProgress = 40;
            onProgress?.(40);

            const primitives = await this.parseGLB(arrayBuffer, mapDef, (pct) => {
                const total = 40 + Math.floor(pct * 0.55);
                this.currentProgress = total;
                onProgress?.(total);
            });

            this.mapCache.set(mapDef.id, primitives);
            this.isLoading = false;
            this.currentProgress = 100;
            onProgress?.(100);
            console.log(`[CityMapRenderer] Successfully loaded ${mapDef.name} (${primitives.length} primitives)`);
            return true;
        } catch (err) {
            console.error(`[CityMapRenderer] Failed to load map ${mapDef.name}:`, err);
            this.isLoading = false;
            return false;
        }
    }

    private async parseGLB(arrayBuffer: ArrayBuffer, mapDef: MapDefinition, onProgress?: (pct: number) => void): Promise<MapPrimitive[]> {
        const dataView = new DataView(arrayBuffer);
        const magic = dataView.getUint32(0, true);
        if (magic !== 0x46546C67) {
            throw new Error("Invalid GLB magic header");
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
                jsonChunk = JSON.parse(new TextDecoder().decode(chunkData));
            } else if (chunkType === 0x004E4942) {
                binBuffer = chunkData;
            }
            offset += 8 + chunkLength;
        }

        if (!jsonChunk || !binBuffer) {
            throw new Error("Missing JSON or BIN chunk in GLB");
        }

        const getAccessorData = (accessorIndex: number) => {
            const acc = jsonChunk.accessors[accessorIndex];
            const bv = jsonChunk.bufferViews[acc.bufferView];
            const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
            return { acc, slice: binBuffer!.slice(byteOffset, byteOffset + bv.byteLength) };
        };

        // Extract and upload textures in parallel
        const loadedTextures: GPUTextureView[] = [];
        if (jsonChunk.images && jsonChunk.textures) {
            const texturePromises = jsonChunk.images.map(async (imgInfo: any) => {
                try {
                    const bv = jsonChunk.bufferViews[imgInfo.bufferView];
                    const byteOffset = bv.byteOffset || 0;
                    const slice = binBuffer!.slice(byteOffset, byteOffset + bv.byteLength);
                    const blob = new Blob([slice], { type: imgInfo.mimeType || 'image/png' });
                    
                    const maxDim = this.ctx.device.limits.maxTextureDimension2D || 8192;
                    let bmp = await createImageBitmap(blob);
                    let targetW = bmp.width;
                    let targetH = bmp.height;
                    if (targetW > maxDim || targetH > maxDim) {
                        const scale = Math.min(maxDim / targetW, maxDim / targetH);
                        targetW = Math.floor(targetW * scale);
                        targetH = Math.floor(targetH * scale);
                        bmp = await createImageBitmap(blob, { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: 'high' });
                    }

                    const tex = this.ctx.device.createTexture({
                        size: [targetW, targetH, 1],
                        format: 'rgba8unorm',
                        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
                    });
                    this.ctx.device.queue.copyExternalImageToTexture(
                        { source: bmp },
                        { texture: tex },
                        [targetW, targetH]
                    );
                    return tex.createView();
                } catch (e) {
                    return this.defaultTexture.createView();
                }
            });
            const views = await Promise.all(texturePromises);
            loadedTextures.push(...views);
        }

        // Compute World Matrices by recursively traversing scene node hierarchy
        const nodeWorldMatrices: Map<number, Float32Array> = new Map();

        const buildNodeMatrix = (nodeIdx: number, parentMatrix: Float32Array) => {
            const node = jsonChunk.nodes[nodeIdx];
            if (!node) return;

            let localMat = new Float32Array(16);
            if (node.matrix) {
                localMat.set(node.matrix);
            } else {
                const t: [number, number, number] = node.translation ? [node.translation[0], node.translation[1], node.translation[2]] : [0, 0, 0];
                const r: [number, number, number, number] = node.rotation ? [node.rotation[0], node.rotation[1], node.rotation[2], node.rotation[3]] : [0, 0, 0, 1];
                const s: [number, number, number] = node.scale ? [node.scale[0], node.scale[1], node.scale[2]] : [1, 1, 1];

                const x = r[0], y = r[1], z = r[2], w = r[3];
                const x2 = x + x, y2 = y + y, z2 = z + z;
                const xx = x * x2, xy = x * y2, xz = x * z2;
                const yy = y * y2, yz = y * z2, zz = z * z2;
                const wx = w * x2, wy = w * y2, wz = w * z2;

                localMat[0] = (1 - (yy + zz)) * s[0];
                localMat[1] = (xy + wz) * s[0];
                localMat[2] = (xz - wy) * s[0];
                localMat[3] = 0;

                localMat[4] = (xy - wz) * s[1];
                localMat[5] = (1 - (xx + zz)) * s[1];
                localMat[6] = (yz + wx) * s[1];
                localMat[7] = 0;

                localMat[8] = (xz + wy) * s[2];
                localMat[9] = (yz - wx) * s[2];
                localMat[10] = (1 - (xx + yy)) * s[2];
                localMat[11] = 0;

                localMat[12] = t[0];
                localMat[13] = t[1];
                localMat[14] = t[2];
                localMat[15] = 1;
            }

            // Multiply parentMatrix * localMat
            const worldMat = new Float32Array(16);
            for (let col = 0; col < 4; col++) {
                for (let row = 0; row < 4; row++) {
                    let sum = 0;
                    for (let k = 0; k < 4; k++) {
                        sum += parentMatrix[k * 4 + row] * localMat[col * 4 + k];
                    }
                    worldMat[col * 4 + row] = sum;
                }
            }

            nodeWorldMatrices.set(nodeIdx, worldMat);

            if (node.children) {
                for (const childIdx of node.children) {
                    buildNodeMatrix(childIdx, worldMat);
                }
            }
        };

        const identity = new Float32Array([
            1,0,0,0,
            0,1,0,0,
            0,0,1,0,
            0,0,0,1
        ]);

        const defaultScene = jsonChunk.scenes?.[jsonChunk.scene || 0];
        const rootNodes = defaultScene?.nodes || Object.keys(jsonChunk.nodes || {}).map(Number);
        for (const rootIdx of rootNodes) {
            buildNodeMatrix(rootIdx, identity);
        }

        // Pre-build unique Material BindGroups (one per unique material in GLB)
        const materialBindGroups: Map<number, GPUBindGroup> = new Map();

        const buildMaterialBindGroup = (matIdx: number) => {
            let baseColor: [number, number, number, number] = [0.85, 0.85, 0.88, 1.0];
            let textureView = this.defaultTexture.createView();
            let hasTexture = 0;
            let roughness = 0.7;
            let metallic = 0.1;

            if (matIdx >= 0 && jsonChunk.materials?.[matIdx]) {
                const mat = jsonChunk.materials[matIdx];
                const pbr = mat.pbrMetallicRoughness;
                if (pbr) {
                    if (pbr.baseColorFactor) {
                        baseColor = [
                            pbr.baseColorFactor[0],
                            pbr.baseColorFactor[1],
                            pbr.baseColorFactor[2],
                            pbr.baseColorFactor[3] !== undefined ? pbr.baseColorFactor[3] : 1.0
                        ];
                    }
                    if (pbr.roughnessFactor !== undefined) roughness = pbr.roughnessFactor;
                    if (pbr.metallicFactor !== undefined) metallic = pbr.metallicFactor;

                    if (pbr.baseColorTexture !== undefined) {
                        const texIdx = pbr.baseColorTexture.index;
                        const textureDef = jsonChunk.textures?.[texIdx];
                        const sourceImgIdx = textureDef?.source;
                        if (sourceImgIdx !== undefined && loadedTextures[sourceImgIdx]) {
                            textureView = loadedTextures[sourceImgIdx];
                            hasTexture = 1;
                        }
                    }
                }

                // Support KHR_materials_pbrSpecularGlossiness (used in Erangel PUBG terrain)
                const specGloss = mat.extensions?.KHR_materials_pbrSpecularGlossiness;
                if (specGloss) {
                    if (specGloss.diffuseFactor) {
                        baseColor = [
                            specGloss.diffuseFactor[0],
                            specGloss.diffuseFactor[1],
                            specGloss.diffuseFactor[2],
                            specGloss.diffuseFactor[3] !== undefined ? specGloss.diffuseFactor[3] : 1.0
                        ];
                    }
                    if (specGloss.glossinessFactor !== undefined) {
                        roughness = Math.max(0.05, 1.0 - specGloss.glossinessFactor);
                    }
                    if (specGloss.diffuseTexture !== undefined) {
                        const texIdx = specGloss.diffuseTexture.index;
                        const textureDef = jsonChunk.textures?.[texIdx];
                        const sourceImgIdx = textureDef?.source;
                        if (sourceImgIdx !== undefined && loadedTextures[sourceImgIdx]) {
                            textureView = loadedTextures[sourceImgIdx];
                            hasTexture = 1;
                        }
                    }
                }
            }

            const matBuffer = this.ctx.device.createBuffer({
                size: 32,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            const matArray = new Float32Array(8);
            matArray[0] = baseColor[0];
            matArray[1] = baseColor[1];
            matArray[2] = baseColor[2];
            matArray[3] = baseColor[3];
            new Uint32Array(matArray.buffer)[4] = hasTexture;
            matArray[5] = roughness;
            matArray[6] = metallic;
            matArray[7] = 0.0;
            this.ctx.device.queue.writeBuffer(matBuffer, 0, matArray);

            return this.ctx.device.createBindGroup({
                layout: this.pipeline.getBindGroupLayout(1),
                entries: [
                    { binding: 0, resource: { buffer: matBuffer } },
                    { binding: 1, resource: textureView },
                    { binding: 2, resource: this.sampler },
                ],
            });
        };

        const defaultBindGroup = buildMaterialBindGroup(-1);
        materialBindGroups.set(-1, defaultBindGroup);

        if (jsonChunk.materials) {
            for (let m = 0; m < jsonChunk.materials.length; m++) {
                materialBindGroups.set(m, buildMaterialBindGroup(m));
            }
        }

        // Collect and bake all mesh primitives with their pre-transformed world positions
        const primitives: MapPrimitive[] = [];
        const extractedColliders: AABB[] = [];
        const totalNodes = jsonChunk.nodes ? jsonChunk.nodes.length : 0;

        for (let nIdx = 0; nIdx < totalNodes; nIdx++) {
            const node = jsonChunk.nodes[nIdx];
            if (node.mesh === undefined) continue;

            const mesh = jsonChunk.meshes[node.mesh];
            if (!mesh) continue;

            const worldMat = nodeWorldMatrices.get(nIdx) || identity;

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

                let pMinX = Infinity, pMaxX = -Infinity;
                let pMinY = Infinity, pMaxY = -Infinity;
                let pMinZ = Infinity, pMaxZ = -Infinity;

                for (let i = 0; i < count; i++) {
                    const px = posArray[i * 3 + 0];
                    const py = posArray[i * 3 + 1];
                    const pz = posArray[i * 3 + 2];

                    // Transform vertex position into world space
                    const wx = worldMat[0] * px + worldMat[4] * py + worldMat[8] * pz + worldMat[12];
                    const wy = worldMat[1] * px + worldMat[5] * py + worldMat[9] * pz + worldMat[13] + (mapDef.yOffset || 0.0);
                    const wz = worldMat[2] * px + worldMat[6] * py + worldMat[10] * pz + worldMat[14];

                    pMinX = Math.min(pMinX, wx); pMaxX = Math.max(pMaxX, wx);
                    pMinY = Math.min(pMinY, wy); pMaxY = Math.max(pMaxY, wy);
                    pMinZ = Math.min(pMinZ, wz); pMaxZ = Math.max(pMaxZ, wz);

                    interleaved[i * 8 + 0] = wx;
                    interleaved[i * 8 + 1] = wy;
                    interleaved[i * 8 + 2] = wz;

                    if (normArray) {
                        const nx = normArray[i * 3 + 0];
                        const ny = normArray[i * 3 + 1];
                        const nz = normArray[i * 3 + 2];
                        let wnx = worldMat[0] * nx + worldMat[4] * ny + worldMat[8] * nz;
                        let wny = worldMat[1] * nx + worldMat[5] * ny + worldMat[9] * nz;
                        let wnz = worldMat[2] * nx + worldMat[6] * ny + worldMat[10] * nz;
                        const len = Math.hypot(wnx, wny, wnz);
                        if (len > 0.0001) {
                            const inv = 1.0 / len;
                            wnx *= inv; wny *= inv; wnz *= inv;
                        }
                        interleaved[i * 8 + 3] = wnx;
                        interleaved[i * 8 + 4] = wny;
                        interleaved[i * 8 + 5] = wnz;
                    } else {
                        interleaved[i * 8 + 3] = 0.0;
                        interleaved[i * 8 + 4] = 1.0;
                        interleaved[i * 8 + 5] = 0.0;
                    }

                    interleaved[i * 8 + 6] = uvArray ? uvArray[i * 2 + 0] : 0.0;
                    interleaved[i * 8 + 7] = uvArray ? uvArray[i * 2 + 1] : 0.0;
                }

                // Check if this primitive forms a solid building / structure obstacle
                const height = pMaxY - pMinY;
                const sizeX = pMaxX - pMinX;
                const sizeZ = pMaxZ - pMinZ;
                if (height >= 1.8 && sizeX >= 1.2 && sizeZ >= 1.2 && sizeX <= 180.0 && sizeZ <= 180.0) {
                    extractedColliders.push({
                        id: `${mapDef.id}_struct_${extractedColliders.length}`,
                        min: [pMinX - 0.2, pMinY, pMinZ - 0.2],
                        max: [pMaxX + 0.2, pMaxY + 0.5, pMaxZ + 0.2],
                        name: `${mapDef.name} Structure ${extractedColliders.length + 1}`
                    });
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
                        for (let j = 0; j < idxArray16.length; j++) idxArray32[j] = idxArray16[j];
                        indexBuffer = this.ctx.createBuffer(idxArray32, GPUBufferUsage.INDEX);
                    } else {
                        indexBuffer = this.ctx.createBuffer(new Uint32Array(idxInfo.slice), GPUBufferUsage.INDEX);
                    }
                }

                const matIdx = (prim.material !== undefined) ? prim.material : -1;
                const bindGroup = materialBindGroups.get(matIdx) || defaultBindGroup;

                primitives.push({
                    vertexBuffer,
                    indexBuffer,
                    indexCount,
                    vertexCount: count,
                    bindGroup,
                });
            }

            if (nIdx % 80 === 0) {
                if (onProgress && totalNodes > 0) {
                    onProgress(Math.floor((nIdx / totalNodes) * 100));
                }
                // Yield to browser event loop so UI stays fluid
                await new Promise(r => setTimeout(r, 0));
            }
        }

        this.mapColliders.set(mapDef.id, extractedColliders);
        console.log(`[CityMapRenderer] Extracted ${extractedColliders.length} solid building colliders for ${mapDef.name}`);

        return primitives;
    }

    public render(pass: GPURenderPassEncoder, camera: Camera, timeSec: number): void {
        const primitives = this.mapCache.get(this.activeMapId);
        if (!primitives || primitives.length === 0) return;

        // Update Global Uniforms
        // viewProj (64 bytes), cameraPos (12 bytes), time (4 bytes), sunDir (12 bytes), pad0 (4), sunColor (12), pad1 (4) = 112 bytes
        const globalData = new Float32Array(28);
        globalData.set(camera.viewProjMatrix, 0);

        globalData[16] = camera.position[0];
        globalData[17] = camera.position[1];
        globalData[18] = camera.position[2];
        globalData[19] = timeSec;

        // Sun direction & color
        globalData[20] = 0.45;
        globalData[21] = 0.85;
        globalData[22] = 0.35;
        globalData[23] = 0.0;

        globalData[24] = 1.0;
        globalData[25] = 0.96;
        globalData[26] = 0.88;
        globalData[27] = 0.0;

        this.ctx.device.queue.writeBuffer(this.globalUniformBuffer, 0, globalData);

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.globalBindGroup);

        // 1. Draw Solid Flat Bedrock Ground Floor beneath terrain ("like flat no back")
        pass.setBindGroup(1, this.floorBindGroup);
        pass.setVertexBuffer(0, this.floorVertexBuffer);
        pass.setIndexBuffer(this.floorIndexBuffer, 'uint32');
        pass.drawIndexed(6);

        // 2. Draw Map 3D Geometry
        for (const prim of primitives) {
            pass.setBindGroup(1, prim.bindGroup);
            pass.setVertexBuffer(0, prim.vertexBuffer);

            if (prim.indexBuffer && prim.indexCount > 0) {
                pass.setIndexBuffer(prim.indexBuffer, 'uint32');
                pass.drawIndexed(prim.indexCount);
            } else {
                pass.draw(prim.vertexCount);
            }
        }
    }

    public getActiveMapId(): string {
        return this.activeMapId;
    }

    public isMapLoading(): boolean {
        return this.isLoading;
    }

    public getLoadingProgress(): number {
        return this.currentProgress;
    }
}
