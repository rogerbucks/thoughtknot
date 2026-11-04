# Commands and edits

The script's answers and the edits it takes. The notation itself is not described here: the script is its only source.

## Answers

- `read: false` with `refuse` or `ask`: the note was not let in. `ask` also holds `digest`.
- `read: true`: the note was let in. `level` is its classification, or null when it has none.
- `read` adds `graphs` (each with `name`, `things`, `links`), `problems`, and `why` when there is nothing to read.
- `problems` hold `graph`, `line` (of the note), `severity`, `message` and `fix`.
- `draw` adds `card`, `text`, `files`, `notes` and, when it could not draw, `why`.
- `propose` adds `said`, `was`, `now` and `approve`; or `refused`; or `same` when the edit changes nothing.
- `apply` adds `written` and `said`.

## Edits (the `--edit` JSON)

`graph` names the graph; left out, it is the first. Each edit names what it needs:

- `{"do": "rename", "thing": KEY, "text": TEXT}`
- `{"do": "add-child", "thing": KEY, "text": TEXT}` and `{"do": "add-sibling", "thing": KEY, "text": TEXT}`
- `{"do": "new", "text": TEXT, "kind": KIND, "name": NAME}` (`kind` and `name` are optional)
- `{"do": "delete", "thing": KEY}`
- `{"do": "link", "from": KEY, "to": KEY, "type": TYPE}` (`type` is optional)
- `{"do": "set", "thing": KEY, "prop": PROPERTY, "value": TEXT}`
- `{"do": "line", "line": SENTENCE}` (a short sentence naming things and how they connect, as the user said it)
