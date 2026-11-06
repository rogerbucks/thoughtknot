# Rendering spec

**Version 0.1, 6 November 2026.** This page says how ThoughtKnot puts a graph on the screen. Section 73 of the editor
requirements asks for it (`render_spec_written`). Roger approved it on 6 November 2026. Change a rule only in a pull
request that raises the version and adds a line to the change log at the end.

## The short answer

| Question | Answer |
|---|---|
| Why does the drawing look bad today? | There is no single path. The 2D view draws SVG, then about 60 helpers change that SVG. The 3D and big-graph views copy their shapes back off the screen. Each fix sits on the last one, so they fight |
| What is the fix? | Eight layers, each with one job. Data only flows down. The look is decided in one place, the marks. Painters only paint |
| How do we know it works? | A scoreboard. It puts real screenshots beside the mockups and counts what is wrong: overlapping labels, things moved by a zoom, controls over the drawing |
| How is it built? | Six phases, beside today's drawing and behind a switch. The big-graph view comes first, because it has mockups |

## What is wrong today

Checked in the code on 6 November 2026. The drawing code is 143 files in `packages/core/src/display/graph-view`.

| # | Cause | Where | What you see |
|---|---|---|---|
| 1 | Two picture formats | `render.ts` makes SVG text. `svg-marks.ts` reads marks back off the SVG on screen for 3D, big graphs and sketches | 3D copies every flaw of 2D, and cannot show what its mockup shows |
| 2 | Changes after drawing | 67 files set SVG attributes after the drawing is made | Overlaps, smears, cut words. One fix undoes another |
| 3 | Levels added on top | Two level systems: `semantic-zoom.ts` and `detail-levels.ts`. Clouds are drawn over a layout that did not place by subject | Tangled links between clouds, not tidy rooms |
| 4 | Three cameras | 2D zoom, the 3D orbit and the big-graph camera, each with its own glide | Jumps when you switch between 2D and 3D |
| 5 | Five label placers | `readable-names`, `space-labels`, `level-tags`, `fit-text`, `readable-words` | Names collide or vanish in a different way in each view |
| 6 | The look is spread out | The mockup look lives only in `level-look.ts`. Colours are read back from CSS | Views look unlike each other. Dark mode drifts |
| 7 | Controls are not laid out | Panels float over the drawing | The drawing is covered. Icons show as words |
| 8 | Tests check code, not pixels | The suite was green on 4 November while 2D and 3D looked nothing like the mockups | Rework after Roger looks |

## The layers

Each layer has one job. It takes the output of the layer above and gives its output to the layer below. It never reads
the screen.

| Layer | Its job | Takes | Gives | Never |
|---|---|---|---|---|
| L0 Store | Hold the graph. Load a group when asked. Owned by Wave 34 (`scale_parts_overview`) | Note text | Group rows, and things on demand | Knows about screens |
| L1 Scene | One tree: subject, area, topic, item. Links rolled up at each level, with counts | Store rows, AI or link levels | The scene tree | Positions or colours |
| L2 Layout | Place rooms first, then the things in them. Graphviz is one engine here and gives positions only | Scene, kept spots | Positions at each level: x and y, and z in space | Draws, or moves a thing on zoom |
| L3 Detail | Pick the level for each part of the screen. Leave out what is off screen. Order the drawing, likeliest interest first. Ask L0 for groups coming on screen | Positions, camera | What shows, in what order | Changes a position |
| L4 Marks | Turn what shows into marks: clouds, cards, dots, ribbons with count chips, labels. Place every label once | Detail, look tokens | Drawing marks (`drawing-marks.ts`) | Touches the page |
| L5 Painters | Paint marks with WebGPU, WebGL 2 or the 2D canvas. SVG for small graphs, export and screen readers | Marks, camera | Pixels | Decides anything |
| L6 Camera | One camera for 2D, 2.5D, 3D and the globe; 2D is the camera with no tilt. Gestures. Picking a mark under the pointer | Pointer, keys, touch | The camera, what was picked | Lays out |
| L7 Chrome | Controls, panels, legend and mini-map in fixed places on the screen. Says which part of the screen is left for the drawing | Screen size | The safe area | Covers the drawing |

