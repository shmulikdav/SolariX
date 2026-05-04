import { Vector3, type PerspectiveCamera } from 'three';

// Minimal interface that matches the three-stdlib OrbitControls API surface
// we need. Avoids depending on three-stdlib types directly (it's a transitive
// dep of @react-three/drei and not exposed in strict pnpm).
interface OrbitControlsLike {
  target: Vector3;
  update(): void;
}

interface Bridge {
  controls: OrbitControlsLike | null;
  camera: PerspectiveCamera | null;
  initialPosition: Vector3 | null;
  initialTarget: Vector3 | null;
}

const bridge: Bridge = {
  controls: null,
  camera: null,
  initialPosition: null,
  initialTarget: null,
};

export function attachControls(
  controls: OrbitControlsLike | null,
  camera: PerspectiveCamera | null,
): void {
  bridge.controls = controls;
  bridge.camera = camera;
  if (camera && !bridge.initialPosition) {
    bridge.initialPosition = camera.position.clone();
  }
  if (controls && !bridge.initialTarget) {
    bridge.initialTarget = controls.target.clone();
  }
}

export function detachControls(): void {
  bridge.controls = null;
  bridge.camera = null;
}

const ZOOM_FACTOR = 1.18;
const PAN_STEP = 2.5;

export function zoomIn(factor = ZOOM_FACTOR): void {
  if (!bridge.controls || !bridge.camera) return;
  const dir = new Vector3()
    .subVectors(bridge.controls.target, bridge.camera.position)
    .multiplyScalar(1 - 1 / factor);
  bridge.camera.position.add(dir);
  bridge.controls.update();
}

export function zoomOut(factor = ZOOM_FACTOR): void {
  zoomIn(1 / factor);
}

/**
 * Pan in screen-relative units. dx pans right (positive) / left (negative);
 * dy pans up (positive) / down (negative). We translate both the camera and
 * the orbit target so the orbit pivot moves with the view.
 */
export function pan(dx: number, dy: number): void {
  if (!bridge.controls || !bridge.camera) return;
  const camera = bridge.camera;

  // Camera-aligned right / up vectors.
  const forward = new Vector3()
    .subVectors(bridge.controls.target, camera.position)
    .normalize();
  const right = new Vector3().crossVectors(forward, camera.up).normalize();
  const up = new Vector3().crossVectors(right, forward).normalize();

  const offset = new Vector3()
    .addScaledVector(right, dx * PAN_STEP)
    .addScaledVector(up, dy * PAN_STEP);

  camera.position.add(offset);
  bridge.controls.target.add(offset);
  bridge.controls.update();
}

export const panLeft = (): void => pan(-1, 0);
export const panRight = (): void => pan(1, 0);
export const panUp = (): void => pan(0, 1);
export const panDown = (): void => pan(0, -1);

export function reset(): void {
  if (!bridge.controls || !bridge.camera) return;
  if (bridge.initialPosition) bridge.camera.position.copy(bridge.initialPosition);
  if (bridge.initialTarget) bridge.controls.target.copy(bridge.initialTarget);
  bridge.controls.update();
}
