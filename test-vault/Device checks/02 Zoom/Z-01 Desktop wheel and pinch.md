# Z-01 Desktop wheel and pinch

**You should see:** the mouse wheel alone zooming the drawing about the pointer, with no key held. With Alt or Option held, the wheel scrolls the note instead, and so do two fingers dragged on a trackpad. A trackpad pinch, and the wheel with Ctrl or Command, zoom too. The pinch, and the wheel with Ctrl or Command, zoom a little quicker than they used to: about 1.4 times the old rate, so a small pinch makes a clear change, and one notch of the wheel zooms by about a third. The wheel alone in full screen and in the edit pane is quicker by the same amount, as it cannot be told from a pinch. Zoom still stops at four times natural size and, going out, where the whole drawing fits.

**Test diagram:**

```gql
// graph: reader · SOURCE
(question:Question {title: 'Which device should I read long PDFs on?'}),
(large:Option {name: 'Large e-ink reader'}),
(small:Option {name: 'Small e-ink reader'}),
(tablet:Option {name: 'Keep using the tablet'}),
(pages:Reason {title: 'A4 pages need a screen of about 10 inches or more'}),
(eyes:Reason {title: 'E-ink is easier on the eyes over long sessions'}),
(free:Reason {title: 'The tablet costs nothing extra'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question),
(tablet)-[:ANSWERS]->(question),
(pages)-[:FAVOURS]->(large),
(pages)-[:COUNTS_AGAINST]->(small),
(eyes)-[:FAVOURS]->(large),
(eyes)-[:FAVOURS]->(small),
(free)-[:FAVOURS]->(tablet)
```

<!-- expect: clean -->

**Do this:**

1. With the pointer over the drawing, turn the mouse wheel alone and watch the drawing zoom about the pointer.
2. Hold Alt or Option and turn the wheel, and watch the note scroll.
3. On a trackpad, pinch over a box, in and out, and check it feels a little quicker than the fingers, not sluggish.

**Checklist line:**

> **Z-01** Desktop: the mouse wheel alone zooms about the pointer, and so does a trackpad pinch, a little quicker than the fingers move. With Alt or Option the wheel scrolls the note.

**Back to the checklist:** [Z-01 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for Z-01 in its list.
