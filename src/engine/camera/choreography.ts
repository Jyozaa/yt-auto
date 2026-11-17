import * as THREE from 'three';
import type {Shot} from '../../story/timeline';
import {glide} from './easing';

export const clamp = (t: number) => Math.min(1, Math.max(0, t));
export const smooth = (t: number) => { const u = clamp(t); return u * u * (3 - 2 * u); };
const vector = (value: readonly [number, number, number]) => new THREE.Vector3(...value);

type Track = (id: string, frame: number) => THREE.Vector3 | undefined;
const lerp = THREE.MathUtils.lerp;
const impact = new Set(['impact', 'snap', 'wood-hit', 'metal-hit', 'stone-hit']);

export function cameraPose(shot: Shot, frame: number, track?: Track) {
  const c = shot.beat.camera;
  const t = clamp((frame - shot.start) / (shot.end - shot.start - 1));
  const hit = frame - shot.emphasis;
  const moment = shot.emphasis < 0 ? 0 : smooth((hit + 2) / 10) - smooth((hit - 12) / 24);
  const progress = c.motion === 'push' ? t : .17 * t + .83 * glide(t);
  const position = vector(c.from).lerp(vector(c.to), progress);
  const look = vector(c.look).lerp(vector(c.lookTo ?? c.look), progress);
  const focus = c.focusTo ? look.clone().lerp(vector(c.focusTo), t) : look.clone();
  if (c.motion === 'whip') {
    position.x += moment * .32;
    look.y -= moment * .14;
  }
  position.lerp(look, moment * .042);
  let fov = c.fov - 1.3 * moment;
  let roll = c.roll * Math.sin(t * Math.PI * .85);
  let blur = c.blur;

  // Bridge story.ts composes the active camera keys in order with smootherstep.
  // The keyed framing gets a bounded push over the rest of its shot.
  for (const key of shot.cameraKeys ?? []) {
    if (frame < key.frame) break;
    const weight = key.cut ? 1 : glide((frame - key.frame) / (key.glide ?? 24));
    const p = vector(key.position), target = vector(key.look), focal = vector(key.focus ?? key.look);
    const subject = key.track && track?.(key.track, frame);
    if (subject) { target.add(subject); focal.add(subject); }
    const drift = Math.exp(-.0013 * Math.max(0, frame - key.frame));
    position.lerp(p.lerp(target, 1 - drift), weight);
    look.lerp(target, weight);
    focus.lerp(focal, weight);
    fov = lerp(fov, key.fov ?? c.fov, weight);
    roll = lerp(roll, key.roll ?? c.roll, weight);
    blur = lerp(blur, key.blur ?? c.blur, weight);
  }
  const cue = shot.sounds.find((s) => impact.has(s.kind) && frame >= s.frame && frame - s.frame < 7);
  const age = cue ? frame - cue.frame : 7;
  const kick = .044 * (-1) ** age * (1 - age / 7) ** 2;
  return {position, look, focus, fov, blur, roll: THREE.MathUtils.degToRad(roll) + kick};
}

export function choreograph(camera: THREE.PerspectiveCamera, shot: Shot, frame: number, track?: Track) {
  const {position, look, focus, fov, roll, blur} = cameraPose(shot, frame, track);
  camera.position.copy(position);
  camera.lookAt(look);
  camera.rotateZ(roll);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return {distance: Math.max(.25, focus.sub(position).dot(camera.getWorldDirection(new THREE.Vector3()))), blur};
}
