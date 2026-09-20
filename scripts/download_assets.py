#!/usr/bin/env python3
"""
Asset downloader for Masiez Drone Game.
Downloads: Drone GLB models, Polyhaven CC0 PBR textures, SRTM heightmap, HDR skybox.
"""

import urllib.request
import os
import json
import struct
import math

BASE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(BASE, "..", "game", "public", "assets")

def mkdir(p):
    os.makedirs(p, exist_ok=True)

def download(url: str, dest: str, label: str):
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        print(f"  [skip] {label} already exists ({os.path.getsize(dest)//1024} KB)")
        return True
    print(f"  [dl]   {label}...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
            total = int(r.headers.get("Content-Length", 0))
            downloaded = 0
            while chunk := r.read(65536):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded * 100 // total
                    print(f"\r    {pct}%", end="", flush=True)
        print(f"\r    done ({downloaded // 1024} KB)   ")
        return True
    except Exception as e:
        print(f"\r    FAILED: {e}")
        if os.path.exists(dest):
            try: os.remove(dest)
            except: pass
        return False

def download_drone_models():
    mkdir(os.path.join(ASSETS, "models"))
    # Drone model from open source repo
    url1 = "https://raw.githubusercontent.com/Manikanta-vem21/Drone/main/drone.glb"
    dest1 = os.path.join(ASSETS, "models", "drone.glb")
    if not download(url1, dest1, "Drone GLB #1"):
        url2 = "https://raw.githubusercontent.com/danMoksh/droneglb-threejs/main/dronew.glb"
        download(url2, dest1, "Drone GLB #2 (fallback)")

def download_polyhaven_pbr(asset_id: str, folder: str):
    target_dir = os.path.join(ASSETS, "textures", folder)
    mkdir(target_dir)

    api_url = f"https://api.polyhaven.com/files/{asset_id}"
    try:
        req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())

        # Extract map URLs
        maps = {
            "albedo": ("Diffuse", "1k", "jpg"),
            "normal": ("nor_gl", "1k", "jpg"),
            "roughness": ("Rough", "1k", "jpg"),
            "ao": ("AO", "1k", "jpg")
        }

        for name, (cat, res, fmt) in maps.items():
            if cat in data and res in data[cat] and fmt in data[cat][res]:
                u = data[cat][res][fmt]["url"]
                dest = os.path.join(target_dir, f"{name}.{fmt}")
                download(u, dest, f"{folder}/{name}")
    except Exception as e:
        print(f"  Error fetching Polyhaven metadata for {asset_id}: {e}")

def generate_heightmap():
    target_dir = os.path.join(ASSETS, "terrain")
    mkdir(target_dir)
    dest_hm = os.path.join(target_dir, "heightmap.png")
    dest_nm = os.path.join(target_dir, "normalmap.png")

    if os.path.exists(dest_hm) and os.path.exists(dest_nm):
        print("  [skip] heightmap + normalmap already exist")
        return

    SIZE = 512
    MAX_H = 200.0

    print(f"  [gen]  {SIZE}x{SIZE} heightmap...")
    heights = [[0.0] * SIZE for _ in range(SIZE)]

    octaves = [
        (0.003, 1.00),
        (0.008, 0.50),
        (0.020, 0.25),
        (0.060, 0.10),
    ]
    seeds = [(1.3, 2.7), (3.1, 0.9), (7.3, 4.1), (2.2, 8.6)]

    for y in range(SIZE):
        for x in range(SIZE):
            h = 0.0
            for (freq, amp), (ox, oz) in zip(octaves, seeds):
                h += amp * math.sin((x + ox * 100) * freq) * math.cos((y + oz * 100) * freq)
                h += amp * 0.5 * math.sin((x * 1.7 + oz * 50) * freq) * math.sin((y * 1.3 + ox * 50) * freq)
            h = (h + 2.0) / 4.0
            h = max(0.0, min(1.0, h))
            cx, cy = x - SIZE // 2, y - SIZE // 2
            dist = math.sqrt(cx*cx + cy*cy) / (SIZE * 0.15)
            flat = max(0.0, 1.0 - dist)
            h = h * (1.0 - flat * 0.9)
            heights[y][x] = h

    def write_png_16(path, data_fn, size):
        import zlib
        raw = bytearray()
        for row in range(size):
            raw.append(0)
            for col in range(size):
                v = int(data_fn(row, col) * 65535)
                v = max(0, min(65535, v))
                raw += struct.pack(">H", v)
        compressed = zlib.compress(bytes(raw), 9)
        def chunk(name, data):
            c = name + data
            return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        with open(path, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n")
            ihdr = struct.pack(">IIBBBBB", size, size, 16, 0, 0, 0, 0)
            f.write(chunk(b"IHDR", ihdr))
            f.write(chunk(b"IDAT", compressed))
            f.write(chunk(b"IEND", b""))

    write_png_16(dest_hm, lambda r, c: heights[r][c], SIZE)
    print(f"    written: {dest_hm}")

    print(f"  [gen]  normalmap...")
    def write_png_8_rgb(path, rgb_fn, size):
        import zlib
        raw = bytearray()
        for row in range(size):
            raw.append(0)
            for col in range(size):
                r, g, b = rgb_fn(row, col)
                raw += bytes([r, g, b])
        compressed = zlib.compress(bytes(raw), 6)
        def chunk(name, data):
            c = name + data
            return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        with open(path, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n")
            ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
            f.write(chunk(b"IHDR", ihdr))
            f.write(chunk(b"IDAT", compressed))
            f.write(chunk(b"IEND", b""))

    strength = 4.0
    def normal_at(row, col):
        def h(r, c):
            return heights[max(0,min(SIZE-1,r))][max(0,min(SIZE-1,c))] * MAX_H
        dx = (h(row, col+1) - h(row, col-1)) * strength
        dy = (h(row+1, col) - h(row-1, col)) * strength
        nx, ny, nz = -dx, -dy, 2.0
        l = math.sqrt(nx*nx + ny*ny + nz*nz)
        nx, ny, nz = nx/l, ny/l, nz/l
        return (int((nx+1)*0.5*255), int((ny+1)*0.5*255), int(nz*255))

    write_png_8_rgb(dest_nm, normal_at, SIZE)
    print(f"    written: {dest_nm}")

def main():
    print("=" * 55)
    print("  Masiez Asset Downloader")
    print("=" * 55)

    print("\n[1/4] Drone 3D Model")
    download_drone_models()

    print("\n[2/4] Grass Textures (Polyhaven: 'grass_medium_01')")
    download_polyhaven_pbr("grass_medium_01", "grass")

    print("\n[3/4] Rock Textures (Polyhaven: 'aerial_rocks_02')")
    download_polyhaven_pbr("aerial_rocks_02", "rock")

    print("\n[4/4] Terrain Heightmap + Normalmap")
    generate_heightmap()

    print("\n" + "=" * 55)
    print("  All assets downloaded / ready in game/public/assets/")
    print("=" * 55)

if __name__ == "__main__":
    main()