## The rules

1. **One way down.** No layer reads the page or a painter's output. `marksOfSvg` goes.
2. **The look lives in the marks.** L4 takes every colour and size from one file of look tokens, light and dark.
   Painters are given colours, never CSS.
3. **Painters agree.** Every painter gives the same picture: under 2% of pixels differ on the scoreboard scenes.
4. **Things stay put.** A position changes only when the graph's structure changes. Zoom shows more and moves nothing.
5. **2D and 3D match.** Every view and projection uses the same scene, layout and marks. Space lifts the positions; it
   never lays out again.
6. **One label placer.** No label overlaps another. No word is cut. Every label is at least 11 pixels high on screen and
   inside the safe area.
7. **Never disorient.** Every camera change glides, or happens at once under reduced motion, and keeps the focus in
   view (`requirements/ethos.gql`, principle 8).
8. **Fast.** The first picture in 300 milliseconds. 60 frames a second while panning 10,000 marks. The likeliest
   interest is drawn first.
9. **Readable by everyone.** What a screen reader says comes from the scene (L1), not from a painter. So every painter
   is equally readable.

## The scoreboard

A part is done only when the scoreboard passes and Roger has looked at its sheet of screenshots.

The scoreboard renders fixed scenes in a real browser. It puts each screenshot beside its mockup, and measures the
numbers below.

- **Scenes:** the mockup's 430-item sample, a 20-thing note, a tree, 10,000 things and 100,000 things.
- **Each scene at:** four zoom levels; 2D, 2.5D, 3D and the globe; light and dark; laptop and phone.

| Check | Passes at | Measured by |
|---|---|---|
| Looks like the mockup | Roger's OK on the sheet | Screenshot beside the mockup, same scene and zoom |
| Labels that overlap | 0 | Label boxes |
| Words cut, or under 11 pixels | 0 | Label boxes against the safe area |
| Controls over the drawing | 0 pixels into the safe area | Control boxes against the drawing |
| Things moved by a zoom | 0 | Positions before and after each zoom step |
| Painters that disagree | Under 2% of pixels | Each painter on the same scene |
| First picture | 300 milliseconds or less | Timed in the browser |
| Panning | 60 frames a second at 10,000 marks | Timed in the browser |
| Icons shown as words | 0 | The controls' text |

The first run measures today's drawing, so each phase can show what it improved.

## The phases

Each phase is built beside today's drawing, behind a switch, so nothing gets worse while it is built. Each ends with a
scoreboard run and a sheet for Roger.

1. **P0, measure.** This page, the scoreboard, and a first run on today's drawing.
2. **P1, the big-graph view in 2D.** Scene, rooms-first layout, marks with the mockup look, the canvas painter.
   Passes when the 430-item sample matches the 2D mockup at all four levels.
3. **P2, one camera and the controls.** The shared camera, gestures, picking on marks, controls in fixed places.
   Passes with no controls over the drawing and nothing moved by a zoom.
4. **P3, space.** 2.5D, 3D and the globe lift the same marks. WebGPU and WebGL 2 painters. Passes when it matches the
   3D and globe mockups and the painters agree.
5. **P4, every view.** The other view types and the Graphviz layouts give positions and marks. SVG stays for small
   graphs, export and screen readers.
6. **P5, switch over.** The new drawing is on by default. `marksOfSvg` and the changes after drawing are deleted.
   Passes when the whole scoreboard is green on the nightly.

## Decisions

On 6 November 2026 Roger chose all three:

- **D1.** Rebuild in layers, behind a switch, instead of more fixes to today's drawing.
- **D2.** Start with the big-graph view from the mockups. Other views keep today's look until P4.
- **D3.** Graphviz gives positions only. SVG stays only for small graphs, export and screen readers.

## Change log

| Version | Date | Change |
|---|---|---|
| 0.1 | 6 November 2026 | First version: the layers, the rules, the scoreboard and the phases |
