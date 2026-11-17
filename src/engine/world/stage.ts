import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Assembly} from './scenery';
import {arch, cart, gear, rail, barrel, worktable, telescope} from './scenery';
import {stepsPerSecond} from '../characters/gait';
import {Actor} from '../characters/toon';
import {NOINK} from '../effects/ink';
import {choreograph, clamp, smooth} from '../camera/choreography';
import {fps, type Story} from '../../story/schema';
import type {Shot} from '../../story/timeline';
import {LOOK, LIGHTS} from './lights';
import {CHAR, TONE, twoTone, untone} from './shade';
import {ctex, rep, planks, grass, stone, cloudHD, jit, cobble, facade} from './paint';

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

export class Stage {
  readonly scene = new T.Scene();
  readonly camera: T.PerspectiveCamera;
  private readonly sun: T.DirectionalLight;
  private readonly sky: T.ShaderMaterial;
  private readonly materials = new Set<T.Material>();
  private readonly geometries = new Set<T.BufferGeometry>();
  private readonly textures = new Set<T.Texture>();
  private readonly actors: {actor: Actor; entry: Shot['scene']['actors'][number]}[] = [];
  private readonly assembly: Assembly = {
    mesh: (...args) => this.mesh(...args), box: (...args) => this.box(...args), cylinder: (...args) => this.cylinder(...args)
  };
  private readonly animators: ((f: number) => void)[] = [];

