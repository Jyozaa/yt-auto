import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import type {Film, Shot} from '../story/timeline';

export const roles = {
  camera: 'Review shot movement and framing. Check smooth motion, point of interest, camera rolls, and occlusion by foreground objects.',
  characters: 'Review character articulation and facial expression. Check foot contact, silhouette, readable poses, and whether reactions match the beat.',
  geometry: 'Review the environment and props. Check recognizable shapes, appropriate scale, spatial relationships, and visible clipping.',
  materials: 'Review painted texture, repetition, surface detail, and separation between adjacent objects.',
  lighting: 'Review exposure, warm/cool separation, contact shadows, and consistency across lighting changes.',
  post: 'Review world ink and lens blur. Check doubled outlines, halos, visible focus target, and excessive bloom.',
  narrative: 'Review whether each image and action makes the narrated beat readable, including transitions and the final beat.',
  continuity: 'Compare adjacent shots and cue frames for continuity of pose, prop state, direction, time, and geography.'
} as const;

const answer = z.strictObject({
  severity: z.enum(['pass', 'review', 'block']),
  findings: z.array(z.string().max(450)).max(4),
  repair: z.enum(['soften-look', 'manual', 'none']),
  fix: z.string().min(1).max(450).optional()
});

export type Review = {
  shot: number; role: keyof typeof roles; severity: 'pass' | 'review' | 'block';
  findings: string[]; fix?: string; repair: 'soften-look' | 'manual' | 'none';
};

export interface VisionVerifier {
  inspect(role: keyof typeof roles, shot: Shot, images: string[]): Promise<z.infer<typeof answer>>;
}

function configuredVerifier(): VisionVerifier | undefined {
  const endpoint = process.env.VISION_ENDPOINT;
  if (!endpoint) return;
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('VISION_ENDPOINT must be a trusted HTTPS URL');
  return {
    async inspect(role, shot, images) {
      const response = await fetch(url, {
        method: 'POST', signal: AbortSignal.timeout(80_000), redirect: 'error',
        headers: {'Content-Type': 'application/json', ...(process.env.VISION_API_KEY ? {Authorization: `Bearer ${process.env.VISION_API_KEY}`} : {})},
        body: JSON.stringify({role, criteria: roles[role], beat: shot.beat.text, visual: shot.beat.visual,
          scene: shot.scene.description, shot: {start: shot.start, end: shot.end, transition: shot.beat.transition,
            actions: shot.actions, sounds: shot.sounds}, images})
      });
      if (!response.ok) throw new Error(`Visual verifier returned HTTP ${response.status}`);
      return answer.parse(await response.json());
    }
  };
}

export async function reviewShots(film: Film, shots: {index: number; stills: string[]}[], verifier = configuredVerifier()): Promise<Review[]> {
  if (!verifier) return [];
  const results: Review[] = [];
  let previous: string | undefined;
  for (const {index, stills} of shots) {
    const images = await Promise.all(stills.map(async (path) => (await readFile(path)).toString('base64')));
    const checks = Object.keys(roles) as (keyof typeof roles)[];
    for (let i = 0; i < checks.length; i += 3) {
      const reviews = await Promise.all(checks.slice(i, i + 3).map(async (role) => {
        const context = role === 'continuity' && previous ? [previous, ...images] : images;
        return {shot: index, role, ...await verifier.inspect(role, film.shots[index], context)};
      }));
      results.push(...reviews);
    }
    previous = images.at(-1);
  }
  return results;
}
