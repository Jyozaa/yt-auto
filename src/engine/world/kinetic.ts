import * as T from 'three';
import {fps, type Scene} from '../../story/schema';
import type {WorldState} from '../../story/world-events';
import {NOINK} from '../effects/ink';
import type {Assembly} from './scenery';

const TAU = Math.PI * 2;
type Surface = (color: string) => T.Material;
type Animator = (state: WorldState, frame: number) => void;
export const kineticEnvironments = ['lake', 'mine', 'cross-section', 'canal'] as const;
type Environment = typeof kineticEnvironments[number];

function beam(build: Assembly, root: T.Object3D, mat: T.Material, a: number[], b: number[], size: number) {
  const from = new T.Vector3().fromArray(a), to = new T.Vector3().fromArray(b);
  const direction = to.clone().sub(from);
  const mid = from.lerp(to, .5);
  const piece = build.box(root, mat, mid.x, mid.y, mid.z, size, direction.length(), size);
  piece.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize());
  return piece;
}

function unoutlined(mesh: T.Mesh) {
  mesh.layers.set(NOINK);
  mesh.castShadow = false;
  return mesh;
}

function cypress(build: Assembly, parent: T.Object3D, surface: Surface, x: number, z: number, size: number, y = 0) {
  const trunk = surface('#655046'), dark = surface('#3d6051'), light = surface('#62805b');
  build.cylinder(parent, trunk, x, y + .29 * size, z, .078 * size, .132 * size, .64 * size, 7);
  for (let n = 0; n < 3; n++) {
    const canopy = build.mesh(parent, new T.IcosahedronGeometry((.35 - n * .032) * size, 1),
      n === 1 ? light : dark, x + n * .06 * size, y + (.64 + .18 * n) * size, z + .035 * n);
    canopy.scale.set(1.11, 1.02, .87);
  }
}

function waves(build: Assembly, root: T.Object3D, extent: number, bands = 37) {
  const geometry = new T.PlaneGeometry(extent, extent, bands, bands).rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position') as T.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3).setUsage(T.DynamicDrawUsage));
  position.setUsage(T.DynamicDrawUsage);
  const water = new T.MeshLambertMaterial({vertexColors: true, side: T.DoubleSide});
  const mesh = unoutlined(build.mesh(root, geometry, water, 0, 0, 0));
  mesh.frustumCulled = false;
  const green = new T.Color('#5fa5a0'), teal = new T.Color('#437c85'), ink = new T.Color('#152739'), tint = new T.Color();
  return (sample: (x: number, z: number) => {height: number; light: number; dark: number}) => {
    for (let i = 0; i < position.count; i++) {
      const {height, light, dark} = sample(position.getX(i), position.getZ(i));
      position.setY(i, height);
      tint.copy(teal).lerp(green, light).lerp(ink, dark);
      tint.toArray(colors, i * 3);
    }
    position.needsUpdate = true;
    geometry.getAttribute('color').needsUpdate = true;
    geometry.computeVertexNormals();
  };
}

function ripples(build: Assembly, root: T.Object3D, count: number, length: number, color = '#b1e1c2') {
  const material = new T.MeshBasicMaterial({color, transparent: true, opacity: .65, side: T.DoubleSide, depthWrite: false});
  const strips = Array.from({length: count}, () => {
    const geometry = new T.PlaneGeometry(1, 1, length - 1, 1);
    const mesh = unoutlined(build.mesh(root, geometry, material, 0, 0, 0));
    mesh.frustumCulled = false;
    return mesh;
  });
  return (sample: (i: number, along: number, edge: number) => [number, number, number], opacity = .65) => {
    material.opacity = opacity;
    strips.forEach((strip, i) => {
      const position = strip.geometry.getAttribute('position');
      for (let n = 0; n < length * 2; n++) {
        const [x, y, z] = sample(i, n % length / (length - 1), n < length ? -1 : 1);
        position.setXYZ(n, x, y, z);
      }
      position.needsUpdate = true;
    });
  };
}

