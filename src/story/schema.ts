import {z} from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const line = (max: number) => z.string().trim().min(1).max(max);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const xyz = z.tuple([z.number().min(-100).max(100), z.number().min(-100).max(100), z.number().min(-100).max(100)]);
const seconds = z.number().min(0.15).max(12);
export const hairStyles = ['messy', 'side-part', 'slicked-back', 'curly', 'long', 'tied-back'] as const;
export const worldKinds = ['eddy', 'motor', 'bind', 'drain', 'collapse', 'flood', 'explain', 'reverse', 'refill'] as const;
const expressions = ['neutral', 'stern', 'grin', 'laugh', 'whistle', 'nervous', 'shock', 'relief',
  'relief_open', 'dazed', 'pained', 'smile', 'smile_closed', 'lick', 'curious', 'doubt', 'confused', 'fear', 'nervous-laugh', 'sarcasm', 'disbelief', 'concern', 'concentrate'] as const;
const sourceUrl = z.url({protocol: /^https$/}).max(512).refine((value) => {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.port && url.hostname.includes('.');
  } catch {
    return false;
  }
}, 'Use a public HTTPS citation URL without credentials or a custom port');

export const fps = 30;
export const wordsOf = (value: string) => Array.from(value.matchAll(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu), (match) => match[0]);
export const beatRoles = ['hook', 'setting', 'escalation', 'turn', 'analogy', 'consequence', 'payoff'] as const;
export const cueNames = [
  'step', 'impact', 'whoosh', 'chime', 'scrape', 'step-wood', 'step-stone', 'step-earth',
  'door', 'machine', 'wood-hit', 'metal-hit', 'stone-hit', 'creak', 'snap', 'splash', 'wind', 'reaction'
] as const;
export type CueKind = typeof cueNames[number];
const placement = {id, at: xyz};
const cameraKey = z.strictObject({
  word: z.number().int().min(0), position: xyz, look: xyz, focus: xyz.optional(), track: id.optional(),
  fov: z.number().min(24).max(67).optional(), roll: z.number().min(-5).max(5).optional(),
  blur: z.number().min(0).max(18).optional(), glide: z.number().int().min(18).max(40).optional(), cut: z.boolean().optional()
});
const camera = z.strictObject({
  from: xyz, to: xyz, look: xyz, lookTo: xyz.optional(),
  fov: z.number().min(24).max(67),
  roll: z.number().min(-5).max(5).default(0),
  blur: z.number().min(0).max(18).default(0),
  motion: z.enum(['push', 'glide', 'whip']).default('push'),
  emphasis: z.number().int().min(0).optional(),
  focusTo: xyz.optional(), keys: z.array(cameraKey).min(1).max(8).optional()
});
const scene = z.strictObject({
  id,
  description: line(400),
  environment: z.enum(['rotunda', 'terrace', 'workshop', 'diagram', 'street', 'gallery', 'lake', 'mine', 'cross-section', 'canal']),
  light: z.enum(['day', 'golden']),
  actors: z.array(z.strictObject({...placement, character: id, facing: z.enum(['left', 'right']).default('right'),
    look: z.enum(expressions).optional(), view: z.enum(['front', 'side', 'three-quarter', 'auto']).optional()})).max(8),
  props: z.array(z.strictObject({
    ...placement, kind: z.enum(['pendulum', 'swing', 'turntable', 'globe', 'bench', 'crate', 'tree', 'lamp', 'plinth', 'arch', 'gear', 'cart', 'rail', 'barrel', 'worktable', 'telescope', 'rig', 'barge', 'skiff', 'shore-tree']),
    scale: z.number().min(0.2).max(3).default(1),
    yaw: z.number().min(-360).max(360).default(0),
    color: color.optional()
  })).max(20)
});
const action = z.discriminatedUnion('kind', [
  z.strictObject({kind: z.enum(['walk', 'run', 'lift', 'drop']), target: id, word: z.number().int().min(0), duration: seconds, to: xyz}),
  z.strictObject({kind: z.enum(['point', 'lean', 'react', 'shrug', 'inspect', 'flinch', 'nod', 'wave', 'fall']), target: id, word: z.number().int().min(0), duration: seconds}),
  z.strictObject({kind: z.enum(['swing', 'spin', 'trace', 'roll']), target: id, word: z.number().int().min(0), duration: seconds,
    amount: z.number().min(-180).max(180)})
]);
const faceCue = z.strictObject({
  actor: id, word: z.number().int().min(0), duration: seconds, expression: z.enum(expressions),
  eyes: z.tuple([z.number().min(-1).max(1), z.number().min(-1).max(1)]).optional(),
  turn: z.number().min(-1).max(1).optional(), tilt: z.number().min(-25).max(25).optional(),
  brow: z.enum(['raised', 'worried', 'knit', 'skeptical', 'level']).optional(),
  mouth: z.enum(['dash', 'frown', 'smirk', 'smile', 'grin', 'laugh', 'o', 'O', 'wave', 'teeth']).optional(),
  blink: z.enum(['auto', 'blink', 'closed', 'open']).optional(), intensity: z.number().min(0).max(1).optional()
});
const worldEvent = z.strictObject({id, kind: z.enum(worldKinds), word: z.number().int().min(0), at: xyz,
  duration: z.number().min(.2).max(30), amount: z.number().min(.05).max(1).optional()});
