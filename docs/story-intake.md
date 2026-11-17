# Story intake

## Submit a story

Submit one open GitHub Issue containing a version 2 JSON package. Use raw JSON or one fenced `json` block with no surrounding prose. Keep the UTF-8 issue body under 55 KB. Use the [sample](../examples/foucault.json), [schema](../src/story/schema.ts), and [asset catalog](architecture.md#scene-vocabulary) to author packages. Every factual assertion needs a supplied claim and citation. Set an unused story ID and use zero-based word offsets within each beat for cues. The narration field equals the beat texts joined by single spaces.

From a trusted account, add the `story-ready` label. It triggers the production workflow. If the issue tool adds the label through a GitHub automation token that cannot trigger new runs, the scheduled poll or manual dispatch still picks it up.

```sh
npm run validate -- story.json
npm run audit -- story.json
gh issue create --repo Jyozaa/yt-auto --title '[Story] Working title' --body-file story.json --label story-ready
```

If the label did not trigger a run, dispatch `gh workflow run production.yml -f issue=42` with the number of your issue. Add `-f retry=true` to recover a failed or interrupted unchanged story before uploading begins. Actions reads one eligible issue at a time. Check the issue, the run logs, and its artifact links for results.

To bootstrap a fresh repo without labels, create `story-ready` in **Issues → Labels** before trying the labeled submission command. The production workflow creates and synchronizes the other queue labels as it processes its first job.

| Label | Meaning |
| --- | --- |
| `story-ready` | Submitted and awaiting validation |
| `story-processing` | Reserved by one workflow attempt |
| `story-done` | QA-approved artifact saved. Comment records the YouTube ID if uploaded |
| `story-failed` | Production failed or upload needs reconciliation |
| `story-rejected` | Invalid package, reused story ID, or edits to an accepted package |

Only `Jyozaa` is trusted by default. Set the Actions variable `STORY_TRUSTED_AUTHORS` to a comma-separated list of logins with no spaces to extend trust. The workflow checks the issue author again against GitHub before accepting input. The issue's body is data. Positions, code paths, environment variables, and renderer configuration come from the checked-out app or its typed schema. Production never evaluates issue text.

## Scheduled ChatGPT handoff

Paste the [daily task prompt](CHATGPT_SCHEDULED_STORY_TASK.md) into [ChatGPT Scheduled](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt) and choose a daily schedule. The task researches and audits a single story, using the current repository contract. It returns a ready-to-submit JSON package if scheduling permissions do not provide an authorized writer. The standard [ChatGPT GitHub app](https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt) provides read access.

To verify a write-enabled scheduled environment, use one valid unused test story with YouTube upload disabled. Confirm that the issue author matches an allowlisted login and that the issue has `story-ready`. Look for a label-triggered production run or dispatch by issue number to test the poll handoff. Treat scheduled issue creation as verified only after observing it from the scheduled session itself. The manual command above uses the authenticated GitHub CLI account and the same production queue.

## Persistence and recovery

The repository's `yt-auto-ledger` branch stores the issue's immutable GitHub ID, normalized package hash, story ID, owning Actions attempt and terminal state. Updates use the GitHub Contents API's file SHA as a compare-and-swap. The label and comment make the state visible, while the branch is authoritative. Retain the branch when pruning old refs.

A retry can reclaim an unchanged processing or failed issue. To revise a story already claimed, submit a new issue with a fresh story ID. A process interrupted during upload keeps the durable upload barrier. See [YouTube reconciliation](youtube.md#interrupted-upload).
