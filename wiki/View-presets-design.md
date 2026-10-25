# View presets design

Roger asked on 25 October 2026 which orderings, layouts and views suit different brain types, with WCAG kept in mind.
He also asked that every choice be saved for later. This page is the plan. The requirements are editor spec section
69, workstream VP1. The research behind it is summed up below.

## The short answer

- **Presets are named by need, never by diagnosis.** People inside one group differ more than the groups differ.
- **Every choice saves on its own, and a named preset bundles them.**
- **WCAG 2.2 AA is a floor.** No preset goes below it, and the device's own settings win.
- **The default for everyone is a 2D drawing with an outline beside it.** 3D, VR and fisheye stay as extras.

```mermaid
flowchart LR
  P["Preset"] --> O["Ordering"] --> L["Layout"] --> V["View"] --> F["Formatting"] --> M["Motion"] --> T["Text and keys"]
```

## Built so far

The six starters are in `packages/core/src/view-presets.ts`. **View preset** heads the Drawing settings: picking one
sets every Drawing setting it turns, and each stays yours to change. The floor, the device winning, the nearest
preset winning and the one-file export are there too. The hosts read the device's settings, and a graph or vault
keeps its own preset, next.

A preset sits beside a personal profile (section 39). The preset says how a graph is drawn. The profile says how much
of it a viewer is shown.

## Starter presets

| Starter | Ordering | Layout | View | Motion | Extra |
| --- | --- | --- | --- | --- | --- |
| Default | By flow | Rows, or stress for a network | 2D and outline | Follows the device | AA floor |
| Focus support | Hubs first | Rows, the focus in the middle | 2D, the rest blurred | Off | A trail of recent picks |
| Calm and predictable | One order the person picks | Pinned, laid out again only when asked | 2D or grid | Off | A preview before a change |
| Detail first | By name or property | Grid or matrix | Matrix or outline | Off | Every label shown |
| Big picture first | By kind or group | Groups as boxes, folded | Semantic zoom | Optional | One key to fit all |
| Reading support | By flow or kind | Rows, short labels | 2D and outline | Follows the device | Wider spacing, read aloud |

## What the research says

| Finding | How sure | Source |
| --- | --- | --- |
| Almost no study tests these groups reading node-link graphs | High | Wu 2026, Tran 2024 |
| With ADHD, a distractor holds attention longer once it catches it | Medium | Zhang 2024 |
| A busy but relevant view distracts less than a sparse one | Medium | Forster and Lavie 2023 |
| ADHD readers prefer blurring the rest to hiding it, and saved presets | Medium | Zhu, ASSETS 2025 |
| No evidence that ADHD subtypes need different layouts | Medium | Search found none |
| Autistic readers see the whole more slowly, not worse at it | High | Van der Hallen 2015 |
| Uncertainty and surprise changes raise anxiety for many autistic people | High | Jenkinson 2020 |
| Fonts made for dyslexia do not help; wider word spacing does a little | High | Wery 2017, Kuster 2018, Galliussi 2020 |
| 3D hurts memory of where things are | Medium | Kotlarek 2020 |
| A matrix suits a dense graph, a node-link drawing a sparse one | High | Okoe 2018 |

The full research, with 34 sources and a confidence for each choice, is kept with the project files
(`neuro-layouts/research.md`).

## Safe for everyone

- Contrast at least 4.5:1 for text and 3:1 for shapes and focus.
- Colour never the only cue: a shape or an icon too.
- Motion follows the device; nothing plays by itself; a pause for anything past five seconds.
- Laid out again only on request; pinned things stay put.
- Every action by keyboard, with undo and a way that needs no dragging.
- The outline always one key away.
