# M-01 The four switches and their defaults

**You should see:** a View button on the drawing's bar. Pressing it opens the Detail steps Overview, Groups and All, the switch Hide labels too small to read — on, and Group by. Under More choices are Fold busy things — on, Fold groups — off, Bundle links between groups — off and the layout sliders. VoiceOver reads each as a switch, on or off. After Fold groups is set to On in the settings and the note is opened again, the two groups are drawn folded, each as one box saying how many things it holds, and its switch says on.

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

1. Press View on the drawing's bar, open More choices, and read the switches and whether each is on or off.
2. With VoiceOver on, move through the switches and check each is read as a switch with its state.
3. Open Settings › ThoughtKnot and, under Drawing, set Fold groups to On.
4. Close this note and open it again. Check the groups are drawn folded and the View menu's Fold groups says on.
5. Set Fold groups back to Off in the settings, to leave them as they were.

**Checklist line:**

> **M-01** Press View on a graph's bar: Detail with Overview, Groups and All, then Hide labels too small to read and Group by. More choices holds Fold busy things, Fold groups, Bundle links and the sliders. Each switch says what it does, and on or off. Change a switch's default in Settings › ThoughtKnot › Drawing. Open the note again: its graphs start as the settings say.

**Back to the checklist:** [M-01 in the device checklist](https://github.com/rogerbucks/thoughtknot/blob/main/packages/obsidian/test/device-checklist.md), on GitHub. Look for M-01 in its list.
