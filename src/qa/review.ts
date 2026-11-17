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
  narrative: 'Review whether each image and action makes the narrated beat readable, including transitions and the final beat.'
} as const;

const answer = z.strictObject({
  severity: z.enum(['pass', 'review', 'block']),
  findings: z.array(z.string().max(450)).max(4),
  repair: z.enum(['soften-look', 'manual', 'none'])
});

export type Review = {
  shot: number; role: keyof typeof roles; severity: 'pass' | 'review' | 'block';
  findings: string[]; repair: 'soften-look' | 'manual' | 'none';
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
        body: JSON.stringify({role, criteria: roles[role], beat: shot.beat.text, scene: shot.scene.description, images})
      });
      if (!response.ok) throw new Error(`Visual verifier returned HTTP ${response.status}`);
      return answer.parse(await response.json());
    }
  };
}

export async function reviewShots(film: Film, shots: {index: number; stills: string[]}[], verifier = configuredVerifier()): Promise<Review[]> {
  if (!verifier) return [];
  const results: Review[] = [];
  for (const {index, stills} of shots) {
    const images = await Promise.all(stills.map(async (path) => (await readFile(path)).toString('base64')));
    for (const role of Object.keys(roles) as (keyof typeof roles)[]) {
      results.push({shot: index, role, ...await verifier.inspect(role, film.shots[index], images)});
    }
  }
  return results;
}
