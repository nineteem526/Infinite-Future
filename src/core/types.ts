export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Vec3Tuple = [number, number, number];

export interface LookDelta {
  x: number;
  y: number;
}

export interface PoseSnapshot {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  grounded: boolean;
}
