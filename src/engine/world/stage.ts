import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Assembly} from './scenery';
import {arch, cart, gear, rail, barrel, worktable, telescope} from './scenery';
import {StoryCast} from '../characters/story-cast';
import {Batch, house, kitClone} from './build';
import {makeSky, colorSky} from './sky';
import {NOINK} from '../effects/ink';
import {cameraPose, choreograph, smooth} from '../camera/choreography';
import {fps, type Story} from '../../story/schema';
import type {Shot} from '../../story/timeline';
import {LOOK, LIGHTS} from './lights';
import {CHAR, TONE, twoTone, untone} from './shade';
import {ctex, rep, planksHD, grassHD, stoneHD, cloudHD, jit, cobbleHD} from './paint';

const groundStone = () => ctex('rotunda-floor', 512, 512, (g, rand) => {
  g.fillStyle = '#937f79';
  g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 128) for (let x = 0; x < 512; x += 128) {
    g.fillStyle = jit(rand, (x / 128 + y / 128) % 2 ? '#cab6a0' : '#b6a990', .045, 4, .08);
    g.fillRect(x + 2, y + 2, 124, 124);
    for (let i = 0; i < 17; i++) {
      g.strokeStyle = rand() > .5 ? '#fff1d221' : '#79676619';
      g.lineWidth = 1.4;
      const px = x + rand() * 120, py = y + rand() * 117;
      g.beginPath(); g.moveTo(px, py); g.lineTo(Math.min(x + 124, px + 3 + rand() * 18), py + 3); g.stroke();
    }
  }
});

const earth = () => ctex('illustrative-earth', 768, 384, (g) => {
  const bg = g.createLinearGradient(0, 0, 0, 384);
  bg.addColorStop(0, '#88c5df'); bg.addColorStop(.53, '#368eb3'); bg.addColorStop(1, '#20759e');
  g.fillStyle = bg; g.fillRect(0, 0, 768, 384);
  for (let i = 0; i < 768; i += 48) {
    g.strokeStyle = '#b4dbc760'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 384); g.stroke();
  }
  for (let i = 0; i < 384; i += 48) {
    g.beginPath(); g.moveTo(0, i); g.lineTo(768, i); g.stroke();
  }
  const land = [
    [[52, 91], [77, 63], [156, 60], [191, 88], [232, 85], [205, 126], [187, 141], [169, 198], [149, 190], [141, 164], [108, 152], [88, 118]],
    [[173, 193], [219, 190], [259, 231], [238, 277], [216, 295], [208, 335], [185, 322], [181, 259], [156, 213]],
    [[246, 56], [283, 37], [318, 47], [290, 95], [271, 91]],
    [[355, 144], [362, 110], [400, 103], [415, 73], [462, 82], [502, 54], [551, 67], [597, 57], [687, 85], [699, 118], [654, 145], [619, 183], [598, 205], [556, 183], [529, 223], [507, 180], [482, 167], [464, 200], [443, 143], [405, 148], [378, 159]],
    [[363, 155], [416, 151], [454, 182], [435, 227], [417, 262], [397, 270], [385, 220], [354, 200]],
    [[611, 255], [662, 238], [697, 266], [712, 312], [671, 319], [631, 298], [597, 300]],
    [[482, 243], [487, 258], [478, 285], [472, 274]]
  ];
  for (const points of land) {
    g.beginPath();
    points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.closePath();
    g.fillStyle = '#79a45d'; g.fill();
    g.strokeStyle = '#c0cf83'; g.lineWidth = 3; g.stroke();
  }
});

type Group = T.Group;
const TAU = Math.PI * 2;

