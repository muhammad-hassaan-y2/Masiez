export type Bytes = Uint8Array<ArrayBuffer>;

export interface ZipFile {
    name: string;
    data: Bytes;
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(data: Bytes): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/** Store-only ZIP (deflate would only shrink already-compressed JPEGs). */
export function createZip(files: ZipFile[]): Blob {
    const encoder = new TextEncoder();
    const chunks: BlobPart[] = [];
    const central: Bytes[] = [];
    let offset = 0;

    for (const file of files) {
        const name = encoder.encode(file.name);
        const crc = crc32(file.data);

        const local = new Uint8Array(30 + name.length);
        const localView = new DataView(local.buffer);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint32(14, crc, true);
        localView.setUint32(18, file.data.length, true);
        localView.setUint32(22, file.data.length, true);
        localView.setUint16(26, name.length, true);
        local.set(name, 30);

        const entry = new Uint8Array(46 + name.length);
        const entryView = new DataView(entry.buffer);
        entryView.setUint32(0, 0x02014b50, true);
        entryView.setUint16(4, 20, true);
        entryView.setUint16(6, 20, true);
        entryView.setUint32(16, crc, true);
        entryView.setUint32(20, file.data.length, true);
        entryView.setUint32(24, file.data.length, true);
        entryView.setUint16(28, name.length, true);
        entryView.setUint32(42, offset, true);
        entry.set(name, 46);
        central.push(entry);

        chunks.push(local, file.data);
        offset += local.length + file.data.length;
    }

    const centralStart = offset;
    for (const entry of central) {
        chunks.push(entry);
        offset += entry.length;
    }

    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, central.length, true);
    endView.setUint16(10, central.length, true);
    endView.setUint32(12, offset - centralStart, true);
    endView.setUint32(16, centralStart, true);
    chunks.push(end);

    return new Blob(chunks, { type: 'application/zip' });
}
