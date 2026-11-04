# Text to graph design

Give an AI a piece of text and get back a graph of the things, kinds and links it names. It comes as a proposal you
accept or reject. Designed on 18 October 2026, against version 0.5.0, at Roger's request. Built on 4 November 2026,
for version 0.9.0.

The requirements are section 47 of
[`requirements/editor-requirements.md`](https://github.com/rogerbucks/thoughtknot/blob/main/requirements/editor-requirements.md),
slice 10, in workstream X1. They are built in Wave 24 of
[`requirements/waves.json`](https://github.com/rogerbucks/thoughtknot/blob/main/requirements/waves.json), after the
Obsidian community release (R2). Roger's rule is that what he adds now goes after R2.

## Two doors, one contract

| Door | Where | How it sends |
|---|---|---|
| In the editor | A command on selected text or a whole note | The AI send rules of §19: off until chosen, the model for proposing changes, within its ceiling, seen before sent, recorded |
| As a skill | A Claude skill whose SKILL.md also loads in Copilot Cowork | The conversation's own model; the library proposes the block, nothing is written before approval |

Both take the prompt and the answer's shape from the library released on GitHub, so the same text gives the same kind
of proposal everywhere. The model's answer is untrusted. The graph format library reads and checks it before anything
is shown, and a bad answer is refused with the reason.

## What the proposal shows

- Each new thing, kind and link, marked as an addition (§17).
- Things already in the note's graph, matched by name or alias and marked, never added twice.
- For each item, the words of the text it came from, so it can be checked against the source.

## How it works now

- In Obsidian, the command Make a graph of the text with an AI model takes the text you selected, or the whole note.
- The send dialog shows exactly what goes, as for any send. Each thing and link must quote the words it came from.
- A note with a graph gets a change set, reviewed over the graph. A note with none gets a short list: tick what to keep.
- In the skill, the conversation's own model makes the graph, and the script checks it and writes it on your yes.

## What it builds on

- §17 proposals and §19 AI rules, already built for the AI send dialog.
- §46, the Copilot Cowork skill, which ships the same SKILL.md as a `.skill` with each release.
- §45 `board_ai_decompose`, which does the same for a whiteboard; text to graph is its counterpart for prose.