function flutedColumn() {
  const geometry = new T.CylinderGeometry(.35, .42, 4.55, 96);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const flute = 1 + .034 * Math.cos(12 * Math.atan2(z, x));
    position.setXYZ(i, x * flute, position.getY(i), z * flute);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export class Stage {
  readonly scene = new T.Scene();
  readonly camera: T.PerspectiveCamera;
  private readonly sun: T.DirectionalLight;
  private readonly sky: ReturnType<typeof makeSky>;
  private readonly sunDirection: T.Vector3;
  private readonly cast: StoryCast;
  private readonly placements = new Map<string, T.Group>();
  private readonly materials = new Set<T.Material>();
  private readonly geometries = new Set<T.BufferGeometry>();
  private readonly textures = new Set<T.Texture>();
  private readonly assembly: Assembly = {
    mesh: (...args) => this.mesh(...args), box: (...args) => this.box(...args), cylinder: (...args) => this.cylinder(...args)
  };
  private readonly animators: ((f: number) => void)[] = [];

  constructor(readonly shot: Shot, story: Story, width: number, height: number) {
    this.camera = new T.PerspectiveCamera(40, width / height, .17, 230);
    this.camera.layers.enable(NOINK);
    const light = shot.scene.light, lighting = LIGHTS[light], look = LOOK[light];
    this.scene.fog = new T.Fog(untone(look.sky.c[0]), lighting.fogNear, lighting.fogFar);
    this.sky = makeSky(190);
    colorSky(this.sky, look.sky);
    this.scene.add(this.sky);
    this.materials.add(this.sky.material);
    this.geometries.add(this.sky.geometry);
    this.sun = new T.DirectionalLight(lighting.sunCol, lighting.sunI);
    this.sun.castShadow = true;
    const mapSize = width >= 1080 ? 2048 : 1024;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    Object.assign(this.sun.shadow.camera, {near: 1, far: 100});
    this.sun.shadow.normalBias = lighting.normalBias;
    this.sun.shadow.bias = lighting.bias;
    this.sun.shadow.camera.layers.enable(NOINK);
    this.scene.add(this.sun, this.sun.target, new T.HemisphereLight(lighting.sky, lighting.ground, lighting.hemiI));
    const heading = new T.Vector3();
    const direction = new T.Vector3();
    for (let frame = shot.start; frame < shot.end; frame += 6) {
      const pose = cameraPose(shot, frame, (id) => {
        const entry = [...shot.scene.actors, ...shot.scene.props].find((placement) => placement.id === id);
        return entry && direction.set(...entry.at);
      });
      direction.copy(pose.look).sub(pose.position).setY(0);
      heading.add(direction.normalize());
    }
    if (!heading.lengthSq()) heading.set(0, 0, -1);
    heading.normalize();
    // A higher side key reaches the tabletop through the workshop windows.
    const workshop = shot.scene.environment === 'workshop' && light === 'golden';
    const az = T.MathUtils.degToRad(workshop ? 40 : lighting.az);
    const el = T.MathUtils.degToRad(workshop ? 30 : lighting.el);
    this.sunDirection = new T.Vector3(
      (heading.x * Math.cos(az) - heading.z * Math.sin(az)) * Math.cos(el), Math.sin(el),
      (heading.z * Math.cos(az) + heading.x * Math.sin(az)) * Math.cos(el));
    this.buildWorld(shot.scene.environment);
    this.batchScenery();
    for (const entry of shot.scene.props) {
      const group = new T.Group();
      group.position.set(...entry.at);
      group.scale.setScalar(entry.scale);
      group.rotation.y = T.MathUtils.degToRad(entry.yaw);
      this.scene.add(group);
      this.placements.set(entry.id, group);
      this.prop(group, entry);
    }
    this.cast = new StoryCast(this.scene, shot, story);
  }

  private surface(color: string, map?: T.Texture) {
    const material = twoTone(new T.MeshLambertMaterial({color, map: map ?? null}));
    this.materials.add(material);
    return material;
  }

  private mesh(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.geometries.add(geometry);
    this.materials.add(material);
    parent.add(mesh);
    return mesh;
  }

  private box(parent: T.Object3D, m: T.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
    return this.mesh(parent, new T.BoxGeometry(w, h, d), m, x, y, z);
  }

  private cylinder(parent: T.Object3D, m: T.Material, x: number, y: number, z: number, top: number, bottom: number, h: number, n = 32) {
    return this.mesh(parent, new T.CylinderGeometry(top, bottom, h, n), m, x, y, z);
  }

  private repeat(map: T.Texture, x: number, y: number) {
    const copy = rep(map, x, y);
    this.textures.add(copy);
    return copy;
  }

  private batchScenery() {
    const world = this.scene.getObjectByName('static-environment');
    if (!world) return;
    const groups = new Map<string, T.Mesh[]>();
    world.updateMatrixWorld(true);
    for (const child of world.children) {
      if (!(child instanceof T.Mesh) || Array.isArray(child.material) || child.material.transparent ||
          !child.castShadow || child.layers.isEnabled(NOINK)) continue;
      const key = `${child.material.id}:${child.geometry.index ? 'indexed' : 'plain'}:${Object.keys(child.geometry.attributes).join(',')}`;
      const group = groups.get(key) ?? [];
      group.push(child);
      groups.set(key, group);
    }
    for (const batch of groups.values()) {
      if (batch.length < 3) continue;
      const positioned = batch.map((mesh) => mesh.geometry.clone().applyMatrix4(mesh.matrix));
      const merged = mergeGeometries(positioned);
      for (const copy of positioned) copy.dispose();
      if (!merged) continue;
      this.mesh(world, merged, batch[0].material as T.Material, 0, 0, 0);
      for (const mesh of batch) {
        world.remove(mesh);
        if (this.geometries.delete(mesh.geometry)) mesh.geometry.dispose();
      }
    }
  }

  private buildWorld(environment: Shot['scene']['environment']) {
    const world = new T.Group();
    world.name = 'static-environment';
    this.scene.add(world);
    const floor = this.surface('#ffffff', this.repeat(
      environment === 'workshop' ? planksHD() : environment === 'terrace' ? grassHD() : environment === 'street' ? cobbleHD() : groundStone(), 15, 15));
    const base = this.mesh(world, new T.PlaneGeometry(104, 104), floor, 0, 0, 0);
    base.rotation.x = -Math.PI / 2;
    base.castShadow = false;
    if (environment === 'diagram') {
      base.material = this.surface('#c0bbc6');
      this.materials.add(base.material);
      return;
    }
    const stoneWall = this.surface('#f0e0ca', this.repeat(stoneHD(), 3, 2));
    const cream = this.surface('#d9c5a6');
    const band = this.surface('#917c72');
    const archDark = this.surface('#526779');
    const gold = this.surface('#ad8555');
    if (environment === 'street') {
      this.buildStreet(world, false);
      return;
    }
    if (environment === 'rotunda' || environment === 'gallery') {
      this.box(world, stoneWall, 0, 4.9, -10.5, 25, 9.8, 1);
      this.box(world, band, 0, .48, -9.85, 25, .96, .45);
      this.box(world, cream, 0, 5.15, -9.7, 25, .42, .83);
      this.box(world, gold, 0, 5.42, -9.64, 25, .11, .9);
      this.box(world, cream, 0, 8.6, -9.48, 25, .51, 1.1);
      for (const x of [-8, -4, 0, 4, 8]) {
        const shape = new T.Shape();
        shape.moveTo(-1.11, 0); shape.lineTo(1.11, 0); shape.lineTo(1.11, 2.5);
        shape.absarc(0, 2.5, 1.11, 0, Math.PI, false); shape.lineTo(-1.11, 0);
        this.mesh(world, new T.ShapeGeometry(shape, 20), archDark, x, .92, -9.96);
        const arc = new T.TorusGeometry(1.14, .14, 9, 30, Math.PI);
        this.mesh(world, arc, cream, x, 3.43, -9.82);
        this.box(world, cream, x - 1.14, 2.2, -9.81, .24, 2.46, .23);
        this.box(world, cream, x + 1.14, 2.2, -9.81, .24, 2.46, .23);
        this.box(world, cream, x, 2.2, -9.79, .12, 2.56, .16);
        this.box(world, cream, x, 2.73, -9.79, 1.94, .13, .16);
      }
      const column = flutedColumn();
      for (const [x, z] of [[-10,-7],[-6,-8.5],[-2,-8.5],[2,-8.5],[6,-8.5],[10,-7],[-8,1],[8,1],[-7.5,5],[7.5,5]]) {
        this.box(world, band, x, .17, z, 1.22, .34, 1.22);
        this.box(world, cream, x, .39, z, 1.02, .16, 1.02);
        this.mesh(world, column, cream, x, 2.68, z);
        this.cylinder(world, gold, x, 4.85, z, .50, .39, .24);
        this.box(world, cream, x, 5.03, z, 1.03, .15, 1.03);
      }
      if (environment === 'gallery') {
        for (const x of [-5, 0, 5]) {
          const molding = new T.Group();
          molding.position.set(x, 0, -7.13);
          world.add(molding);
          arch(this.assembly, molding, stoneWall, gold);
        }
      }
      const ceiling = this.mesh(world, new T.SphereGeometry(13, 32, 16, 0, TAU, 0, Math.PI * .5),
        this.surface('#839aa0'), 0, 7.7, -2);
      ceiling.material.side = T.BackSide;
      ceiling.castShadow = false;
      return;
    }
    if (environment === 'workshop') {
      this.box(world, stoneWall, 0, 3, -9, 23, 6, .7);
      for (const x of [-8, -4, 0, 4, 8]) {
        this.box(world, band, x, 3, -8.55, .23, 6, .24);
        this.box(world, archDark, x + 1.7, 3.55, -8.59, 1.6, 1.9, .12);
        this.box(world, cream, x + 1.7, 2.56, -8.43, 1.84, .17, .43);
      }
      return;
    }
    this.box(world, cream, 0, .1, 0, 15, .18, 16);
    this.box(world, band, 0, .42, -7.5, 16, .72, .6);
    this.buildStreet(world, true);
    for (let i = 0; i < 5; i++) {
      const cloud = this.mesh(world, new T.PlaneGeometry(13, 6.5), new T.MeshBasicMaterial({
        map: cloudHD(i + 5, LOOK[this.shot.scene.light].cloud), transparent: true, depthWrite: false
      }), (i - 2) * 16, 10 + i % 2 * 3, -45 - i % 3 * 6);
      cloud.castShadow = false;
      cloud.layers.set(NOINK);
    }
  }

  private buildStreet(world: Group, distant: boolean) {
    const street = new T.Group();
    const batch = new Batch();
    const offset = distant ? -21 : -11;
    for (let i = -2; i <= 2; i++) {
      house(batch, i * 7.5, offset - Math.abs(i) * .88, -.08 * i, i % 2 ? 6.8 : 7.2, 5.1,
        [6.2, 7.6, 8.6][(i + 3) % 3], i + 3, 0);
    }
    for (const sign of [-1, 1]) {
      house(batch, sign * 12.6, offset - 14, -sign * .45, 7.2, 7, 8.6, sign > 0 ? 6 : 7, 0);
      house(batch, sign * 6.7, offset - 24, sign * .22, 7.2, 7, 8.6, sign > 0 ? 2 : 5, 0);
    }
    batch.build(street);
    world.add(street);
    street.traverse((o) => { if (o instanceof T.Mesh) this.geometries.add(o.geometry); });
  }

  private prop(g: Group, entry: Shot['scene']['props'][number]) {
    const {kind, id, color} = entry;
    const actions = this.shot.actions.filter((a) => a.target === id);
    const brass = this.surface(color ?? '#c99448');
    const dark = this.surface('#524551');
    const wood = this.surface(color ?? '#bd8655', this.repeat(planksHD(), 1, 1));
    const materials = {wood, dark, brass};
    const progress = (frame: number, k: 'roll' | 'spin') => actions.reduce((value, action) =>
      action.kind === k && 'amount' in action ? value + action.amount * smooth((frame - action.frame) / (action.duration * fps)) : value, 0);
    if (kind === 'arch') { arch(this.assembly, g, this.surface(color ?? '#e0c4a2', stoneHD()), dark); return; }
    if (kind === 'rail') { rail(this.assembly, g, materials); return; }
    if (kind === 'barrel') { barrel(this.assembly, g, materials); return; }
    if (kind === 'worktable') { worktable(this.assembly, g, materials); return; }
    if (kind === 'telescope') { telescope(this.assembly, g, materials); return; }
    if (kind === 'gear') {
      const rotor = gear(this.assembly, g, materials);
      this.animators.push((f) => { rotor.rotation.z = T.MathUtils.degToRad(progress(f, 'spin')); });
      return;
    }
    if (kind === 'cart') {
      const wheels = cart(this.assembly, g, materials);
      const start = g.position.clone();
      const direction = new T.Vector3(0, 0, 1).applyEuler(g.rotation);
      this.animators.push((f) => {
        const distance = progress(f, 'roll') / 32;
        g.position.copy(start).addScaledVector(direction, distance);
        for (const wheel of wheels) wheel.rotation.x = distance / .42;
      });
      return;
    }
    if (kind === 'swing') {
      for (const side of [-1, 1]) for (const x of [-.68, .68]) {
        const leg = this.box(g, wood, x, 1.46, side * .36, .11, 3.01, .11);
        leg.rotation.x = -.24 * side;
      }
      this.box(g, wood, 0, 2.91, 0, 1.58, .13, .14);
      const pivot = new T.Group();
      pivot.position.y = 2.85;
      g.add(pivot);
      for (const x of [-.31, .31]) this.cylinder(pivot, dark, x, -1.17, 0, .018, .018, 2.34, 9);
      this.box(pivot, brass, 0, -2.34, 0, .82, .085, .3);
      this.animators.push((f) => {
        const action = actions.find((a) => a.kind === 'swing');
        const amount = action && 'amount' in action ? action.amount : 13;
        const gain = action ? .58 + .42 * smooth((f - action.frame) / (action.duration * fps)) : 1;
        pivot.rotation.x = Math.cos((f - this.shot.start) * TAU / (2.35 * fps)) * T.MathUtils.degToRad(amount) * gain;
      });
      return;
    }
    if (kind === 'pendulum' || kind === 'turntable' || kind === 'globe') {
      if (kind === 'globe') {
        const globe = this.mesh(g, new T.SphereGeometry(1.25, 40, 24), this.surface('#ffffff', earth()), 0, 1.48, 0);
        globe.rotation.z = -.28;
        this.cylinder(g, dark, 0, .15, 0, 1.22, 1.52, .28);
        this.animators.push((f) => {
          globe.rotation.y = actions.reduce((angle, action) => 'amount' in action ?
            angle + T.MathUtils.degToRad(action.amount) * smooth((f - action.frame) / (action.duration * fps)) : angle, -.9);
        });
        return;
      }
      const dial = new T.Group();
      g.add(dial);
      this.cylinder(dial, dark, 0, .09, 0, 2.52, 2.6, .18, 56);
      this.cylinder(dial, brass, 0, .185, 0, 2.45, 2.48, .055, 56);
      this.cylinder(dial, this.surface('#dcb783'), 0, .219, 0, 2.31, 2.31, .025, 56);
      for (let i = 0; i < 36; i++) {
        const a = i * TAU / 36;
        const length = i % 3 === 0 ? .18 : .085;
        const tick = this.box(dial, dark, 2.27 * Math.sin(a), .236, 2.27 * Math.cos(a), .021, .006, length);
        tick.rotation.y = a;
      }
      const spoke = this.box(dial, this.surface('#9b544d'), 0, .239, 0, 4.18, .006, .029);
      spoke.layers.set(NOINK);
      spoke.castShadow = false;
      if (kind === 'turntable') {
        this.animators.push((f) => {
          dial.rotation.y = actions.reduce((angle, action) => 'amount' in action ?
            angle + T.MathUtils.degToRad(action.amount) * smooth((f - action.frame) / (action.duration * fps)) : angle, 0);
        });
        return;
      }
      spoke.visible = false;
      const pivot = new T.Group();
      pivot.position.y = 7.9;
      g.add(pivot);
      this.cylinder(g, brass, 0, 7.96, 0, .21, .14, .14);
      const cord = this.surface('#494451');
      this.cylinder(pivot, cord, 0, -3.61, 0, .012, .012, 7.22, 8);
      this.mesh(pivot, new T.SphereGeometry(.265, 28, 20), brass, 0, -7.24, 0);
      this.cylinder(pivot, cord, 0, -7.54, 0, .031, .007, .135, 8);
      const traces = Array.from({length: 9}, (_, i) => {
        const mark = this.box(dial, this.surface(i % 2 ? '#9b544d' : '#826d58'), 0, .237 + i * .001, 0, 3.25, .007, .025);
        mark.layers.set(NOINK);
        mark.castShadow = false;
        const trace = actions.find((a) => a.kind === 'trace');
        mark.rotation.y = .24 + T.MathUtils.degToRad(trace && 'amount' in trace ? trace.amount : 0) * i / 8;
        return mark;
      });
      this.animators.push((f) => {
        const swing = actions.find((a) => a.kind === 'swing');
        const trace = actions.find((a) => a.kind === 'trace');
        const t = (f - this.shot.start) / fps;
        const amount = swing && 'amount' in swing ? swing.amount : 11;
        const gain = swing ? .62 + .38 * smooth((f - swing.frame) / (swing.duration * fps)) : 1;
        const arc = trace && 'amount' in trace ? trace.amount * smooth((f - trace.frame) / (trace.duration * fps)) : 0;
        pivot.rotation.set(0, T.MathUtils.degToRad(arc) + .24, Math.sin(t * TAU / 4.1) * T.MathUtils.degToRad(amount) * gain, 'YXZ');
        traces.forEach((mark, i) => { mark.visible = !!trace && f >= trace.frame + i * trace.duration * fps / 9; });
      });
      return;
    }
    if (kind === 'bench') {
      this.box(g, wood, 0, .55, 0, 2.35, .14, .52);
      this.box(g, wood, 0, .96, -.23, 2.35, .31, .1);
      for (const x of [-.88, .88]) {
        this.box(g, dark, x, .24, 0, .16, .52, .41);
        this.box(g, dark, x, .74, -.23, .10, .57, .12);
      }
    } else if (kind === 'crate') {
      this.box(g, wood, 0, .39, 0, .94, .78, .72);
      for (const y of [.13, .65]) this.box(g, dark, 0, y, .0, 1.02, .065, .77);
    } else if (kind === 'plinth') {
      this.box(g, dark, 0, .1, 0, 1.7, .2, 1.7);
      this.box(g, brass, 0, .52, 0, 1.17, .85, 1.17);
      this.box(g, dark, 0, .99, 0, 1.37, .14, 1.37);
    } else if (kind === 'tree') {
      const canopy = kitClone({}, 'tree_oak', 4)!;
      g.add(canopy);
      canopy.traverse((o) => { if (o instanceof T.Mesh) this.geometries.add(o.geometry); });
    } else {
      this.cylinder(g, dark, 0, .79, 0, .04, .13, 1.58, 12);
      this.cylinder(g, brass, 0, 1.57, 0, .2, .17, .12, 8);
      const glow = new T.MeshBasicMaterial({color: new T.Color('#ffe6a1').multiplyScalar(2.0), toneMapped: false});
      const bulb = this.mesh(g, new T.SphereGeometry(.135, 16, 12), glow, 0, 1.73, 0);
      bulb.layers.set(NOINK);
      this.cylinder(g, dark, 0, 1.92, 0, .075, .24, .17, 8);
    }
  }

  update(frame: number) {
    const light = LIGHTS[this.shot.scene.light];
    TONE.uLitCol.value.set(...light.lit);
    TONE.uShadeCol.value.set(...light.shade);
    TONE.uShadeLift.value.set(...light.lift);
    TONE.uBounce.value.set(...LOOK[this.shot.scene.light].bounce);
    TONE.uLambert.value = light.lambert;
    TONE.uSideK.value = light.sideK;
    TONE.uTerm.value = light.term;
    TONE.uSat.value = LOOK[this.shot.scene.light].sat;
    CHAR.uCharTint.value.set(...light.charTint);
    CHAR.uCharShade.value = light.charShade;
    CHAR.uGrad.value = light.charGrad;
    CHAR.uBodyGrad.value = light.bodyGrad;
    CHAR.uSideTint.value.set(...light.sideTint);
    for (const animate of this.animators) animate(frame);
    const lens = choreograph(this.camera, this.shot, frame, (id, at) =>
      this.cast.position(id, at) ?? this.placements.get(id)?.position);
    this.sky.position.copy(this.camera.position);
    const target = this.camera.getWorldDirection(new T.Vector3()).multiplyScalar(lens.distance).add(this.camera.position);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDirection, 38);
    const radius = Math.max(7.8, Math.min(23, .75 * lens.distance + 5));
    Object.assign(this.sun.shadow.camera, {left: -radius, right: radius, top: radius, bottom: -radius});
    this.sun.shadow.camera.updateProjectionMatrix();
    this.cast.update(frame, this.camera, this.sunDirection, light.actorShadow);
    return lens;
  }

  dispose() {
    this.sun.shadow.dispose();
    this.cast.dispose();
    for (const item of [...this.materials, ...this.geometries, ...this.textures]) item.dispose();
  }
}