const beat = z.strictObject({
  role: z.enum(beatRoles),
  visual: line(300).optional(),
  text: line(620),
  claims: z.array(id).max(12),
  scene: id,
  camera,
  transition: z.enum(['cut', 'dissolve']).default('cut'),
  actions: z.array(action).max(16),
  sounds: z.array(z.strictObject({kind: z.enum(cueNames), word: z.number().int().min(0),
    pan: z.number().min(-1).max(1).optional(), gain: z.number().min(.05).max(1).optional()})).max(16),
  effects: z.array(z.strictObject({kind: z.enum(['burst', 'dust', 'splash', 'note', 'speed', 'spark', 'stars', 'stress']),
    word: z.number().int().min(0), at: xyz, size: z.number().min(.08).max(8), duration: seconds})).max(16).optional(),
  acting: z.strictObject({version: z.literal(1), cues: z.array(faceCue).min(1).max(28)}).optional(),
  events: z.array(worldEvent).max(12).optional()
});
const publish = z.strictObject({
  description: z.string().max(4200).optional(),
  tags: z.array(line(55)).max(15).optional().refine((tags) => !tags || tags.join(',').length + tags.length * 2 <= 500),
  category: z.enum(['27', '28', '24']).default('27'),
  privacy: z.enum(['private', 'unlisted', 'public']).default('private'),
  publishAt: z.iso.datetime({offset: true}).optional()
});

