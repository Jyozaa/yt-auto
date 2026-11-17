// Five-stop sky shader from world.ts. Copyright (c) 2026 Mr omi. See docs/LICENSE-MR-OMI.
import * as THREE from 'three';
import {NOINK} from '../effects/ink';
import {untone} from './shade';
import type {WorldLook} from './lights';

export function makeSky(radius: number) {
  const material = new THREE.ShaderMaterial({
    uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
      c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
      void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
        vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
        c = mix(c, c2, smoothstep(e.x, e.y, el));
        c = mix(c, c3, smoothstep(e.y, e.z, el));
        c = mix(c, c4, smoothstep(e.z, e.w, el));
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), material);
  sky.renderOrder = -1; sky.frustumCulled = false; sky.layers.set(NOINK);
  return sky;
}

export function colorSky(sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>, look: WorldLook['sky']) {
  const u = sky.material.uniforms;
  look.c.forEach((hex, i) => untone(hex, u['c' + i].value));
  const e = look.e.map(THREE.MathUtils.degToRad);
  u.e.value.set(e[1], e[2], e[3], e[4]);
}