function lake(build: Assembly, root: T.Group, surface: Surface): Animator {
  const ground = surface('#657f58'), mud = surface('#8d755d'), bank = surface('#a3966d');
  const basin = new T.PlaneGeometry(100, 100, 74, 74).rotateX(-Math.PI / 2);
  const basinPoints = basin.getAttribute('position');
  for (let i = 0; i < basinPoints.count; i++) {
    const r = Math.hypot(basinPoints.getX(i), basinPoints.getZ(i));
    basinPoints.setY(i, -2.67 - 2.1 * Math.exp(-r * r / 14.0) + .29 * Math.min(1, r / 19));
  }
  basin.computeVertexNormals();
  const floor = build.mesh(root, basin, mud, 0, -.18, 0);
  floor.castShadow = false;
  for (let i = 0; i < 15; i++) {
    const a = i * TAU / 15;
    const x = Math.cos(a) * 24, z = Math.sin(a) * 24;
    const island = build.mesh(root, new T.IcosahedronGeometry(1, 2), i % 5 === 1 ? bank : ground, x, -.7, z);
    island.scale.set(11, 1.9 + .55 * Math.sin(i * 3), 7.7);
    island.rotation.y = -a;
    for (let j = 0; j < 5; j++) {
      cypress(build, root, surface, x + Math.sin(i * 7 + j * 12) * 5.2, z + Math.cos(i * 8 + j * 5) * 3.7, 1.4 + ((j * 5 + i) % 7) * .54, .52);
    }
  }
  const farGrass = surface('#5f7756'), distant = surface('#526e62');
  for (let i = 0; i < 11; i++) {
    const a = i * TAU / 11, x = Math.cos(a) * 50, z = Math.sin(a) * 49;
    const land = build.mesh(root, new T.IcosahedronGeometry(1, 2), i % 2 ? farGrass : distant, x, -1, z);
    land.rotation.y = -.8 * a;
    land.scale.set(17, 4.3 + 1.3 * Math.sin(i * 4), 13);
    for (let j = 0; j < 3; j++) {
      cypress(build, root, surface, x + Math.sin(i + j) * 9, z + Math.cos(i + 2 * j) * 7, 2.1 + (i + j) % 3, 1.9);
    }
  }
  const ripple = ripples(build, root, 26, 22);
  const wakes = ripples(build, root, 22, 10, '#a6cfbc');
  const water = waves(build, root, 66, 72);
  const rubble = Array.from({length: 20}, (_, i) => build.mesh(root, new T.IcosahedronGeometry(.13 + i % 5 * .051),
    i % 2 ? mud : bank, 0, 0, 0));
  const splash = Array.from({length: 22}, (_, i) => unoutlined(build.mesh(root, new T.IcosahedronGeometry(.055 + (i % 4) * .031),
    new T.MeshBasicMaterial({color: i % 3 ? '#afdbc5' : '#e1eee2'}), 0, 0, 0)));
  return (s, frame) => {
    const time = frame / fps;
    const height = (x: number, z: number) => {
      const r = Math.hypot(x, z);
      const theta = Math.atan2(z, x);
      return s.level - 2.6 * s.vortex * Math.exp(-r * r / (1.35 + s.vortex * 9)) +
        Math.sin(theta * 4 - r * 1.7 + s.swirl * 4 + time * 1.3) * .26 * s.vortex * Math.exp(-r / 9) +
        Math.sin(x * 1.77 + z * .56 + time * 2.4) * .035 + Math.sin(x * .36 - z * 1.24 + time * 1.6) * .049;
    };
    water((x, z) => {
      const r = Math.hypot(x, z);
      return {height: height(x, z), light: .46 + .275 * Math.sin(x * .64 + z * .62 + time * 2.4),
        dark: s.vortex * Math.exp(-r * r / 13)};
    });
    ripple((i, along, edge) => {
      const a = i * TAU / 26 + along * (1.01 + s.vortex * 1.42) - time * (.32 + s.vortex * .54);
      const r = (1.1 + (i % 8) * 1.08) * (.24 + s.vortex * 1.45) *
        (1.15 - along * .57) + edge * (.017 + .054 * s.vortex) * Math.sin(along * Math.PI);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      return [x, height(x, z) + .107 + .15 * s.vortex, z];
    }, Math.min(.86, s.vortex * 1.25));
    wakes((i, along, edge) => {
      const x = Math.sin(i * 25.1) * 19 + along * 1.22 + Math.sin(time + i) * .17;
      const z = Math.cos(i * 34.8) * 16 + edge * .048 * Math.sin(along * Math.PI) + along * .36;
      return [x, height(x, z) + .052, z];
    }, .30);
    rubble.forEach((rock, i) => {
      const angle = i * 2.3 + s.swirl * (i % 3 + 1) * .47;
      const r = (2.2 + i * .39) * (1 - .73 * s.sink);
      rock.visible = s.lean > i * .012 && s.refill < .52;
      rock.position.set(Math.cos(angle) * r, s.level + .07 + Math.sin(time * 3 + i) * .13, Math.sin(angle) * r);
      rock.rotation.set(time * .79 + i, angle, time * 1.13);
    });
    splash.forEach((drop, i) => {
      drop.visible = s.collision > 0;
      const phase = (17 * (1 - s.collision) + i % 8) / 17;
      const a = i * 2.4;
      const r = .67 + phase * (1.6 + i % 5);
      drop.position.set(Math.cos(a) * r, s.level + Math.max(0, Math.sin(phase * Math.PI)) * (1.1 + (i % 7) * .38), Math.sin(a) * r);
    });
  };
}

