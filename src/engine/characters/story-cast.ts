import * as T from 'three';
import type {Story} from '../../story/schema';
import type {Shot} from '../../story/timeline';
import {clamp, smooth} from '../camera/choreography';
import {Actor, Fx, Pool, SU, blob, detachCast, lidAt, person, seedOf, viewOf, type Stage as Placements} from './sprite-cast';
import {designHeight, fxBurst, fxCreak, fxNote, fxPuff, fxSplash, fxStars, INK, type Expr, type Outfit, type Pen} from './toon';
import {cadence, gaitAt} from './gait';
import {faceAt} from './acting';

type Member = Shot['scene']['actors'][number];
const fps = 30;
const seed = (id: string) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 997, 0);
const expression = (look: Member['look']): Expr => look ?? 'neutral';

const outfitOf = (c: Story['characters'][number]): Outfit => ({
  jacket: c.coat, pants: c.trousers, boots: c.boots ?? INK, skin: c.skin, hair: c.hair, build: c.build,
  dress: c.outfit === 'dress' ? c.coat : undefined,
  hat: c.hat === 'bare' ? null : c.hat ?? 'hair', cap: c.hatColor ?? c.hair, hairStyle: c.hairStyle,
  buttons: c.buttons ?? (c.outfit === 'waistcoat' ? '#cba362' : undefined),
  moustache: c.moustache, belt: c.belt, sash: c.sash
});

const streaks = (p: Pen, u: number) => {
  for (let i = 0; i < 5; i++) {
    const x = 55 + 33 * i + 140 * u, y = 82 + 73 * i;
    p.stroke([[x, y], [x + 150 * (1 - u) + 15, y - 32]], 10 * (1 - u) + 2, i % 2 ? '#fcf4dc' : INK);
  }
};

const drawings: Record<NonNullable<Shot['effects']>[number]['kind'], (pen: Pen, time: number) => void> = {
  burst: fxBurst, dust: fxPuff, splash: fxSplash, note: (p, u) => fxNote(p, Math.floor(u * 3) % 2),
  speed: streaks, spark: (p, u) => fxBurst(p, u, '#ffd583', 7), stars: fxStars, stress: fxCreak
};
const sizes = {
  burst: [500, 500], dust: [300, 300], splash: [800, 800], note: [220, 260],
  speed: [500, 450], spark: [500, 500], stars: [420, 210], stress: [300, 300]
} as const;

type CharacterPlacement = ReturnType<typeof person>;
export class StoryCast {
  private readonly pool = new Pool();
  private readonly members;
  private readonly effects: Fx[] = [];

  constructor(private readonly root: T.Scene, private readonly shot: Shot, story: Story) {
    this.members = shot.scene.actors.map((entry) => {
      const data = story.characters.find((c) => c.id === entry.character)!;
      const o = outfitOf(data);
      const who = {i: seed(data.id), o, okey: data.id};
      const scale = data.height / (SU * designHeight(o.build, seedOf(who.i)));
      const actions = shot.actions.filter((action) => action.target === entry.id).sort((a, b) => a.frame - b.frame);
      const walks = actions.flatMap((action) => action.kind === 'walk' || action.kind === 'run' ? [{...action, kind: action.kind}] : []);
      const faces = shot.faces?.filter((cue) => cue.actor === entry.id) ?? [];
      return {entry, actor: new Actor(root), who, scale, actions, walks, faces};
    });
  }

  private walk(member: typeof this.members[number], frame: number) {
    const at = new T.Vector3(...member.entry.at);
    const step = new T.Vector3();
    let phase = 0, active = false, stride = 0, length = 0, running = false, energy = 1;
    for (const action of member.walks) {
      if (frame < action.frame) break;
      step.set(...action.to).sub(at);
      const gait = gaitAt(action, frame);
      const t = clamp((frame - action.frame) / (action.duration * fps));
      at.addScaledVector(step, gait.distance);
      active = t < 1;
      length = Math.hypot(step.x, step.z);
      stride = length / (action.duration * cadence(action.kind));
      ({phase, running, energy} = gait);
      if (active) break;
    }
    return {at, step, active: active && length > .001, stride, phase, running, energy};
  }

  position(id: string, frame: number) {
    const member = this.members.find(({entry}) => entry.id === id);
    return member && this.walk(member, frame).at;
  }