export const storySchema = z.strictObject({
  version: z.union([z.literal(1), z.literal(2)]),
  id,
  title: line(140),
  youtubeTitle: line(100),
  topic: z.enum(['history', 'science']),
  summary: line(650),
  narrative: z.strictObject({
    premise: line(300),
    stakes: line(300),
    mechanism: line(400),
    analogy: line(300),
    callback: line(300)
  }).optional(),
  duration: z.number().min(55).max(70),
  sources: z.array(z.strictObject({id, title: line(180), url: sourceUrl, kind: z.enum(['primary', 'institutional', 'secondary']).optional()})).min(1).max(16),
  claims: z.array(z.strictObject({
    id, text: line(600), risk: z.enum(['ordinary', 'high']),
    sources: z.array(id).min(1).max(8)
  })).min(1).max(35),
  narration: line(3500),
  delivery: z.enum(['connected']).optional(),
  characters: z.array(z.strictObject({
    id, description: line(300), skin: color, hair: color, coat: color, trousers: color,
    outfit: z.enum(['waistcoat', 'workcoat', 'dress']), height: z.number().min(1.2).max(2.1).default(1.7),
    build: z.enum(['adult', 'stout', 'kid']).optional(), hairStyle: z.enum(hairStyles).optional(),
    hat: z.enum(['hair', 'cap', 'bonnet', 'tophat', 'shako', 'shako_tall', 'bare']).optional(),
    boots: color.optional(), hatColor: color.optional(), moustache: color.optional(),
    belt: color.optional(), sash: color.optional(), buttons: color.optional()
  })).max(12),
  scenes: z.array(scene).min(1).max(16),
  beats: z.array(beat).min(7).max(18),
  publish: publish.optional()
}).superRefine((story, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({code: 'custom', path, message});
  const unique = (items: {id: string}[], path: (string | number)[]) => {
    const ids = new Set<string>();
    items.forEach(({id: key}, i) => {
      if (ids.has(key)) issue([...path, i, 'id'], `Duplicate ID ${key}`);
      ids.add(key);
    });
    return ids;
  };
  const sources = unique(story.sources, ['sources']);
  const claims = unique(story.claims, ['claims']);
  const characters = unique(story.characters, ['characters']);
  unique(story.scenes, ['scenes']);
  const referencedClaims = new Set(story.beats.flatMap((b) => b.claims));
  story.claims.forEach((claim, i) => {
    const urls = new Set(claim.sources.map((key) => story.sources.find((source) => source.id === key)?.url));
    if (claim.sources.some((key) => !sources.has(key))) issue(['claims', i], 'Unknown source');
    if (claim.risk === 'high' && urls.size < 2) issue(['claims', i], 'High-risk claims require two distinct source URLs');
    if (!referencedClaims.has(claim.id)) issue(['claims', i], 'Claim needs a narration beat');
  });
  story.scenes.forEach((entry, i) => {
    unique([...entry.actors, ...entry.props], ['scenes', i]);
    if (entry.actors.some((actor) => !characters.has(actor.character))) issue(['scenes', i], 'Unknown character');
  });
  if (story.beats.map((entry) => entry.text).join(' ') !== story.narration) issue(['narration'], 'Narration must exactly join beat text with single spaces');
  const rate = wordsOf(story.narration).length / story.duration;
  if (rate < 3.4 || rate > 4.1) issue(['narration'], 'Narration must be near 3.5–4 words per second');
  let previous = -1;
  const seen = new Set<string>();
  unique(story.beats.flatMap((entry) => entry.events ?? []), ['beats']);
  story.beats.forEach((entry, i) => {
    const path = ['beats', i];
    const role = beatRoles.indexOf(entry.role);
    if (role < previous) issue(path, 'Beats must follow narrative order');
    seen.add(entry.role);
    previous = role;
    if (entry.claims.some((key) => !claims.has(key))) issue(path, 'Unknown factual claim');
    if (['hook', 'setting', 'escalation', 'consequence'].includes(entry.role) && !entry.claims.length) issue(path, 'This factual beat requires a cited claim');
    const place = story.scenes.find((candidate) => candidate.id === entry.scene);
    if (!place) issue(path, 'Unknown scene');
    const count = wordsOf(entry.text).length;
    const keys = entry.camera.keys ?? [];
    const indices = [...entry.actions.map((a) => a.word), ...entry.sounds.map((s) => s.word), entry.camera.emphasis ?? 0,
      ...keys.map((key) => key.word), ...(entry.effects ?? []).map((effect) => effect.word),
      ...(entry.acting?.cues ?? []).map((cue) => cue.word), ...(entry.events ?? []).map((event) => event.word)];
    if (!count || indices.some((index) => index >= count)) issue(path, 'Cue word index outside beat');
    if (Math.hypot(...entry.camera.from.map((v, j) => v - entry.camera.to[j])) < 0.035) issue(path, 'Camera must move during the shot');
    if (([entry.camera.from, entry.camera.to] as const).some((position, j) => {
      const look = j ? entry.camera.lookTo ?? entry.camera.look : entry.camera.look;
      return Math.hypot(...position.map((v, axis) => v - look[axis])) < 0.3;
    })) issue(path, 'Camera requires separation from its look target');
    for (const [keyIndex, key] of keys.entries()) {
      if (keyIndex && key.word <= keys[keyIndex - 1].word) issue(path, 'Camera keys must use strictly increasing word offsets');
      const subject = key.track && [...(place?.actors ?? []), ...(place?.props ?? [])].find(({id}) => id === key.track);
      if (key.track && !subject) issue(path, 'Camera tracks an unknown scene placement');
      const look = key.look.map((v, axis) => v + (subject ? subject.at[axis] : 0));
      if (Math.hypot(...key.position.map((v, axis) => v - look[axis])) < .3) issue(path, 'Camera key requires separation from its look target');
    }
    const acted = new Set<string>();
    for (const cue of entry.acting?.cues ?? []) {
      if (!place?.actors.some(({id}) => id === cue.actor)) issue(path, 'Facial cue targets an unknown scene actor');
      const timing = `${cue.actor}:${cue.word}`;
      if (acted.has(timing)) issue(path, 'Facial cues must use distinct words per actor');
      acted.add(timing);
    }
    for (const a of entry.actions) {
      const prop = place?.props.find((p) => p.id === a.target);
      const actor = place?.actors.some((p) => p.id === a.target);
      if ((a.kind === 'swing' && !['pendulum', 'swing'].includes(prop?.kind ?? '')) ||
          (a.kind === 'trace' && prop?.kind !== 'pendulum') ||
          (a.kind === 'spin' && !['globe', 'turntable', 'gear'].includes(prop?.kind ?? '')) ||
          (a.kind === 'roll' && prop?.kind !== 'cart') ||
          ((a.kind === 'lift' || a.kind === 'drop') && !['crate', 'barrel', 'lamp', 'telescope'].includes(prop?.kind ?? '')) ||
          (['walk', 'run', 'point', 'lean', 'react', 'shrug', 'inspect', 'flinch', 'nod', 'wave', 'fall'].includes(a.kind) && !actor)) {
        issue(path, `Unsupported action target ${a.target} for ${a.kind}`);
      }
      if (a.kind === 'swing' && Math.abs(a.amount) > 27) issue(path, 'Swing amplitude cannot exceed 27 degrees');
    }
  });
  if (story.version === 2) {
    if (!story.narrative) issue(['narrative'], 'Version 2 requires a narrative brief');
    if (!story.sources.some((source) => source.kind === 'primary')) issue(['sources'], 'Version 2 requires a primary source');
    if (story.sources.some((source) => !source.kind)) issue(['sources'], 'Classify every source');
    if (story.beats.some((entry) => !entry.visual)) issue(['beats'], 'Every beat needs a visual intention');
  }
  if (seen.size !== beatRoles.length) issue(['beats'], 'Every narrative role is required');
  if (story.publish?.publishAt && story.publish.privacy !== 'private') issue(['publish'], 'Schedule requires private privacy');
});

export type Story = z.infer<typeof storySchema>;
export type Beat = Story['beats'][number];
export type Scene = Story['scenes'][number];
export type Vec = z.infer<typeof xyz>;

export type HairStyle = typeof hairStyles[number];

export type FacialCue = NonNullable<Beat['acting']>['cues'][number];
export type WorldEvent = NonNullable<Beat['events']>[number];
