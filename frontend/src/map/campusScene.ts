import * as T from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import {
  campusLocations,
  districts,
  campusBounds,
  locationForCode,
} from "../locations";
import {
  campusFeatures,
  locationForHit,
  project,
  renderIdForLocation,
} from "./campusGeography";
import {
  createCampusLandscape,
  createCampusOverview,
  setCampusTerrainShadows,
  disposeGroup,
} from "./campusGeometry";
import { SelectionOutline } from "./SelectionOutline";
import { createCampusBridges, campusBridges } from "./bridges";
import { bridgeAccessBounds } from "./bridgeAccess";
import {
  groundHeightAt,
  buildingElevation,
  locationElevation,
  terrainRelief,
  terrainEnabled,
  configureTerrain,
} from "./terrain";
import { defaultMapSettings, type MapSettings } from "./mapSettings";
import { bindMapInput } from "./mapInput";
import { createCameraMotion } from "./cameraMotion";

const loaders: Record<string, () => Promise<{ default: () => T.Group }>> = {
  landmarks: () => import("./models/landmarks"),
  humanities: () => import("./models/humanities"),
  sciences: () => import("./models/sciences"),
  engineering: () => import("./models/engineering"),
  social: () => import("./models/social"),
  east: () => import("./models/east"),
  arts: () => import("./models/arts"),
  health: () => import("./models/health"),
};
export interface DetailState {
  loading: number;
  failed: string[];
}
interface CampusView {
  kind: "overview" | "district" | "building" | "bridge";
  id?: string;
  span: number;
}
interface CameraView {
  view: CampusView;
  target: [number, number, number];
  ground: number;
  zoom: number;
  navigating: boolean;
  buildingLabels: boolean;
}
export interface CampusViewSnapshot extends CameraView {
  selected: string | null;
  previous?: CameraView;
}
export function createCampusScene(
  host: HTMLDivElement,
  labels: Map<string, HTMLElement>,
  onPick: (id: string) => void,
  onError: () => void,
  onDetailState: (state: DetailState) => void,
  settings: MapSettings = defaultMapSettings,
  restore?: CampusViewSnapshot,
  onDismiss: () => void = () => {},
) {
  configureTerrain(settings);
  host.dataset.ready = "false";
  const scene = new T.Scene();
  scene.background = new T.Color("#f3f2f2");
  const mobile = innerWidth < 1024;
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
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
  const camera = new T.OrthographicCamera(-950, 950, 700, -700, 1, 8500);
  const controls = new MapControls(camera, host);
  controls.enableRotate = false;
  controls.enableDamping = false;
  controls.minZoom = 0.4;
  controls.maxZoom = 32;
  controls.touches.TWO = T.TOUCH.DOLLY_PAN;
  controls.mouseButtons.RIGHT = T.MOUSE.PAN;
  let shadows = {
    terrainShadows: settings.terrainShadows,
    buildingShadows: settings.buildingShadows,
  };
  function applyBuildingShadows(group: T.Group) {
    group.traverse((object) => {
      if (!(object instanceof T.Mesh)) return;
      // Keep the original solid-volume caster flag; glazing and mullions must
      // remain non-casters when shadows are enabled again. Trees are separate.
      object.userData.structureCaster ??= object.castShadow;
      object.castShadow =
        shadows.buildingShadows && object.userData.structureCaster;
    });
  }
  const landscape = createCampusLandscape(shadows.terrainShadows),
    overview = createCampusOverview();
  const bridges = createCampusBridges();
  for (const group of [bridges, ...overview.values()])
    applyBuildingShadows(group);
  scene.add(landscape, bridges, ...overview.values());
  scene.add(new T.AmbientLight(0xffffff, 1.8));
  const sun = new T.DirectionalLight(0xffffff, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  sun.shadow.normalBias = 0.12;
  sun.shadow.bias = -0.00015;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 5000;
  scene.add(sun, sun.target);
  const detail = new Map<string, T.Group>(),
    pending = new Set<string>(),
    failed = new Set<string>();
  const raycaster = new T.Raycaster(),
    pointer = new T.Vector2(),
    projected = new T.Vector3();
  const [west, south] = project([campusBounds[0], campusBounds[1]]),
    [east, north] = project([campusBounds[2], campusBounds[3]]);
  const campusCenter = new T.Vector3(
    (west + east) / 2,
    groundHeightAt((west + east) / 2, (north + south) / 2),
    (north + south) / 2,
  );
  const viewDirection = new T.Vector3(-2200, 2200, 2200);
  let frame = 0,
    disposed = false,
    frames = 0,
    selected: string | null = null;
  let view: CampusView = { kind: "overview", span: 1900 };
  let buildingLabels = false,
    loaded = false,
    geometryBuilds = 0,
    shadowDirty = true,
    lastShadowKey = "",
    lastSize = "",
    navigating = false;
  const baseWidth = 1900;
  const motion = createCameraMotion(camera, controls, requestRender);
  let previousView = restore?.previous;
  function cameraView(): CameraView {
    return {
      view: { ...view },
      target: controls.target.toArray(),
      ground: groundHeightAt(controls.target.x, controls.target.z),
      zoom: camera.zoom,
      navigating,
      buildingLabels,
    };
  }
  function state() {
    if (!disposed)
      onDetailState({ loading: pending.size, failed: [...failed] });
  }
  function loadDistrict(id: string) {
    if (detail.has(id) || pending.has(id) || failed.has(id) || disposed) return;
    pending.add(id);
    state();
    return loaders[id]()
      .then((module) => {
        if (disposed) return;
        const group = module.default();
        applyBuildingShadows(group);
        if (disposed) {
          disposeGroup(group);
          return;
        }
        geometryBuilds++;
        detail.set(id, group);
        scene.add(group);
        const fallback = overview.get(id);
        if (fallback) {
          scene.remove(fallback);
          disposeGroup(fallback);
          overview.delete(id);
        }
        shadowDirty = true;
      })
      .catch((error) => {
        if (!disposed) {
          console.warn(`Campus district ${id} is using its overview`, error);
          failed.add(id);
        }
      })
      .finally(() => {
        pending.delete(id);
        state();
        requestRender();
      });
  }
  async function loadCampus() {
    // Build each district once at startup. Yield between districts so the map
    // can paint and accept input; zooming/panning never rebuilds or hides panes.
    for (const id of Object.keys(loaders)) {
      if (disposed) return;
      await loadDistrict(id);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (disposed) return;
    loaded = true;
    requestRender();
  }
  function availableSpace() {
    const w = host.clientWidth,
      h = host.clientHeight;
    const toolbar = mobile
      ? document.querySelector(".topbar")?.getBoundingClientRect()
      : null;
    const top = toolbar
      ? toolbar.bottom - host.getBoundingClientRect().top + 12
      : 36;
    let rect = {
      x: 18,
      y: mobile ? top : 125,
      w: Math.max(100, w - 36),
      h: Math.max(80, h - (mobile ? top + 24 : 190)),
    };
    const panel = document
      .querySelector(".room-detail")
      ?.getBoundingClientRect();
    if (panel && !mobile && view.kind === "building") {
      const hostRect = host.getBoundingClientRect(),
        pw = Math.max(0, panel.left - hostRect.left - rect.x - 16),
        ph = Math.max(0, panel.top - hostRect.top - rect.y - 16);
      rect =
        pw * rect.h > rect.w * ph ? { ...rect, w: pw } : { ...rect, h: ph };
    }
    return rect;
  }
  function projectionForSpace() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    const height = (baseWidth * h) / w,
      rect = availableSpace();
    const x = rect.x + rect.w / 2,
      y = rect.y + rect.h / 2;
    const cx = ((0.5 - x / w) * baseWidth) / camera.zoom,
      cy = ((y / h - 0.5) * height) / camera.zoom;
    camera.left = -baseWidth / 2 + cx;
    camera.right = baseWidth / 2 + cx;
    camera.top = height / 2 + cy;
    camera.bottom = -height / 2 + cy;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  function zoomForSpan(span: number, verticalSpan = span * 0.65) {
    const rect = availableSpace(),
      w = host.clientWidth || 900;
    return Math.max(
      controls.minZoom,
      Math.min(
        controls.maxZoom,
        (Math.min(rect.w / span, rect.h / verticalSpan) * baseWidth) / w,
      ),
    );
  }
  function fit(span: number, verticalSpan = span * 0.65) {
    camera.zoom = zoomForSpan(span, verticalSpan);
    projectionForSpace();
  }
  function moveTarget(target: T.Vector3) {
    controls.target.copy(target);
    camera.position.copy(target).add(viewDirection);
    controls.update();
  }
  function focusLocation(id: string, animate = false) {
    const location = locationForCode(id);
    if (location?.status !== "verified" || !location.coordinate) return;
    const f = campusFeatures.filter((f) => f.locations.includes(location.id));
    const box = new T.Box3();
    f.forEach((f) =>
      f.polygons.forEach((p) =>
        p[0].forEach(([x, z]) => {
          box.expandByPoint(new T.Vector3(x, buildingElevation(f).low, z));
          box.expandByPoint(
            new T.Vector3(x, buildingElevation(f).base + f.height, z),
          );
        }),
      ),
    );
    const size = box.getSize(new T.Vector3()),
      center = box.getCenter(new T.Vector3());
    const span = Math.max(110, (size.x + size.z) * 0.707 + 32),
      vertical = (size.x + size.z) * 0.408 + size.y * 0.816 + 35;
    view = { kind: "building", id, span };
    navigating = false;
    if (animate || motion.active)
      motion.to(center, zoomForSpan(span, vertical));
    else {
      moveTarget(center);
      fit(span, vertical);
    }
    requestRender();
  }
  function reset() {
    motion.cancel();
    buildingLabels = false;
    view = { kind: "overview", span: mobile ? 1100 : 1900 };
    navigating = false;
    moveTarget(
      mobile ? new T.Vector3(170, groundHeightAt(170, 130), 130) : campusCenter,
    );
    fit(view.span, mobile ? 1 : 1050);
    requestRender();
  }
  function focusDistrict(id: string) {
    motion.cancel();
    const district = districts.find((d) => d.id === id);
    if (!district) return;
    const [x, z] = project(district.coordinate);
    view = { kind: "district", id, span: district.span };
    navigating = false;
    motion.to(
      new T.Vector3(x, groundHeightAt(x, z) + 10, z),
      zoomForSpan(district.span, district.span * 0.75),
    );
    requestRender();
  }
  function focusBridge(id: string) {
    motion.cancel();
    const bridge = campusBridges.find((b) => b.id === id);
    if (!bridge) return;
    const box = new T.Box3();
    for (const s of bridge.samples) {
      const [x, z] = bridge.pointAt(s);
      box.expandByPoint(new T.Vector3(x, groundHeightAt(x, z), z));
      box.expandByPoint(new T.Vector3(x, bridge.deckAt(s) + 5, z));
    }
    for (const point of bridgeAccessBounds(bridge)) {
      box.expandByPoint(point);
      box.expandByPoint(point.clone().add(new T.Vector3(0, 1.2, 0)));
    }
    const size = box.getSize(new T.Vector3()),
      center = box.getCenter(new T.Vector3());
    const span = Math.max(110, (size.x + size.z) * 0.707 + 65);
    view = { kind: "bridge", id, span };
    navigating = false;
    moveTarget(center);
    fit(span, (size.x + size.z) * 0.408 + size.y * 0.816 + 60);
    requestRender();
  }
  function positionLabels(pixelsPerMeter: number) {
    const w = host.clientWidth,
      h = host.clientHeight,
      hostBounds = host.getBoundingClientRect();
    const reserved = [
      ...host.parentElement!.querySelectorAll(
        ".iso-heading,.iso-controls,.iso-footer,.campus-district-menu",
      ),
      ...document.querySelectorAll(".room-detail, .topbar"),
    ].map((e) => e.getBoundingClientRect());
    const occupied: { x: number; y: number; width: number; height: number }[] =
      [];
    const priority = (l: (typeof campusLocations)[number]) =>
      (l.id === selected ? -100 : 0) +
      (l.district === view.id ? -20 : 0) +
      (["alh", "llib", "slib", "sc"].includes(l.id) ? 10 : 0) -
      (l.height || 0) / 10;
    const locations = campusLocations
      .filter((l) => l.status === "verified")
      .sort((a, b) => priority(a) - priority(b));
    const items = [
      ...locations.map((l) => ({
        id: l.id,
        coordinate: l.coordinate!,
        height: l.height || 10,
        visible: buildingLabels || l.id === selected,
      })),
      ...districts.map((d) => ({
        id: `district:${d.id}`,
        coordinate: d.coordinate,
        height: 35,
        visible: !buildingLabels,
      })),
      {
        id: "park",
        coordinate: [-117.8426, 33.6461],
        height: 0,
        visible: pixelsPerMeter < 3,
      },
    ];
    for (const item of items) {
      const el = labels.get(item.id);
      if (!el) continue;
      const [xx, zz] = project(item.coordinate);
      projected
        .set(xx, locationElevation(item.id, [xx, zz]) + item.height + 7, zz)
        .project(camera);
      let x = (projected.x * 0.5 + 0.5) * w,
        y = (-projected.y * 0.5 + 0.5) * h;
      const width = item.id.startsWith("district:")
          ? el.offsetWidth || 145
          : item.id === "park"
            ? 90
            : el.offsetWidth || 60,
        height = 30;
      const blocked = (x: number, y: number) =>
        reserved.some(
          (r) =>
            r.width > 0 &&
            r.height > 0 &&
            x + width / 2 > r.left - hostBounds.left &&
            x - width / 2 < r.right - hostBounds.left &&
            y > r.top - hostBounds.top &&
            y - height < r.bottom - hostBounds.top,
        ) ||
        x < width / 2 + 8 ||
        x > w - width / 2 - 8 ||
        y < 25 ||
        y > h - 14 ||
        occupied.some(
          (p) =>
            Math.abs(p.x - x) < (p.width + width) / 2 + 8 &&
            Math.abs(p.y - y) < 34,
        );
      if (item.visible && item.id.startsWith("district:") && blocked(x, y)) {
        const offset = [
          [0, -36],
          [0, 36],
          [0, -72],
          [0, 72],
          [-60, -36],
          [60, 36],
        ].find(([dx, dy]) => !blocked(x + dx, y + dy));
        if (offset) {
          x += offset[0];
          y += offset[1];
        }
      }
      const hidden = !item.visible || blocked(x, y);
      el.hidden = hidden;
      el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
      if (!hidden) occupied.push({ x, y, width, height });
    }
  }
  function render() {
    frame = 0;
    if (disposed) return;
    // Finish camera restoration even while search or room details cover the map.
    motion.step();
    if (
      !host.clientWidth ||
      !host.clientHeight ||
      getComputedStyle(host).visibility === "hidden"
    )
      return;
    const shift = new T.Vector3(
      Math.max(west, Math.min(east, controls.target.x)) - controls.target.x,
      0,
      Math.max(north, Math.min(south, controls.target.z)) - controls.target.z,
    );
    controls.target.add(shift);
    camera.position.add(shift);
    projectionForSpace();
    const ppm = (host.clientWidth / baseWidth) * camera.zoom;
    buildingLabels =
      (view.kind === "district" && !navigating) ||
      ppm > (buildingLabels ? 0.5 : 0.85);
    const shadowKey = `${Math.round(controls.target.x / 60)}:${Math.round(controls.target.z / 60)}:${Math.round(camera.zoom * 5)}`;
    if (shadowDirty || shadowKey !== lastShadowKey) {
      const extent = Math.max(
        110,
        Math.min(1300, (baseWidth / camera.zoom) * 0.7),
      );
      sun.target.position.copy(controls.target);
      sun.position.copy(controls.target).add(new T.Vector3(-900, 1500, -800));
      Object.assign(sun.shadow.camera, {
        left: -extent,
        right: extent,
        top: extent,
        bottom: -extent,
      });
      sun.shadow.camera.updateProjectionMatrix();
      renderer.shadowMap.needsUpdate = true;
      lastShadowKey = shadowKey;
      shadowDirty = false;
    }
    renderer.info.reset();
    renderer.render(scene, camera);
    const renderId = renderIdForLocation(selected);
    if (renderId) outline.render(renderer, scene, camera, renderId);
    frames++;
    host.dataset.ready = String(loaded);
    host.dataset.frames = String(frames);
    host.dataset.triangles = String(renderer.info.render.triangles);
    host.dataset.drawCalls = String(renderer.info.render.calls);
    host.dataset.lod = "full";
    host.dataset.terrainRelief = String(terrainRelief);
    host.dataset.terrainEnabled = String(terrainEnabled);
    host.dataset.terrainShadows = String(shadows.terrainShadows);
    host.dataset.buildingShadows = String(shadows.buildingShadows);
    let structureCasters = 0;
    scene.traverse((object) => {
      if (
        object instanceof T.Mesh &&
        object.castShadow &&
        object.userData.structureCaster
      )
        structureCasters++;
    });
    host.dataset.buildingShadowCasters = String(structureCasters);
    host.dataset.bridges = String(campusBridges.length);
    host.dataset.view = view.kind === "bridge" ? view.id! : view.kind;
    host.dataset.geometryBuilds = String(geometryBuilds);
    host.dataset.loaded = [...detail.keys()].join(",");
    host.dataset.selected = selected || "";
    host.dataset.zoom = String(camera.zoom);
    host.dataset.target = JSON.stringify(controls.target.toArray());
    host.dataset.animating = String(motion.active);
    positionLabels(ppm);
  }
  function requestRender() {
    if (!disposed && !frame) frame = requestAnimationFrame(render);
  }
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    const key = `${w}:${h}`;
    if (key === lastSize) return;
    lastSize = key;
    renderer.setSize(w, h, false);
    outline.resize(w, h, renderer.getPixelRatio());
    if (!navigating) {
      if (view.kind === "building" && view.id) focusLocation(view.id);
      else if (view.kind === "bridge" && view.id) focusBridge(view.id);
      else
        fit(
          view.span,
          view.kind === "overview" ? (mobile ? 1 : 1050) : view.span * 0.75,
        );
    }
    projectionForSpace();
    shadowDirty = true;
    requestRender();
  }
  const change = () => requestRender();
  controls.addEventListener("change", change);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const layoutObserver = new MutationObserver(() => {
    if (view.kind === "building" && view.id && !navigating)
      focusLocation(view.id);
    else requestRender();
  });
  const workspace = host.closest(".app");
  if (workspace)
    layoutObserver.observe(workspace, {
      attributes: true,
      attributeFilter: ["class"],
    });
  const tap = (e: PointerEvent) => {
    const box = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - box.left) / box.width) * 2 - 1,
      (-(e.clientY - box.top) / box.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const targets = [
      landscape,
      bridges,
      ...overview.values(),
      ...detail.values(),
    ].filter((o) => o.visible);
    const hits = raycaster
      .intersectObjects(targets, true)
      .filter((hit) => hit.object.visible);
    const hit = hits[0];
    const id =
      hit?.face &&
      (hit.object as T.Mesh).geometry
        .getAttribute("buildingId")
        ?.getX(hit.face.a);
    if (id) {
      const location = locationForHit(id, hit.point.x, hit.point.z);
      if (location) {
        onPick(location.id);
        return;
      }
    }
    onDismiss();
  };
  const unbindInput = bindMapInput(
    host,
    tap,
    () => {
      navigating = true;
    },
    () => motion.cancel(),
  );
  const lost = (e: Event) => {
    e.preventDefault();
    onError();
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  if (restore) {
    view = { ...restore.view };
    selected = restore.selected;
    buildingLabels = restore.buildingLabels;
    navigating = true;
    const target = new T.Vector3(...restore.target);
    target.y += groundHeightAt(target.x, target.z) - restore.ground;
    moveTarget(target);
    camera.zoom = restore.zoom;
    resize();
    navigating = restore.navigating;
    if (!navigating && view.kind === "building" && view.id)
      focusLocation(view.id);
  } else {
    reset();
    resize();
  }
  void loadCampus();
  return {
    reset,
    focusDistrict,
    focusBridge,
    setShadows(next: Pick<MapSettings, "terrainShadows" | "buildingShadows">) {
      if (
        next.terrainShadows === shadows.terrainShadows &&
        next.buildingShadows === shadows.buildingShadows
      )
        return;
      const terrainChanged = next.terrainShadows !== shadows.terrainShadows;
      shadows = {
        terrainShadows: next.terrainShadows,
        buildingShadows: next.buildingShadows,
      };
      if (terrainChanged)
        setCampusTerrainShadows(landscape, shadows.terrainShadows);
      for (const group of [bridges, ...overview.values(), ...detail.values()])
        applyBuildingShadows(group);
      shadowDirty = true;
      requestRender();
    },
    snapshot(): CampusViewSnapshot {
      return {
        ...cameraView(),
        selected,
        previous: previousView,
      };
    },
    redraw: requestRender,
    // Browsers cache rejected ES module fetches; a page reload clears that cache.
    // Room/building URLs are retained, and the overview remains usable meanwhile.
    retryDetails() {
      window.location.reload();
    },
    zoom(factor: number) {
      motion.cancel();
      navigating = true;
      camera.zoom = Math.max(
        controls.minZoom,
        Math.min(controls.maxZoom, camera.zoom * factor),
      );
      requestRender();
    },
    pan(x: number, z: number) {
      motion.cancel();
      navigating = true;
      const v = new T.Vector3(
        (x * 12) / camera.zoom,
        0,
        (z * 12) / camera.zoom,
      );
      controls.target.add(v);
      camera.position.add(v);
      controls.update();
      requestRender();
    },
    select(id: string | null, animate = true) {
      const changed = selected !== id;
      if (changed && id && !selected) previousView = cameraView();
      selected = id;
      if (changed && id) focusLocation(id, animate);
      else if (changed && previousView) {
        const previous = previousView;
        previousView = undefined;
        view = { ...previous.view };
        // Preserve the exact preselection camera through the sheet resize.
        navigating = true;
        const target = new T.Vector3(...previous.target);
        target.y += groundHeightAt(target.x, target.z) - previous.ground;
        motion.to(target, previous.zoom, () => {
          navigating = previous.navigating;
          buildingLabels = previous.buildingLabels;
        });
      }
      requestRender();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      layoutObserver.disconnect();
      controls.dispose();
      unbindInput();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      disposeGroup(scene);
      sun.shadow.dispose();
      outline.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
