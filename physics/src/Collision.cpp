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
    if (heightData != nullptr && hmWidth > 0 && hmHeight > 0) {
        float u = (x / hmScaleX) + 0.5f;
        float v = (z / hmScaleZ) + 0.5f;
        if (u >= 0.0f && u <= 1.0f && v >= 0.0f && v <= 1.0f) {
            int ix = std::clamp(static_cast<int>(u * (hmWidth - 1)), 0, hmWidth - 1);
            int iz = std::clamp(static_cast<int>(v * (hmHeight - 1)), 0, hmHeight - 1);
            float hNorm = heightData[iz * hmWidth + ix] / 65535.0f;
            return hNorm * hmScaleY;
        }
    }
    return 0.0f;
}

