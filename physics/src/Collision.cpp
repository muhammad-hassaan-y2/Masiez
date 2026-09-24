#include "Collision.h"
#include <algorithm>
#include <cmath>

const unsigned short* Collision::heightData = nullptr;
int Collision::hmWidth = 0;
int Collision::hmHeight = 0;
float Collision::hmScaleX = 1000.0f;
float Collision::hmScaleY = 200.0f;
float Collision::hmScaleZ = 1000.0f;

void Collision::setHeightmapData(const unsigned short* data, int width, int height, float scaleX, float scaleY, float scaleZ) {
    heightData = data;
    hmWidth = width;
    hmHeight = height;
    hmScaleX = scaleX;
    hmScaleY = scaleY;
    hmScaleZ = scaleZ;
}

float Collision::getHeightAt(float x, float z) {
    float distFromOrigin = std::sqrt(x * x + z * z);
    float airfieldBlend = std::clamp((distFromOrigin - 30.0f) / 40.0f, 0.0f, 1.0f);

    if (!heightData || hmWidth <= 1 || hmHeight <= 1) {
        // Fallback procedural hill calculation
        float h = std::sin(x / 50.0f) * std::cos(z / 50.0f) * 10.0f + std::sin(x / 10.0f + z / 20.0f) * 2.0f;
        return std::max(0.0f, h) * airfieldBlend;
    }

    // Convert world (x, z) in [-hmScaleX/2, hmScaleX/2] to normalized [0, 1]
    float u = (x + hmScaleX * 0.5f) / hmScaleX;
    float v = (z + hmScaleZ * 0.5f) / hmScaleZ;

    u = std::clamp(u, 0.0f, 1.0f);
    v = std::clamp(v, 0.0f, 1.0f);

    float px = u * (hmWidth - 1);
    float py = v * (hmHeight - 1);

    int x0 = (int)px;
    int y0 = (int)py;
    int x1 = std::min(x0 + 1, hmWidth - 1);
    int y1 = std::min(y0 + 1, hmHeight - 1);

    float fx = px - x0;
    float fy = py - y0;

    float h00 = (float)heightData[y0 * hmWidth + x0] / 65535.0f;
    float h10 = (float)heightData[y0 * hmWidth + x1] / 65535.0f;
    float h01 = (float)heightData[y1 * hmWidth + x0] / 65535.0f;
    float h11 = (float)heightData[y1 * hmWidth + x1] / 65535.0f;

    // Bilinear interpolation
    float hTop = h00 * (1.0f - fx) + h10 * fx;
    float hBot = h01 * (1.0f - fx) + h11 * fx;
    float hNorm = hTop * (1.0f - fy) + hBot * fy;

    return hNorm * hmScaleY * airfieldBlend;
}
