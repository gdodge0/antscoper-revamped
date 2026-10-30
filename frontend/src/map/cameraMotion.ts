import { OrthographicCamera, Vector3 } from "three";
import type { MapControls } from "three/addons/controls/MapControls.js";

export function createCameraMotion(
  camera: OrthographicCamera,
  controls: MapControls,
  requestRender: () => void,
) {
  let flight: {
    start: number;
    from: Vector3;
    to: Vector3;
    offset: Vector3;
    fromZoom: number;
    zoom: number;
    done?: () => void;
  } | null = null;
  return {
    get active() {
      return flight !== null;
    },
    cancel() {
      flight = null;
    },
    to(target: Vector3, zoom: number, done?: () => void) {
      flight = {
        start: performance.now(),
        from: controls.target.clone(),
        to: target.clone(),
        offset: camera.position.clone().sub(controls.target),
        fromZoom: camera.zoom,
        zoom,
        done,
      };
      if (matchMedia("(prefers-reduced-motion: reduce)").matches)
        flight.start -= 380;
      requestRender();
    },
    step() {
      if (!flight) return;
      const progress = Math.min(1, (performance.now() - flight.start) / 380);
      const eased = progress * progress * (3 - 2 * progress);
      controls.target.lerpVectors(flight.from, flight.to, eased);
      camera.position.copy(controls.target).add(flight.offset);
      camera.zoom =
        flight.fromZoom * Math.pow(flight.zoom / flight.fromZoom, eased);
      camera.updateProjectionMatrix();
      controls.update();
      if (progress === 1) {
        const done = flight.done;
        flight = null;
        done?.();
      } else requestRender();
    },
  };
}
