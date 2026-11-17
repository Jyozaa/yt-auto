import {z} from 'zod';
import {beatRoles, wordsOf, type Story} from './schema';

export const semanticCriteria = ['curiosity', 'originality', 'escalation', 'coherence', 'factualSupport',
  'unsupportedClaims', 'explanation', 'analogy', 'callback', 'spokenLanguage', 'visualFeasibility'] as const;
const rubric = {
  curiosity: 'Does the opening state a surprising true claim immediately and create a concrete question?',
  originality: 'Does the package show a distinctive, source-specific angle? External duplication requires separate search evidence.',
  escalation: 'Do three to six distinct beats increase tension, stakes, or absurdity in stages?',
  coherence: 'Does the climax follow from those beats? Are the who, when, and where clear?',
  factualSupport: 'Do the supplied claims and evidence cover historical and scientific statements? Flag claims requiring source inspection.',
  unsupportedClaims: 'Look for invented dialogue, motives, reactions, measurements, causal assertions and fictional details presented as fact.',
  explanation: 'Does the script make the mechanism understandable in concise spoken English?',
  analogy: 'Is the everyday analogy easy to picture and faithful to the important mechanism?',
  callback: 'Does the final sentence pay off a specific early detail or claim?',
  spokenLanguage: 'Check pace, sentence length, spoken phrasing, unsuitable humour, and filler.',
  visualFeasibility: 'Does every beat have a meaningful executable visual progression with supplied actors, props, and cues?'
};
const reviewSchema = z.strictObject({
  scores: z.object(Object.fromEntries(semanticCriteria.map((criterion) => [criterion, z.number().int().min(1).max(5)])) as
    Record<typeof semanticCriteria[number], z.ZodNumber>),
  findings: z.array(z.string().min(1).max(450)).max(16),
  requiredChanges: z.array(z.string().min(1).max(450)).max(16)
});

export function structuralAudit(story: Story, allowLegacy = false) {
  const first = story.beats[0].text.split(/(?<=[.!?])\s/)[0];
  const hook = wordsOf(first).length;
  const wordCount = wordsOf(story.narration).length;
  const escalations = story.beats.filter(({role}) => role === 'escalation');
  const issues: {check: string; message: string; required: boolean}[] = [];
  const add = (check: string, message: string, required = true) => issues.push({check, message, required});
  if (story.version === 1 && !allowLegacy) add('contract', 'Submit new stories with version 2 and a narrative brief.');
  const strict = story.version === 2 || !allowLegacy;
  if (hook < 10 || hook > 16) add('hook', 'Write a 10–16-word first sentence.', strict);
  if (/^(welcome|today|in this (video|short)|have you ever|imagine (if|this))/i.test(first)) {
    add('hook', 'Open on the surprising fact. Remove the introductory phrasing.');
  }
  if (/[?]$/.test(first)) add('hook', 'State the paradox as a fact before asking a question.', strict);
  if (escalations.length < 3 || escalations.length > 6) add('escalation', 'Submit 3–6 separately staged escalation beats.', strict);
  if (new Set(escalations.map((beat) => beat.text.toLowerCase().replace(/[^a-z0-9]+/g, ' '))).size < escalations.length) {
    add('escalation', 'Give every escalation beat a distinct narrated event.');
  }
  if (strict) {
    for (const role of beatRoles.filter((role) => role !== 'escalation')) {
      if (story.beats.filter((beat) => beat.role === role).length !== 1) add('structure', `Use one ${role} beat.`);
    }
    if (!story.beats.find(({role}) => role === 'turn')?.claims.length) add('sources', 'Tie the turning point to a cited claim.');
    if (!story.narrative || !story.sources.some(({kind}) => kind === 'primary')) add('sources', 'Supply a narrative brief and a primary source.');
    if (story.beats.some(({visual, actions, camera}) => !visual || (!actions.length && camera.emphasis === undefined))) {
      add('feasibility', 'Specify a visual intention and staged action or camera emphasis for every beat.');
    }
  }
  if (/\b(like and subscribe|smash the like button|follow for more|thanks for watching)\b/i.test(story.narration)) {
    add('spoken-language', 'End on the callback. Remove the call to action.');
  }
  if (story.beats.some(({text}) => text.split(/(?<=[.!?])\s/).some((sentence) => wordsOf(sentence).length > 35))) {
    add('spoken-language', 'Try shorter spoken lines where a sentence exceeds 35 words.', false);
  }
  const estimatedSeconds = Math.round(wordCount / 3.7 * 10) / 10;
  if ((estimatedSeconds < 55 || estimatedSeconds > 70) && strict) add('duration', 'At 3.7 words per second the script falls outside 55–70 seconds.');
  const scored = ['hook', 'escalation', 'structure', 'sources', 'feasibility', 'spoken-language', 'duration'];
  const structuralScores = Object.fromEntries(scored.map((check) => [check,
    issues.some((issue) => issue.check === check && issue.required) ? 0 : issues.some((issue) => issue.check === check) ? 1 : 2
  ]));
  return {passed: !issues.some(({required}) => required), story: story.id, version: story.version, estimatedSeconds,
    wordCount, hookWords: hook, escalationBeats: escalations.length, structuralScores, issues};
}

export async function auditStory(story: Story, options: {allowLegacy?: boolean; semantic?: boolean} = {}) {
  const structure = structuralAudit(story, options.allowLegacy);
  const endpoint = options.semantic !== false ? process.env.STORY_REVIEW_ENDPOINT : undefined;
  if (!structure.passed || !endpoint) {
    return {...structure, semantic: {status: structure.passed ? 'unavailable' as const : 'skipped' as const},
      requiredChanges: structure.issues.filter(({required}) => required).map(({message}) => message)};
  }
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('STORY_REVIEW_ENDPOINT must be a trusted HTTPS URL');
  const key = process.env.STORY_REVIEW_API_KEY;
  const response = await fetch(url, {
    method: 'POST', signal: AbortSignal.timeout(65_000), redirect: 'error',
    headers: {'Content-Type': 'application/json', ...(key ? {Authorization: `Bearer ${key}`} : {})},
    body: JSON.stringify({rubric, story, instructions: 'Review data only. Score each criterion from 1 to 5. Return scores, findings, and requiredChanges.'})
  });
  if (!response.ok) throw new Error(`Story reviewer returned HTTP ${response.status}`);
  const result = reviewSchema.parse(await response.json());
  const low = Object.entries(result.scores).filter(([, score]) => score < 3).map(([criterion]) => `Resolve the low ${criterion} score.`);
  const requiredChanges = [...result.requiredChanges, ...low];
  return {...structure, passed: !requiredChanges.length, semantic: {status: 'reviewed' as const, ...result}, requiredChanges};
}
