import * as T from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

// Derive the stroke from the same visible meshes as the map. A depth-tested
// mask keeps it attached to the architecture and behind foreground objects.
export class SelectionOutline {
  private batchMaterial = new T.ShaderMaterial({
    uniforms: { selectedId: { value: 0 } },
    vertexShader: `attribute float buildingId;
      varying float vBuildingId;
      void main() { vBuildingId = buildingId; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float selectedId;
      varying float vBuildingId;
      void main() { float selected = 1.0 - step(0.1, abs(vBuildingId - selectedId)); gl_FragColor = vec4(vec3(selected), 1.0); }`,
    toneMapped: false,
  });
  private target = new T.WebGLRenderTarget(1, 1, { samples: 4 });
  private selectedMaterial = new T.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
  });
  private occluderMaterial = new T.MeshBasicMaterial({
    color: 0x000000,
    toneMapped: false,
  });
  private background = new T.Color(0x000000);
  private material = new T.ShaderMaterial({
    uniforms: {
      mask: { value: this.target.texture },
      stepSize: { value: new T.Vector2() },
      ink: { value: new T.Color(0x0088b0) },
    },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D mask;
      uniform vec2 stepSize;
      uniform vec3 ink;
      varying vec2 vUv;
      void main() {
        float center = texture2D(mask, vUv).r;
        float low = center;
        float high = center;
        for (int x = -1; x <= 1; x++) {
          for (int y = -1; y <= 1; y++) {
            float sampleValue = texture2D(mask, vUv + vec2(float(x), float(y)) * stepSize).r;
            low = min(low, sampleValue);
            high = max(high, sampleValue);
          }
        }
        float edge = high - low;
        if (edge < 0.01) discard;
        gl_FragColor = vec4(ink, edge * 0.9);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private quad = new FullScreenQuad(this.material);

  resize(width: number, height: number, pixelRatio: number) {
    this.target.setSize(
      Math.round(width * pixelRatio),
      Math.round(height * pixelRatio),
    );
    // One CSS pixel each side of the silhouette, independent of zoom or DPR.
    this.material.uniforms.stepSize.value.set(1 / width, 1 / height);
  }

  render(
    renderer: T.WebGLRenderer,
    scene: T.Scene,
    camera: T.Camera,
    code: string | number,
  ) {
    const originals: [T.Mesh, T.Material | T.Material[]][] = [];
    const background = scene.background;
    const target = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    const shadowEnabled = renderer.shadowMap.enabled;
    if (typeof code === "number")
      this.batchMaterial.uniforms.selectedId.value = code;
    try {
      scene.traverse((object) => {
        if (!(object as T.Mesh).isMesh) return;
        const mesh = object as T.Mesh;
        originals.push([mesh, mesh.material]);
        mesh.material =
          typeof code === "number" && mesh.userData.buildingBatch
            ? this.batchMaterial
            : mesh.userData.code === code && mesh.userData.selectionSurface
              ? this.selectedMaterial
              : this.occluderMaterial;
      });
      scene.background = this.background;
      renderer.shadowMap.enabled = false;
      renderer.setRenderTarget(this.target);
      renderer.autoClear = true;
      renderer.render(scene, camera);
    } finally {
      originals.forEach(([mesh, material]) => {
        mesh.material = material;
      });
      scene.background = background;
      renderer.shadowMap.enabled = shadowEnabled;
      renderer.setRenderTarget(target);
      renderer.autoClear = autoClear;
    }
    try {
      renderer.autoClear = false;
      this.quad.render(renderer);
    } finally {
      renderer.autoClear = autoClear;
    }
  }

  dispose() {
    this.target.dispose();
    this.selectedMaterial.dispose();
    this.occluderMaterial.dispose();
    this.batchMaterial.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
