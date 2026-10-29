# The boundary: where things live

The line between the owner's personal layer and a corporate one (editor spec §40). Roger's sign-off on the contract is
asked in the thread "Build the web layer and work/personal boundary". Until he answers, it is built as recommended:
AI-made content crosses labelled.

- **The personal layer** is the open-source engine, the profiles, sync and the keys. It works with nothing from work.
- **The corporate layer** is a setting: plain data for one workplace. Nothing else. The same core draws content in
  both layers.

It is written in erasable TypeScript, so Node runs its tests with no build. It uses no Node module, so it runs in
every host.

## A setting

`setting.ts` reads a setting from its JSON and fills in the defaults.

- `redact`: things to leave out, by tag, label or property key. A thing left out is listed in the manifest.
- `ai`: what happens to AI-made content as it crosses. `label` (the default), `remove`, or `hold` until a person
  allows it.
- `policy`: who may edit, what needs review, which graphs may be joined. It only ever narrows (see below).

## What crosses: a parcel

`parcel.ts` makes a parcel of one note under one setting. A parcel is plain text, so both sides read it.

- The note, its graph blocks written back with the setting's rules applied.
- A picture of each graph, as SVG, when an engine is given.
- `manifest.json`: the setting, the day, what was left out, what is AI-made, and a hash of the rest.

What never crosses:

- **Any key.** `keys-found.ts` looks for every kind of key. One found refuses the whole parcel, naming the kind and
  the file, never the key. Nothing is quietly cut out.
- **Personal things.** Profiles and what was learned stay behind (the core's `corporateView`).
- **AI suggestions nobody applied.** A parcel is made from a note's text alone. Suggestions live in the review queue.

## The platform's permissions come first

`platform.ts` reads a platform's own permissions, such as SharePoint's role assignments.

- An item the person cannot read is never handed on: a connector is given only `visibleItems`.
- What a person may do is what the platform allows **and** what the policy allows. The policy only narrows.

## Filtered views

`filtered-views.ts` gives each setting a view of its own. It is experimental: off unless switched on.

- A view starts from the explicit grants (the core's permissions). The setting's redactions apply on top.
- An override is one more redaction. It applies only once a person confirms it.

## The tests

- `test/boundary-contract.test.js`: no key crosses, and AI-made content is labelled, removed or held.
- `test/layers.test.js`: the personal layer works with downloads blocked, and draws the same in both layers.
- `test/platform-security.test.js`: an item the person cannot read is never shown, and the policy only narrows.
- `test/filtered-views.test.js`: off changes nothing; on, a view is a part of the grants; overrides wait for a yes.
