# Daily ChatGPT story intake

Paste the block below into a ChatGPT Scheduled Task. Choose a daily time in ChatGPT. The repository must be readable in the scheduled session, either as a public repository or through a connected account with access.

```text
Every day, research and prepare at most one original 55–70 second history or science short for Jyozaa/yt-auto.

Read the latest story schema at https://github.com/Jyozaa/yt-auto/blob/main/src/story/schema.ts, the scene vocabulary at https://github.com/Jyozaa/yt-auto/blob/main/docs/architecture.md#scene-vocabulary, and the sample at https://github.com/Jyozaa/yt-auto/blob/main/examples/foucault.json. Use the script-quality rubric at https://github.com/Jyozaa/yt-auto/blob/main/src/story/quality.ts. Follow these rules if the files are readable. If you cannot read and verify the contract, report what you could not access and skip submission.

Check open and closed issues and their story IDs at https://github.com/Jyozaa/yt-auto/issues. Look for duplicates of the event, the hook, and the central mechanism. Compare several candidates. Pick a surprising true event with a clear visual cause and effect, demonstrable stakes, support from a primary source, and a strong final callback. Skip the day if you cannot establish novelty, factual support, or feasibility.

Open and check the sources. Prefer dated primary material and institutional or peer-reviewed corroboration. Record individual factual claims, and include two distinct sources for any claim marked high risk. Tie each factual beat to the claims it makes. Treat jokes or analogies as illustrative. Avoid inventing dialogue, reactions, intentions, measurements or outcomes. Avoid forced comedy in tragedy and overly sensitive topics.

Write roughly 205–245 words of concise, spoken English. Start with a single 10–16 word statement of the surprising fact. Give the concrete year, place, people and situation. Stage three to six separate escalating events. Show a climax or mystery that makes the explanation necessary. Use “You see,” where it sounds natural, then explain the mechanism using an everyday analogy. Tell what changed afterward. End on a short ironic payoff that recalls a specific detail from the opening. Use a visual action in every beat. End with the story and omit greetings, captions, logos, outros and calls to action.

Produce the version 2 JSON package. Follow roles in the order hook, setting, escalation, turn, analogy, consequence, payoff. Repeat escalation three to six times. Include a narrative brief, classified HTTPS sources, cited claims, an unused story ID, the full narration, characters, scenes, and fully timed beats. Set narration to the beat texts joined by single spaces. Cue words are zero-based within each beat, using the schema's word tokenization. Check that each camera can see the action, starts and ends at different positions, and has a supported lens plan. Check every actor, prop, action, sound, and coordinate against the contract. Keep the issue body under 55,000 UTF-8 bytes and use private YouTube metadata if included.

Review the result against curiosity, originality, escalation, coherence, factual support, unsupported claims, explanation, analogy, callback, spoken language, estimated duration and visual feasibility. Revise anything weak or speculative. If shell validation is available, run npm run validate -- story.json and npm run audit -- story.json. Otherwise check the contract field by field without claiming the validators ran.

If this scheduled session has an explicit, authorized GitHub issue-writing action for an allowlisted identity and can set the story-ready label, create one issue in Jyozaa/yt-auto titled [Story] followed by the story title. Use JSON only in the issue body and apply story-ready. Verify the returned issue URL, author and label. If a write may have succeeded, check for the issue before any retry. If the session has read access or needs approval, return the validated JSON in a single fenced json block, ready for manual submission. If an issue exists but could not be labeled, report its URL and pending label. Report the evidence and self-audit outside the issue body.
```

See [story intake](story-intake.md) for CLI submission, author allowlisting, and verification.
