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

// Frame-all: pull current planet world positions from a provider registered
// by Scene.tsx (only it knows the layout). Decouples cameraControls from
// React state without making it import the store.
let positionsProvider: (() => Vector3[]) | null = null;

export function setFramePositionsProvider(
  fn: (() => Vector3[]) | null,
): void {
  positionsProvider = fn;
}

/**
 * Fit all current planets into the viewport. Preserves the user's current
 * view direction (pitch + azimuth) — only re-centers the target and pushes
 * the camera back along the existing forward axis.
 */
export function frameAll(padding = 1.25): void {
  if (!bridge.controls || !bridge.camera || !positionsProvider) return;
  const positions = positionsProvider();
  if (positions.length === 0) return;

  const center = new Vector3();
  for (const p of positions) center.add(p);
  center.divideScalar(positions.length);

  let maxR = 0;
  for (const p of positions) {
    const d = p.distanceTo(center);
    if (d > maxR) maxR = d;
  }
  // Add a planet-size margin so labels/health chips don't clip at the edge.
  maxR = Math.max(maxR, 1) + 1.2;

  const camera = bridge.camera;
  const fovRad = (camera.fov * Math.PI) / 180;
  const distance = (maxR / Math.tan(fovRad / 2)) * padding;

  const dir = new Vector3()
    .subVectors(camera.position, bridge.controls.target)
    .normalize();
  if (dir.lengthSq() === 0) dir.set(0, 0.5, 1).normalize();

  bridge.controls.target.copy(center);
  camera.position.copy(center).addScaledVector(dir, distance);
  bridge.controls.update();
}