  constructor(readonly shot: Shot, story: Story, width: number, height: number) {
    this.camera = new T.PerspectiveCamera(40, width / height, .17, 230);
    this.camera.layers.enable(NOINK);
    const light = shot.scene.light;
    const horizon = untone(LOOK[light].sky.c[0]);
    this.scene.fog = new T.Fog(horizon, 17, 110);
    this.sky = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false,
      uniforms: {horizon: {value: horizon}, zenith: {value: untone(LOOK[light].sky.c[4])}},
      vertexShader: 'varying vec3 dir; void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec3 dir; uniform vec3 horizon; uniform vec3 zenith; void main(){gl_FragColor=vec4(mix(horizon,zenith,smoothstep(-.05,.62,normalize(dir).y)),1.);}'
    });
    const skyMesh = this.mesh(this.scene, new T.SphereGeometry(137, 20, 12), this.sky, 0, 0, 0);
    skyMesh.layers.set(NOINK);
    skyMesh.castShadow = false;
    this.sun = new T.DirectionalLight('#fff0d4', 1.7);
    this.sun.position.set(light === 'day' ? -9 : 5, light === 'day' ? 13 : 4, light === 'day' ? 6 : -8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, {left: -12, right: 12, top: 12, bottom: -12, near: .5, far: 46});
    this.sun.shadow.normalBias = .027;
    this.sun.shadow.bias = -.0001;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.camera.layers.enable(NOINK);
    this.scene.add(this.sun, this.sun.target);
    this.buildWorld(shot.scene.environment);
    this.batchScenery();
    for (const entry of shot.scene.props) {
      const group = new T.Group();
      group.position.set(...entry.at);
      group.scale.setScalar(entry.scale);
      group.rotation.y = T.MathUtils.degToRad(entry.yaw);
      this.scene.add(group);
      this.prop(group, entry);
    }
    const shadow = ctex('soft-contact', 64, 64, (g) => {
      const ramp = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      ramp.addColorStop(0, '#282237b0'); ramp.addColorStop(.44, '#2822378e'); ramp.addColorStop(1, '#28223700');
      g.fillStyle = ramp; g.fillRect(0, 0, 64, 64);
    });
    for (const entry of shot.scene.actors) {
      const actor = new Actor(story.characters.find((c) => c.id === entry.character)!, shadow);
      this.scene.add(actor.mesh, actor.shadow);
      this.actors.push({actor, entry});
    }
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
        this.geometries.delete(mesh.geometry);
        mesh.geometry.dispose();
      }
    }
  }

  private buildWorld(environment: Shot['scene']['environment']) {
    const world = new T.Group();
    world.name = 'static-environment';
    this.scene.add(world);
    const floor = this.surface('#ffffff', this.repeat(
      environment === 'workshop' ? planks() : environment === 'terrace' ? grass() : environment === 'street' ? cobble() : groundStone(), 22, 22));
    const base = this.mesh(world, new T.PlaneGeometry(104, 104), floor, 0, 0, 0);
    base.rotation.x = -Math.PI / 2;
    base.castShadow = false;
    if (environment === 'diagram') {
      base.material = this.surface('#c0bbc6');
      this.materials.add(base.material);
      return;
    }
    const stoneWall = this.surface('#f0e0ca', this.repeat(stone(), 3, 4));
    const cream = this.surface('#d9c5a6');
    const band = this.surface('#917c72');
    const archDark = this.surface('#526779');
    const gold = this.surface('#ad8555');
    if (environment === 'street') {
      const colors = ['#d4b496', '#cabb9b', '#b99a82', '#debf9d'];
      for (let i = -2; i <= 2; i++) {
        const x = i * 4.85;
        const w = 4.75, h = 5.2 + Math.abs(i) * .72;
        const paint = facade(`street-${i}`, w, h, {wall: colors[(i + 4) % colors.length], shutter: '#56676f', door: true, timber: i % 2 === 0});
        const frontage = this.surface('#ffffff', paint);
        this.box(world, stoneWall, x, h / 2, -8.58, w, h, 3.2);
        this.mesh(world, new T.PlaneGeometry(w, h), frontage, x, h / 2, -6.97).castShadow = false;
        this.box(world, band, x, h + .14, -8.50, w + .27, .27, 3.47);
        this.box(world, cream, x, .14, -6.73, w, .28, .5);
        const roof = this.cylinder(world, this.surface('#5c586c'), x, h + .77, -8.44, .16, w * .69, 1.55, 4);
        roof.rotation.y = Math.PI / 4;
        this.box(world, stoneWall, x + .65, h + 1.21, -9.03, .46, 1.32, .44);
      }
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
      for (const [x, z] of [[-10,-7],[-6,-8.5],[-2,-8.5],[2,-8.5],[6,-8.5],[10,-7],[-8,1],[8,1],[-7.5,5],[7.5,5]]) {
        this.box(world, band, x, .17, z, 1.22, .34, 1.22);
        this.box(world, cream, x, .39, z, 1.02, .16, 1.02);
        this.cylinder(world, cream, x, 2.68, z, .35, .42, 4.55, 22);
        for (let k = 0; k < 12; k++) {
          const a = k / 12 * TAU;
          this.cylinder(world, cream, x + .39 * Math.cos(a), 2.64, z + .39 * Math.sin(a), .032, .041, 4.18, 6);
        }
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
    for (let i = 0; i < 10; i++) {
      const x = (i - 4.5) * 3.45;
      this.box(world, this.surface(i % 2 ? '#c7a990' : '#b28e7f'), x, 1.2, -15 - i % 3, 3, 4.6 + i % 3, 3.8);
      const roof = this.cylinder(world, this.surface('#716d88'), x, 4.14 + (i % 3) / 2, -15 - i % 3, 0, 2.8, 1.4, 4);
      roof.rotation.y = Math.PI / 4;
    }
    for (let i = 0; i < 5; i++) {
      const cloud = this.mesh(world, new T.PlaneGeometry(13, 6.5), new T.MeshBasicMaterial({
        map: cloudHD(i + 5, LOOK[this.shot.scene.light].cloud), transparent: true, depthWrite: false
      }), (i - 2) * 16, 10 + i % 2 * 3, -45 - i % 3 * 6);
      cloud.castShadow = false;
      cloud.layers.set(NOINK);
    }
  }

  private prop(g: Group, entry: Shot['scene']['props'][number]) {
    const {kind, id, color} = entry;
    const actions = this.shot.actions.filter((a) => a.target === id);
    const brass = this.surface(color ?? '#c99448');
    const dark = this.surface('#524551');
    const wood = this.surface(color ?? '#bd8655', this.repeat(planks(), 1, 1));
    const materials = {wood, dark, brass};
    const progress = (frame: number, k: 'roll' | 'spin') => actions.reduce((value, action) =>
      action.kind === k && 'amount' in action ? value + action.amount * smooth((frame - action.frame) / (action.duration * fps)) : value, 0);
    if (kind === 'arch') { arch(this.assembly, g, this.surface(color ?? '#e0c4a2', stone()), dark); return; }
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
      const spoke = this.box(dial, this.surface('#9b544d'), 0, .235, 0, 4.18, .01, .029);
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
      this.cylinder(g, wood, 0, 1.18, 0, .1, .22, 2.36, 9);
      const leaves = this.surface(color ?? '#6a8c53');
      for (const [x, y, z, r] of [[0,2.9,0,1.09],[-.65,2.5,.16,.82],[.68,2.76,.23,.86],[-.22,3.56,-.16,.73]]) {
        this.mesh(g, new T.IcosahedronGeometry(r, 2), leaves, x, y, z);
      }
    } else {
      this.cylinder(g, dark, 0, .79, 0, .04, .13, 1.58, 12);
      this.cylinder(g, brass, 0, 1.57, 0, .2, .17, .12, 8);
      const glow = new T.MeshBasicMaterial({color: new T.Color('#ffe6a1').multiplyScalar(2.0), toneMapped: false});
      const bulb = this.mesh(g, new T.SphereGeometry(.135, 16, 12), glow, 0, 1.73, 0);
      bulb.layers.set(NOINK);
      this.cylinder(g, dark, 0, 1.92, 0, .075, .24, .17, 8);
    }
  }

  update(frame: number, height: number) {
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
    const lens = choreograph(this.camera, this.shot, frame);
    for (const animate of this.animators) animate(frame);
    this.actors.forEach(({actor, entry}, index) => {
      const actions = this.shot.actions.filter((a) => a.target === entry.id && frame >= a.frame);
      const walk = actions.findLast((a) => a.kind === 'walk');
      const at = new T.Vector3(...entry.at);
      let stride = 0, cycle = 0;
      const now = frame / fps;
      if (walk?.kind === 'walk') {
        const t = clamp((frame - walk.frame) / (walk.duration * fps));
        at.lerp(new T.Vector3(...walk.to), t);
        cycle = t * walk.duration * stepsPerSecond / 2;
        stride = Math.min(1, 10 * t, 10 * (1 - t));
        const path = new T.Vector3(...walk.to).sub(new T.Vector3(...entry.at)).length();
        stride *= Math.min(1, path / Math.max(.1, walk.duration * .8));
      }
      const envelope = (kind: 'point' | 'react' | 'lean' | 'shrug' | 'inspect' | 'flinch' | 'nod') => {
        const action = actions.findLast((a) => a.kind === kind);
        if (!action) return 0;
        const elapsed = frame - action.frame;
        return smooth(elapsed / 4) * (1 - smooth((elapsed - action.duration * fps + 9) / 9));
      };
      actor.mesh.position.copy(at);
      actor.mesh.quaternion.copy(this.camera.quaternion);
      actor.shadow.position.copy(at).y += .012;
      const flinch = envelope('flinch'), inspect = envelope('inspect'), shrug = envelope('shrug');
      const breath = Math.sin(now * 5.2 + index * 1.83) * .061;
      actor.draw({walk: stride, cycle, bob: Math.abs(Math.sin(cycle * TAU)) * stride + breath,
        blink: (frame + index * 13) % (49 + index * 9) < 3,
        lean: envelope('lean') + inspect * .41 - flinch * .66 + .12 * stride,
        point: envelope('point'), shrug, inspect, flinch,
        surprise: Math.max(envelope('react'), flinch * .88), nod: envelope('nod') * Math.sin(now * 13),
        mood: entry.look ?? 'neutral'},
      entry.facing === 'left' ? -1 : 1, height);
    });
    return lens;
  }

  dispose() {
    this.sun.shadow.dispose();
    for (const {actor} of this.actors) actor.dispose();
    for (const item of [...this.materials, ...this.geometries, ...this.textures]) item.dispose();
  }
}
