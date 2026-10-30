import { terrainBounds } from "./terrain";
import { terrainLightingAt } from "./terrainLighting";

// Baked, local hill shading keeps the monochrome map legible under its soft
// architectural lighting. It adds no draw calls or per-frame work.
export function shadeTerrain(
  context: CanvasRenderingContext2D,
  resolution: number,
) {
  const { left, right, north, south } = terrainBounds;
  const width = Math.ceil((right - left) / 5) + 1;
  const height = Math.ceil((south - north) / 5) + 1;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!,
    pixels = ctx.createImageData(width, height);
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const x = left + col * 5,
        z = north + row * 5;
      const { shade } = terrainLightingAt(x, z);
      const feather = Math.max(
        0,
        Math.min(1, Math.min(x - left, right - x, z - north, south - z) / 60),
      );
      const value = Math.round((1 + (shade - 1) * feather) * 255),
        i = (row * width + col) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
      pixels.data[i + 3] = 255;
    }
  ctx.putImageData(pixels, 0, 0);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "multiply";
  context.drawImage(canvas, 0, 0, resolution, resolution);
  context.restore();
}