function mine(build: Assembly, root: T.Group, surface: Surface): Animator {
  const rock = surface('#80706d'), shadow = surface('#3e3744'), wood = surface('#715047'), stone = surface('#b4a697');
  const lamp = new T.MeshBasicMaterial({color: '#ffce75'});
  const alarm = new T.MeshBasicMaterial({color: '#812f35'});
  const overhead = build.box(root, shadow, 0, 3.83, -8.9, 7.21, .44, 27.0);
  overhead.castShadow = false;
  unoutlined(build.box(root, alarm, 1.89, 2.63, -7.95, .25, .39, .068));
  build.box(root, rock, 0, -.33, -6, 14, .65, 36);
  build.box(root, shadow, 0, 2.0, -21, 15, 5.4, 1.4);
  build.box(root, stone, 0, .25, 6, 5, .45, 6.8);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const z = 3.7 - i * 2.7;
      const rib = build.box(root, stone, side * 3.05, 1.96, z, 1.26, 4.61, 2.45);
      rib.rotation.z = side * (.13 + Math.sin(i * 2) * .06);
      build.box(root, wood, side * 2.08, 1.8, z, .28, 3.6, .31);
      build.box(root, wood, 0, 3.51, z, 4.63, .33, .32);
      if ((i + Number(side > 0)) % 2) continue;
      build.box(root, shadow, side * 1.96, 2.70, z + .17, .29, .45, .24);
      unoutlined(build.box(root, lamp, side * 1.96, 2.71, z + .302, .21, .32, .02));
    }
    build.box(root, shadow, side * 3.5, 1.8, -9, 1.22, 4.1, 28);
  }
  const water = waves(build, root, 1, 25);
  const wet = root.children.at(-1)!;
  wet.scale.set(4.1, 1, 32);
  const front = ripples(build, root, 11, 15, '#b4e2ce');
  return (s, frame) => {
    const time = frame / fps;
    const edge = -14 + s.flood * 19.4;
    alarm.color.set(s.alarm ? '#ffc26e' : '#812f35');
    wet.position.z = -11;
    water((x, scaledZ) => {
      const z = scaledZ * 32 - 11;
      return {height: z < edge ? .17 + s.flood * .09 + Math.sin(z * 4 - time * 7 + 4 * x) * .064 : -.37,
        light: .5 + Math.sin(time * 8 - z * 3 + x) * .3, dark: .15};
    });
    front((i, a, side) => [
      (a - .5) * 4.1, .29 + Math.sin(time * 9 + a * 6) * .041,
      edge - .38 - i * .60 + Math.sin(a * 9 + time * 5 + i) * .24 + side * .041 * Math.sin(a * Math.PI)
    ], .8 * s.flood);
  };
}

