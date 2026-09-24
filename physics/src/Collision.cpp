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
    float airfieldBlend = std::clamp((distFromOrigin - 40.0f) / 50.0f, 0.0f, 1.0f);
    if (airfieldBlend <= 0.0f) {
        return 0.0f;
    }
    float h1 = std::sin(x * 0.012f + 0.4f) * std::cos(z * 0.012f + 0.6f) * 22.0f;
    float h2 = std::sin(x * 0.024f + z * 0.016f) * 10.0f;
    float h3 = std::sin(x * 0.005f - 1.0f) * std::cos(z * 0.006f + 0.5f) * 28.0f;
    float h4 = std::sin(x * 0.05f + z * 0.035f) * 2.0f;
    float rawHeight = h1 + h2 + h3 + h4 + 14.0f;
    return std::max(0.0f, rawHeight * airfieldBlend);
}

