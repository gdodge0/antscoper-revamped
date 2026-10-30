import * as T from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import { createArchitecture, createLandscape } from "./architecture";
import { features } from "./geography";
import { SelectionOutline } from "./SelectionOutline";
import { bindMapInput } from "./mapInput";
import { createCameraMotion } from "./cameraMotion";

export interface SceneStats {
  triangles: number;
  calls: number;
  outlineCalls: number;
  frames: number;
}
export function createScene(
  host: HTMLDivElement,
  labels: Map<string, HTMLButtonElement>,
  onPick: (code: string) => void,
  onError: () => void,
  onDismiss: () => void,
) {
  const scene = new T.Scene();
  scene.background = new T.Color("#f3f2f2");
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, innerWidth < 1024 ? 1.5 : 2),
  );
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.info.autoReset = false;
  const outline = new SelectionOutline();
  host.prepend(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  const camera = new T.OrthographicCamera(-100, 100, 100, -100, 0.1, 1600);
  const controls = new MapControls(camera, host);
  controls.enableRotate = false;
  controls.enableDamping = false;
  controls.minZoom = 0.65;
  controls.maxZoom = 3.5;
  controls.touches.TWO = T.TOUCH.DOLLY_PAN;
  controls.mouseButtons.RIGHT = T.MOUSE.PAN;
  const architecture = createArchitecture();
  scene.add(createLandscape(), architecture);
  scene.add(new T.AmbientLight(0xffffff, 1.8));
  const sun = new T.DirectionalLight(0xffffff, 2.1);
  sun.position.set(-100, 170, -90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -220,
    right: 220,
    top: 220,
    bottom: -220,
    near: 1,
    far: 550,
  });
  sun.shadow.normalBias = 0.08;
  sun.shadow.bias = -0.0002;
  sun.shadow.blurSamples = 8;
  scene.add(sun);
  const raycaster = new T.Raycaster(),
    pointer = new T.Vector2();
  let frame = 0,
    disposed = false,
    frames = 0,
    selected: string | null = null;
  const stats: SceneStats = {
    triangles: 0,
    calls: 0,
    outlineCalls: 0,
    frames: 0,
  };
  const projected = new T.Vector3();
  const motion = createCameraMotion(camera, controls, requestRender);
  let previousView: { target: T.Vector3; zoom: number } | null = null;
  // Labels remain HTML controls, so both canvas and keyboard users can select buildings.
  function render() {
    frame = 0;
    if (disposed) return;
    motion.step();
    const shift = new T.Vector3();
    shift.x =
      Math.max(-100, Math.min(110, controls.target.x)) - controls.target.x;
    shift.z =
      Math.max(-145, Math.min(90, controls.target.z)) - controls.target.z;
    controls.target.add(shift);
    camera.position.add(shift);
    renderer.info.reset();
    renderer.render(scene, camera);
    const sceneCalls = renderer.info.render.calls;
    if (selected && features.some((f) => f.code === selected))
      outline.render(renderer, scene, camera, selected);
    frames++;
    Object.assign(stats, {
      triangles: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
      outlineCalls: renderer.info.render.calls - sceneCalls,
      frames,
    });
    host.dataset.triangles = String(stats.triangles);
    host.dataset.drawCalls = String(stats.calls);
    host.dataset.outlineDrawCalls = String(stats.outlineCalls);
    host.dataset.frames = String(frames);
    host.dataset.ready = "true";
    host.dataset.zoom = String(camera.zoom);
    host.dataset.target = JSON.stringify(controls.target.toArray());
    host.dataset.animating = String(motion.active);
    const w = host.clientWidth,
      h = host.clientHeight,
      occupied: { x: number; y: number }[] = [];
    const hostBounds = host.getBoundingClientRect();
    const reserved = [
      ...host.parentElement!.querySelectorAll(
        ".iso-heading,.iso-controls,.iso-footer",
      ),
      ...document.querySelectorAll(".topbar"),
    ].map((e) => e.getBoundingClientRect());
    const sorted = [...features].sort(
      (a, b) =>
        (a.code === selected ? -2 : a.code === "alp" ? -1 : 0) -
        (b.code === selected ? -2 : b.code === "alp" ? -1 : 0),
    );
    for (const f of sorted) {
      const el = labels.get(f.code);
      if (!el) continue;
      const anchor = f.code === "alp" ? [-12, 10] : f.anchor;
      projected.set(anchor[0], f.height + 6, anchor[1]).project(camera);
      const x = (projected.x * 0.5 + 0.5) * w,
        y = (-projected.y * 0.5 + 0.5) * h;
      const blocked = reserved.some(
        (r) =>
          r.width > 0 &&
          x + 45 > r.left - hostBounds.left &&
          x - 45 < r.right - hostBounds.left &&
          y > r.top - hostBounds.top &&
          y - 30 < r.bottom - hostBounds.top,
      );
      const hidden =
        blocked ||
        x < 40 ||
        x > w - 40 ||
        y < 20 ||
        y > h - 25 ||
        occupied.some((p) => Math.abs(p.x - x) < 85 && Math.abs(p.y - y) < 34);
      el.hidden = hidden;
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
      if (!hidden) occupied.push({ x, y });
    }
  }
  function requestRender() {
    if (!disposed && !frame) frame = requestAnimationFrame(render);
  }
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    outline.resize(w, h, renderer.getPixelRatio());
    const width = w < 600 ? 165 : 260,
      height = (width * h) / w;
    camera.left = -width * 0.48;
    camera.right = width * 0.52;
    camera.top = height * (w < 600 ? 0.5 : 0.38);
    camera.bottom = -height * (w < 600 ? 0.5 : 0.62);
    camera.updateProjectionMatrix();
    requestRender();
  }
  function reset() {
    motion.cancel();
    controls.target.set(-4, 3, -8);
    camera.position.copy(controls.target).add(new T.Vector3(-260, 260, 260));
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
    requestRender();
  }
  const change = () => requestRender();
  controls.addEventListener("change", change);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const tap = (e: PointerEvent) => {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(e.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(architecture, true)[0];
    if (hit?.object.userData.code) onPick(hit.object.userData.code);
    else onDismiss();
  };
  const unbindInput = bindMapInput(
    host,
    tap,
    () => {},
    () => motion.cancel(),
  );
  const lost = (e: Event) => {
    e.preventDefault();
    onError();
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  reset();
  resize();
  renderer.shadowMap.needsUpdate = true;
  return {
    stats,
    reset,
    zoom(delta: number) {
      motion.cancel();
      camera.zoom = Math.max(
        controls.minZoom,
        Math.min(controls.maxZoom, camera.zoom * delta),
      );
      camera.updateProjectionMatrix();
      requestRender();
    },
    pan(x: number, z: number) {
      motion.cancel();
      const v = new T.Vector3(x, 0, z);
      camera.position.add(v);
      controls.target.add(v);
      controls.update();
      requestRender();
    },
    select(code: string | null) {
      const changed = selected !== code;
      if (changed && code && !selected)
        previousView = { target: controls.target.clone(), zoom: camera.zoom };
      selected = code;
      const f = features.find((f) => f.code === code);
      if (f && changed) {
        motion.to(
          new T.Vector3(f.anchor[0], 3, f.anchor[1]),
          Math.max(camera.zoom, 1.5),
        );
      } else if (changed && !code && previousView) {
        motion.to(previousView.target, previousView.zoom);
        previousView = null;
      }
      requestRender();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      unbindInput();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      const geometries = new Set<T.BufferGeometry>(),
        materials = new Set<T.Material>();
      scene.traverse((o) => {
        const m = o as T.Mesh;
        if ((o as T.InstancedMesh).isInstancedMesh)
          (o as T.InstancedMesh).dispose();
        if (m.geometry) geometries.add(m.geometry);
        if (m.material)
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) =>
            materials.add(x),
          );
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      sun.shadow.dispose();
      outline.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