function section(build: Assembly, root: T.Group, surface: Surface): Animator {
  const clay = surface('#a27756'), loam = surface('#886955'), salt = surface('#cbb7a0'), pit = surface('#3d3444');
  const blue = new T.MeshLambertMaterial({color: '#4d969b'});
  const neck = new T.Group();
  root.add(neck);
  const halves = [-1, 1].map((side) => {
    const bank = new T.Group();
    root.add(bank);
    build.box(bank, blue, side * 3.52, .21, 0, 6.85, .48, 4.55);
    build.box(bank, clay, side * 3.52, -.48, 0, 6.85, .93, 4.5);
    build.box(bank, loam, side * 3.52, -1.34, -.15, 6.85, .72, 4.16);
    build.box(bank, salt, side * 3.52, -2.11, -.38, 6.85, .82, 3.72);
    return bank;
  });
  build.box(root, salt, 0, -5.24, -.29, 15, .75, 4.09);
  build.box(root, pit, 0, -3.83, -1.4, 14.5, 2.20, 1.15);
  for (const x of [-6.35, -3.78, -1.39, 1.39, 3.78, 6.35]) {
    build.box(root, salt, x, -3.64, .63, .56, 2.15, 2.8);
  }
  const stream = unoutlined(build.cylinder(neck, blue, 0, -2.37, .92, .48, .25, 5.07, 19));
  const jets = ripples(build, neck, 16, 15);
  const top = ripples(build, root, 10, 16, '#a1d6c1');
  const dust = Array.from({length: 12}, (_, n) => build.mesh(root, new T.IcosahedronGeometry(.14 + n % 4 * .075), n % 2 ? clay : salt, 0, 0, 0));
  return (s, frame) => {
    const t = frame / fps;
    const width = .12 + s.throat * 1.91;
    halves.forEach((bank, i) => { bank.position.x = (i * 2 - 1) * width * .495; });
    neck.visible = s.throat > .004;
    stream.scale.set(width, 1, .8 + Math.sin(t * 6) * .15);
    jets((i, a, edge) => {
      const y = .20 - ((a * 2.6 + i * .275 + t * 3.9) % 5);
      const angle = i * 1.34 + y * .65 + edge * .12;
      return [Math.cos(angle) * width * (.42 + .2 * a), y, .92 + Math.sin(angle) * (.25 + .2 * a)];
    });
    top((i, a, side) => [(i % 2 ? 1 : -1) * (.11 + width * .5 + ((i * .94 + 400 - t * (.44 + s.throat)) % 5) + a * .63),
      .458, 1.8 - Math.floor(i / 2) * .81 + Math.sin(a * Math.PI) * .10 * side], .52);
    dust.forEach((rock, i) => {
      rock.visible = s.throat > .04 && s.throat < .99;
      const p = (t * .9 + i * .128) % 1;
      rock.position.set(Math.sin(i * 6) * (.3 + width) * (1 - p * .45), -.35 - p * 4.38, 1.3 + Math.cos(i * 5) * p);
      rock.rotation.set(p * 7, i, t * 3);
    });
  };
}

