import * as T from 'three';

export interface Assembly {
  mesh(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number): T.Mesh;
  box(parent: T.Object3D, m: T.Material, x: number, y: number, z: number, w: number, h: number, d: number): T.Mesh;
  cylinder(parent: T.Object3D, m: T.Material, x: number, y: number, z: number, top: number, bottom: number, h: number, n?: number): T.Mesh;
}

export type Materials = {wood: T.Material; dark: T.Material; brass: T.Material};

export function arch(build: Assembly, group: T.Object3D, limestone: T.Material, trim: T.Material) {
  for (const x of [-1.27, 1.27]) {
    build.box(group, trim, x, .16, 0, .72, .32, .91);
    build.box(group, limestone, x, 1.38, 0, .42, 2.32, .63);
    build.box(group, trim, x, 2.44, 0, .69, .22, .83);
  }
  const ring = new T.Shape();
  ring.absarc(0, 0, 1.52, 0, Math.PI, false);
  ring.lineTo(-1.11, 0);
  ring.absarc(0, 0, 1.11, Math.PI, 0, true);
  ring.closePath();
  const stone = build.mesh(group, new T.ExtrudeGeometry(ring, {depth: .46, bevelEnabled: false, curveSegments: 18}), limestone, 0, 2.49, -.24);
  stone.receiveShadow = true;
  for (let i = 1; i < 8; i++) {
    const a = i * Math.PI / 8;
    const seam = build.box(group, trim, Math.cos(a) * 1.32, 2.49 + Math.sin(a) * 1.32, .223, .42, .019, .006);
    seam.rotation.z = a;
  }
}

const wheel = (build: Assembly, group: T.Object3D, material: Materials, x: number) => {
  const hub = new T.Group();
  hub.position.set(x, .435, .12);
  group.add(hub);
  build.mesh(hub, new T.TorusGeometry(.373, .047, 8, 24), material.dark, 0, 0, 0).rotation.y = Math.PI / 2;
  build.cylinder(hub, material.brass, 0, 0, 0, .099, .099, .17, 12).rotation.z = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const phase = i * Math.PI / 4;
    const spoke = build.box(hub, material.wood, 0, Math.sin(phase) * .196, Math.cos(phase) * .196, .053, .056, .36);
    spoke.rotation.x = -phase;
  }
  return hub;
};

export function cart(build: Assembly, group: T.Group, material: Materials) {
  build.box(group, material.wood, 0, .68, 0, 1.16, .14, 1.73);
  for (const x of [-.58, .58]) {
    build.box(group, material.wood, x, .97, 0, .10, .47, 1.67);
    build.box(group, material.dark, x, 1.20, 0, .12, .05, 1.73);
    build.box(group, material.wood, x * .73, .65, .99, .09, .1, .74);
  }
  build.box(group, material.wood, 0, .92, -.83, 1.2, .40, .09);
  return [wheel(build, group, material, -.64), wheel(build, group, material, .64)];
}

export function gear(build: Assembly, group: T.Group, material: Materials) {
  const rotor = new T.Group();
  rotor.position.y = .72;
  group.add(rotor);
  build.box(group, material.dark, 0, .14, -.18, 1.32, .27, .67);
  build.box(group, material.wood, 0, .51, -.21, .24, .87, .29);
  build.cylinder(rotor, material.brass, 0, 0, 0, .49, .49, .13, 28).rotation.x = Math.PI / 2;
  build.cylinder(rotor, material.dark, 0, 0, .081, .16, .16, .093).rotation.x = Math.PI / 2;
  for (let i = 0; i < 14; i++) {
    const phase = i * Math.PI / 7;
    const tooth = build.box(rotor, material.brass, Math.cos(phase) * .51, Math.sin(phase) * .51, 0, .15, .115, .13);
    tooth.rotation.z = phase;
  }
  return rotor;
}

export function rail(build: Assembly, group: T.Group, m: Materials) {
  for (const x of [-1.2, 0, 1.2]) {
    build.cylinder(group, m.dark, x, .38, 0, .039, .044, .7, 12);
    build.cylinder(group, m.brass, x, .032, 0, .135, .17, .065, 12);
    build.mesh(group, new T.SphereGeometry(.063, 10, 8), m.brass, x, .78, 0);
  }
  build.box(group, m.wood, 0, .63, 0, 2.49, .074, .099);
}

export function barrel(build: Assembly, group: T.Group, m: Materials) {
  const profile = [[.35, 0], [.405, .11], [.46, .47], [.423, .82], [.35, .93]]
    .map(([x, y]) => new T.Vector2(x, y));
  build.mesh(group, new T.LatheGeometry(profile, 24), m.wood, 0, 0, 0);
  build.cylinder(group, m.wood, 0, .916, 0, .348, .348, .026, 24);
  for (const [y, radius] of [[.12, .409], [.47, .461], [.81, .425]]) {
    build.mesh(group, new T.TorusGeometry(radius, .023, 7, 24), m.dark, 0, y, 0).rotation.x = Math.PI / 2;
  }
}

export function worktable(build: Assembly, group: T.Group, m: Materials) {
  build.box(group, m.wood, 0, 1.03, 0, 1.7, .10, .83);
  for (const x of [-.66, .66]) for (const z of [-.31, .31]) {
    build.box(group, m.wood, x, .49, z, .092, 1, .092);
  }
  build.box(group, m.dark, 0, .29, -.32, 1.37, .085, .11);
}

export function telescope(build: Assembly, group: T.Group, m: Materials) {
  const body = new T.Group();
  body.position.y = 1.31;
  body.rotation.z = -.36;
  group.add(body);
  build.cylinder(body, m.brass, 0, 0, 0, .079, .135, 1.02, 20).rotation.z = Math.PI / 2;
  build.cylinder(body, m.dark, .51, 0, 0, .135, .135, .085, 24).rotation.z = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const leg = new T.Group();
    leg.position.y = 1.14;
    leg.rotation.y = i * Math.PI * 2 / 3;
    group.add(leg);
    build.box(leg, m.wood, .21, -.54, 0, .064, 1.18, .068).rotation.z = .36;
  }
}
