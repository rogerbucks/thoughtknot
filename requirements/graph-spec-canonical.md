# A graph's canonical form and its hash

Two graphs that say the same thing must give the same hash. This page says how (editor spec §51, spec_canonical_form).
The graph spec 1.0 holds it. Both libraries follow it, and `packages/graph-spec/test/canonical.test.mjs` and
`python/graph_spec/tests/test_canonical.py` hold them to it.

## What is left out

The hash looks at the graph, never at how it was written. These make no difference:

- the order things, links and properties are written in
- spaces, line breaks and `//` comments
- `INSERT` in front, or not
- a property set when the thing is written, or by a `SET` straight after
- the order of a thing's labels
- a property that is null (it counts as absent)
- `1` or `1.0`, and `Z` or `+00:00` on a time

## The canonical form

1. Each **thing** becomes a pair: its labels, sorted, and its properties without the null ones.
2. Each **link** becomes four parts. They are the id of the thing it leaves, its type and the id of the thing it
   enters. The fourth is its properties without the null ones.
3. A time is written as its text in UTC: a date as `YYYY-MM-DD`, an instant with `+00:00`.
4. Things are sorted by their `id` property.
5. Links are sorted by their own canonical JSON text (step 6).
6. The list is the sorted things, then the sorted links. It is written as RFC 8785 JSON: object keys sorted, no spaces,
   numbers and text as JSON writes them.

## The hash

The hash is the SHA-256 of that JSON text, in lower-case hexadecimal. Where a hash is stored it is named, as
`sha-256:` and the 64 digits (`requirements/hashes.md`).

## What a different graph does

One more property, a different value, a link the other way round, a different label: each gives a different hash.