function canal(build: Assembly, root: T.Group, surface: Surface): Animator {
  const clay = surface('#957d65'), green = surface('#587652');
  const water = waves(build, root, 1, 38);
  const stream = root.children.at(-1)!;
  stream.scale.set(6.5, 1, 34);
  const ribbons = ripples(build, root, 32, 13);
  const ground = (z: number) => -1.92 + 2.33 / (1 + Math.exp((z - .42) * 3.9));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = -14 + i * 4.18;
      const x = side * (8.9 + Math.sin(i * .72) * 1.52);
      const levee = build.mesh(root, new T.IcosahedronGeometry(1, 2), i % 5 === 1 ? clay : green, x, ground(z) - .89, z);
      levee.scale.set(7.25, 1.75, 4.31);
      cypress(build, root, surface, x * .64, z, 2.15 + i % 4 * .61, ground(z) + .19);
      cypress(build, root, surface, x * .84, z + 1.8, 3.1 + i % 5 * .51, ground(z) + .28);
    }
  }
  return (s, frame) => {
    const t = frame / fps;
    const height = (x: number, z: number) =>
      ground(z) + Math.sin(x * 4 + z * 4 - t * 5) * (.035 + .055 * s.reversal) + s.refill * .92 * (1 / (1 + Math.exp(-z * 2)));
    water((x, z) => ({height: height(x * 6.5, z * 34), light: .52 + Math.sin(z * 51 + x * 8 + t * 2) * .25, dark: .09}));
    ribbons((i, a, edge) => {
      const z = ((1000 + s.canalTravel + i * 1.19) % 24) - 12 + a * (1 + s.reversal * .85);
      const x = Math.cos(i * 2.38) * 2.63 + .18 * Math.sin(t + a * 3 + i) + edge * Math.sin(a * Math.PI) * (.035 + s.reversal * .05);
      return [x, height(x, z) + .096 + .13 * Math.exp(-z * z) * s.reversal, z];
    }, .48 + .34 * s.reversal);
  };
}

export function buildKineticEnvironment(build: Assembly, root: T.Group, surface: Surface, environment: Environment) {
  return {lake, mine, 'cross-section': section, canal}[environment](build, root, surface);
}

