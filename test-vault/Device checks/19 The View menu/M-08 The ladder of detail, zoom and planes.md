# M-08 The ladder of detail, zoom and planes

**You should see:** a Detail control at the top of the View menu, with Overview, Groups and All. Overview folds each group into one named box with its count. Groups shows every thing in its group. Zooming in on a folded group until it fills half the view opens it. In 3D, each group's named card floats on a plane above its things, with a stalk down to them, and a folded group clicked twice opens.

**Test diagram:**

```gql
// graph: studio · SOURCE
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(cy:Person {name: 'Cy'}),
(dee:Person {name: 'Dee'}),
(ann)-[:ASKS]->(cy),
(bob)-[:ASKS]->(dee),
(ann)-[:HELPS]->(bob)
```

```gql
// graph: studio_style · STYLE studio
(n1:Nudge {word: 'group', thing: 'ann', group: 'Makers'}),
(n2:Nudge {word: 'group', thing: 'bob', group: 'Makers'}),
(n3:Nudge {word: 'group', thing: 'cy', group: 'Helpers'}),
(n4:Nudge {word: 'group', thing: 'dee', group: 'Helpers'})
```

<!-- expect: clean -->

**Do this:**

1. Press View on the drawing's bar, then press Overview. Check each group is one box with its name and count.
2. Zoom in on the Makers box until it fills half the view. Check it opens and Helpers stays folded.
3. Press Groups. Check every thing shows inside its group.
4. Switch the drawing to 3D. Check a named card for each group floats above its things, with a stalk down to them.
5. Press Overview again, then click a folded group twice in 3D. Check it opens.

**Checklist line:**

> **M-08** Press View, then Overview: each group is one named box with its count. Press Groups: every thing shows in its group. Zoom in on a folded group until it fills half the view: it opens. Switch to 3D: each group's named card floats on a plane above its things, a stalk down to them. Click a folded group twice in 3D: it opens.

**Back to the checklist:** [M-08 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for M-08 in its list.
