#pragma once

class Collision {
public:
    static void setHeightmapData(const unsigned short* data, int width, int height, float scaleX, float scaleY, float scaleZ);
    static float getHeightAt(float x, float z);

private:
    static const unsigned short* heightData;
    static int hmWidth;
    static int hmHeight;
    static float hmScaleX;
    static float hmScaleY;
    static float hmScaleZ;
};
