---
name: thoughtknot-graph-notes
description: Read, check, draw and edit the graph blocks in Markdown notes kept in OneDrive or SharePoint, with ThoughtKnot. Use when a note holds a gql graph block. The user may ask what it says, whether it has problems, for a picture, or to change it.
---

# ThoughtKnot graph notes

A note's `gql` blocks hold a graph. This skill reads, checks, draws and edits them through one script,
`scripts/thoughtknot.mjs`, run with Node. The script is the only source of every reading, problem, drawing and edit.
Never work these out yourself, and never say what the notation allows: ask the script, and pass on what it says.

## Before anything

1. Put the note where the script can read it: a file in your working folder. Keep its Microsoft 365 sensitivity label.
2. Run a command. Every command first checks the note against its classification and the AI ceiling. When it says the
   note is refused, tell the user why in its words and stop. Do not read the note by any other route.
3. When it asks for a yes, put the question to the user and wait. Only their yes counts. On a yes, run the command again
   with `--confirm <digest>` from the question.
4. The ceiling does not replace the sensitivity label. The label still applies to the note and to the files made from it.

## Commands

All answers are JSON on standard output. `<note>` is the note's file.

- `node scripts/thoughtknot.mjs read <note>`: the graphs, their things and links, and the problems.
- `node scripts/thoughtknot.mjs check <note>`: the problems alone, each with its line of the note.
- `node scripts/thoughtknot.mjs draw <note>`: writes `<note>.svg` and `<note>.png` beside it and answers with a card to
  show in the conversation. When it cannot draw it says why and gives the graph as text. Show that text. A different
  file already there is kept: ask the user, and only on their yes run `draw` again with `--replace`.
- `node scripts/thoughtknot.mjs propose <note> --edit '<json>'`: what an edit would change. It writes nothing.
- `node scripts/thoughtknot.mjs apply <note> --edit '<json>' --approve <digest>`: writes the edit.

Add `--settings <file>` when the user keeps a settings file for ThoughtKnot (their classifications and ceilings).
Add `--graph <name>` to draw a graph other than the first.

## Editing

An edit is a proposal. Run `propose`, show the user the `was` and `now` text and the line it is on, and ask whether to
apply it. Only on their yes run `apply` with the `approve` digest `propose` gave. If the note changed since, `apply`
refuses; propose again. Never write to the note in any other way. The edits and what each needs are in
`reference/commands.md`.

## When it goes wrong

The script's own words are the answer: relay them. If Node is missing, say so and give the graph as text from `read`.
Never leave the user with a blank result.