export function buildKineticProp(build: Assembly, root: T.Group, surface: Surface, entry: Scene['props'][number]): Animator {
  const start = root.position.clone(), yaw = root.rotation.y;
  const metal = surface('#515362'), dark = surface('#37333d'), rust = surface('#935746'), brass = surface('#d8a457');
  if (entry.kind === 'rig') {
    build.box(root, dark, 0, .42, 0, 4.63, .49, 4.29);
    build.box(root, rust, 0, .64, 0, 4.79, .24, 4.39);
    build.box(root, surface('#8d7561'), 0, .73, 0, 4.57, .06, 4.2);
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      beam(build, root, brass, [1.45 * x, .75, 1.12 * z - .51], [.38 * x, 5.55, .37 * z - .51], .133);
      for (let level = 0; level < 4; level++) {
        const y = .85 + level * 1.14;
        const X = 1.45 - level * .253, Z = 1.12 - level * .185;
        beam(build, root, level % 2 ? dark : metal, [X * x, y, Z * z - .51], [-(X - .25) * x, y + 1.14, (Z - .185) * z - .51], .066);
      }
      build.cylinder(root, metal, x * 1.90, -.08, z * 1.63, .17, .22, 1.3, 11);
    }
    build.box(root, brass, 0, 5.54, -.51, 1.02, .24, 1.04);
    for (const y of [2.03, 3.16, 4.31]) build.box(root, metal, 0, y, -.51, 2.85 - y * .35, .125, .15);
    for (const s of [-1, 1]) {
      beam(build, root, metal, [s * 2.24, .80, -1.98], [s * 2.24, 1.21, -1.98], .062);
      beam(build, root, metal, [s * 2.24, .80, 1.9], [s * 2.24, 1.21, 1.9], .062);
      beam(build, root, metal, [s * 2.24, 1.21, -1.98], [s * 2.24, 1.21, 1.9], .051);
    }
    const shaft = new T.Group();
    shaft.position.set(0, 1.63, .18);
    root.add(shaft);
    build.cylinder(shaft, dark, 0, .39, 0, .14, .14, 3.35, 12);
    for (let n = 0; n < 7; n++) {
      const vane = build.box(shaft, n % 2 ? brass : rust, 0, -.62 + n * .23, 0, .61, .085, .14);
      vane.rotation.y = n * .81;
    }
    build.cylinder(shaft, metal, 0, -.68, 0, .48, .48, .16, 18);
    for (let n = 0; n < 12; n++) {
      const a = n * TAU / 12;
      const tooth = build.box(shaft, n % 3 ? brass : dark, Math.cos(a) * .43, -.63, Math.sin(a) * .43, .16, .12, .14);
      tooth.rotation.y = -a;
    }
    const flywheel = new T.Group();
    root.add(flywheel);
    flywheel.position.set(.32, 1.20, .62);
    build.mesh(flywheel, new T.TorusGeometry(.31, .058, 8, 24), rust, 0, 0, 0);
    for (let n = 0; n < 3; n++) build.box(flywheel, brass, 0, 0, 0, .614, .05, .075).rotation.z = n * Math.PI / 3;
    build.cylinder(flywheel, metal, 0, 0, 0, .106, .106, .19, 11).rotation.x = Math.PI / 2;
    return (s, frame) => {
      const shake = s.strain * (.045 * Math.sin(frame * 1.73) + .025 * Math.sin(frame * 2.78));
      root.position.set(start.x + shake - .69 * s.sink, start.y + s.level * s.lean - s.sink * 6.5, start.z + .21 * s.sink);
      root.rotation.set(-.22 * s.lean + shake * .52, yaw + .67 * s.sink, .27 * s.lean + .90 * s.sink + shake);
      root.visible = s.sink < .985;
      shaft.rotation.y = s.rotation;
      shaft.position.y = 1.63 + shake * 1.32;
      flywheel.rotation.z = -s.rotation * .91;
    };
  }
  if (entry.kind === 'shore-tree') cypress(build, root, surface, 0, 0, 3.7);
  else {
    const skiff = entry.kind === 'skiff';
    const length = skiff ? 2.32 : 3.86, width = skiff ? 1.04 : 1.61;
    build.box(root, metal, 0, .12, 0, width, .38, length * .81);
    build.box(root, rust, 0, .33, 0, width * .97, .11, length * .89);
    for (const side of [-1, 1]) {
      build.box(root, brass, side * width * .45, .45, 0, .11, .19, length * .90);
      const bow = build.box(root, metal, side * width * .25, .15, skiff ? length * .42 : length * .46, width * .5, .28, .29);
      bow.rotation.y = side * (skiff ? -.57 : -.24);
    }
    if (skiff) build.box(root, dark, 0, .45, -length * .41, .27, .39, .24);
    else {
      for (const z of [-.71, .37]) {
        build.box(root, brass, 0, .55, z, width * .78, .43, .89);
        build.box(root, rust, 0, .78, z, width * .69, .055, .74);
      }
      build.box(root, surface('#ecd49c'), .13, .77, -1.24, .51, .52, .65);
      build.box(root, dark, .13, .86, -.906, .42, .24, .025);
    }
  }
  return (s, frame) => {
    const t = frame / fps, tree = entry.kind === 'shore-tree', skiff = entry.kind === 'skiff';
    const escaped = skiff && start.z > 0;
    const working = !escaped && entry.id !== 'passing-skiff';
    const flow = working ? s.drain * (tree ? Math.max(0, 2 * s.sink - .68) : 1) : 0;
    const radius = Math.hypot(start.x, start.z) * (1 - flow * (tree ? .65 : .73));
    const phase = Math.atan2(start.z, start.x) + s.swirl * flow * .61;
    root.position.set(Math.cos(phase) * radius - (escaped ? s.drain * 3.6 : 0),
      start.y + s.level + Math.sin(t * 2.8 + yaw) * .074 - (working ? s.sink * (tree ? 1.8 : .66) : 0),
      Math.sin(phase) * radius + (escaped ? s.drain * 2.5 : entry.id === 'passing-skiff' ? .021 * (frame % 280) : 0));
    root.rotation.set(.045 * Math.cos(t * 3.4) + flow * .27, yaw - s.swirl * flow * .52, flow * (tree ? 1.7 : .34));
    root.visible = !tree || s.refill < .4;
  };
}