  update(frame: number, camera: T.PerspectiveCamera, sunlight: T.Vector3, castShadow: boolean) {
    const plan: Placements = {places: [], fx: []};
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const cam = {pos: camera.position, right, sun: sunlight};
    const time = frame / fps;
    for (const [i, member] of this.members.entries()) {
      const {entry, actor, who, scale, actions} = member;
      const {at, step, active, stride, phase, running, energy} = this.walk(member, frame);
      const envelope = (kind: typeof actions[number]['kind']) => {
        const action = actions.findLast((a) => a.kind === kind && frame >= a.frame);
        if (!action) return 0;
        const f = frame - action.frame;
        return smooth(f / 4) * (1 - smooth((f - action.duration * fps + 9) / 9));
      };
      const fall = actions.findLast((a) => a.kind === 'fall' && frame >= a.frame);
      const drop = fall ? clamp((frame - fall.frame) / (fall.duration * fps)) : 0;
      const react = Math.max(envelope('react'), envelope('flinch'));
      const doubt = Math.max(envelope('inspect'), envelope('shrug'));
      const acted = faceAt(member.faces, frame);
      const expr: Expr = acted?.expression ?? (member.faces.length ? expression(entry.look) : fall ? drop < 1 ? 'shock' : 'dazed' :
        react > .28 ? 'shock' : doubt > .45 ? 'stern' : expression(entry.look));
      const facing = entry.facing === 'left' ? -1 : 1;
      const dx = active ? step.x : facing, dz = active ? step.z : 0;
      const norm = Math.hypot(dx, dz) || 1;
      const automatic = viewOf(cam, at.x, at.z, dx / norm, dz / norm);
      const side = !fall && (entry.view === 'side' || ((entry.view === 'auto' || !entry.view) && active && automatic.side));
      const view = {side, mirror: side && (active || entry.view === 'auto' ? automatic.mirror : facing < 0)};
      const blink = acted?.blink ?? lidAt(time, who.i + i * 13);
      const lean = 13 * envelope('lean') + 9 * doubt - 14 * react + (active && running ? 13 * energy : 0);
      const headTilt = (acted?.tilt ?? 10 * doubt) + 8 * envelope('nod') * Math.sin(time * 13);
      const gesture = Math.max(envelope('wave'), envelope('point'));
      const roll = fall ? facing * Math.sin(Math.PI * drop) * .42 : 0;
      const p = person(cam, who, at.x, at.y + (fall ? Math.sin(Math.PI * drop) * .23 : 0), at.z, view, {
        phase, mode: fall ? drop < 1 ? 'fall' : 'sit' : active ? running ? 'march' : 'stroll' : 'stand',
        look: entry.view === 'front' ? 0 : facing * .48, facing: entry.view === 'front' ? 0 : acted ? Math.max(-1, Math.min(1, facing * .62 + acted.turn * .89)) : facing,
        expr, blink, tilt: lean, headTilt, lift: running ? 88 * energy : 48, motion: energy, face: acted?.face,
        wave: gesture > .18 ? gesture * Math.sin(time * 9) : undefined
      }, {
        phase, expr, blink, mode: active ? 'march' : 'stand', tilt: lean, headTilt, gesture,
        stride: Math.min(1.05, stride / (370 * SU * scale) * automatic.fs) * (running ? .45 + energy * .55 : 1),
        stomp: running ? .85 + .95 * energy : 1, run: running ? energy : 0, face: acted?.face
      }, scale);
      this.placeActor(actor, p, camera, roll, castShadow);
      blob(plan, at.x, at.y, at.z, scale, fall ? .7 : 1, sunlight, this.shot.scene.light);
    }

    for (const effect of this.shot.effects ?? []) {
      const progress = (frame - effect.frame) / (effect.duration * fps);
      if (progress < 0 || progress >= 1) continue;
      const u = Math.floor(progress * 30) / 30;
      const [cw, ch] = sizes[effect.kind];
      const [x, y, z] = effect.at;
      const drift = effect.kind === 'note' || effect.kind === 'dust' ? effect.size * u * .5 : 0;
      const fade = effect.kind === 'note' ? Math.min(1, u * 8, (1 - u) * 5) : 1;
      if (fade <= 0) continue;
      plan.fx.push({key: `${effect.kind}|${u}`, cw, ch, draw: (p) => drawings[effect.kind](p, u),
        x, y: y + drift, z, w: effect.size * fade, h: effect.size * ch / cw * fade,
        soft: effect.kind === 'dust', flat: false});
    }

    for (const [i, p] of plan.fx.entries()) {
      const effect = this.effects[i] ?? (this.effects[i] = new Fx(this.root));
      effect.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      effect.use(Boolean(p.soft));
      effect.mesh.visible = true;
      effect.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) effect.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { effect.mesh.quaternion.copy(camera.quaternion); effect.mesh.rotateZ(p.rot ?? 0); }
      effect.mesh.scale.set(p.w, p.h, 1);
    }
    for (const effect of this.effects.slice(plan.fx.length)) effect.mesh.visible = false;
    this.pool.flush();
    for (const {actor} of this.members) actor.bind();
    for (const effect of this.effects) if (effect.mesh.visible) effect.bind();
  }

  private placeActor(actor: Actor, p: CharacterPlacement, camera: T.PerspectiveCamera, roll: number, shadows: boolean) {
    const [w, h, k] = p.size!;
    actor.r = this.pool.req(p.key, w, h, k, p.draw);
    actor.mesh.visible = true;
    actor.mesh.position.set(p.x, p.y, p.z);
    actor.mesh.rotation.set(0, Math.atan2(camera.position.x - p.x, camera.position.z - p.z), roll);
    const scale = p.scale ?? 1;
    actor.mesh.scale.set(p.mirror ? -scale : scale, scale, scale);
    actor.mesh.castShadow = shadows;
  }

  dispose() {
    detachCast(this.root);
    this.pool.dispose();
    for (const {actor} of this.members) { actor.mat.dispose(); actor.dmat.dispose(); }
    for (const fx of this.effects) { fx.mat.dispose(); fx.soft.dispose(); fx.blob.dispose(); }
  }
}
