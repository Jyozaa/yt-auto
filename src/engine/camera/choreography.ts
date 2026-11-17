import * as THREE from 'three';
import type {Shot} from '../../story/timeline';

export const clamp = (t: number) => Math.min(1, Math.max(0, t));
export const smooth = (t: number) => { const u = clamp(t); return u * u * (3 - 2 * u); };
const smoother = (t: number) => t ** 3 * (10 + t * (-15 + 6 * t));

export function choreograph(camera: THREE.PerspectiveCamera, shot: Shot, frame: number) {
  const c = shot.beat.camera;
  const t = clamp((frame - shot.start) / (shot.end - shot.start - 1));
  const hit = frame - shot.emphasis;
  const moment = shot.emphasis < 0 ? 0 : smooth((hit + 2) / 10) - smooth((hit - 12) / 24);
  const progress = c.motion === 'push' ? t : 0.17 * t + 0.83 * smoother(t);
  const look = new THREE.Vector3(...c.look).lerp(new THREE.Vector3(...(c.lookTo ?? c.look)), progress);
  camera.position.set(...c.from).lerp(new THREE.Vector3(...c.to), progress);
  if (c.motion === 'whip') camera.position.x += moment * 0.32;
  camera.position.lerp(look, moment * 0.042);
  camera.lookAt(look);
  const impact = shot.sounds.find((cue) => cue.kind === 'impact' && frame >= cue.frame && frame - cue.frame < 7);
  const age = impact ? frame - impact.frame : 7;
  const kick = 0.044 * (-1) ** age * (1 - age / 7) ** 2;
  camera.rotateZ(THREE.MathUtils.degToRad(c.roll) * Math.sin(t * Math.PI * .85) + kick);
  camera.fov = c.fov - 1.3 * moment;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const focus = look.clone().lerp(new THREE.Vector3(...(c.focusTo ?? look.toArray())), t);
  return {
    distance: Math.max(.25, focus.sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()))),
    blur: c.blur
  };
}
