import * as ort from 'onnxruntime-web';

let initialized = false;

/** Shared ONNX Runtime Web configuration for all in-browser models. */
export function getOrt(): typeof ort {
    if (!initialized) {
        ort.env.wasm.wasmPaths = '/onnxruntime/';
        ort.env.wasm.proxy = false;
        ort.env.wasm.numThreads =
            (typeof self !== 'undefined' && (self as any).crossOriginIsolated) ? 2 : 1;
        initialized = true;
    }
    return ort;
}
