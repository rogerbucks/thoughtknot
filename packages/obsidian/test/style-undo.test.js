// A drag on the card is taken back by the editor's own undo (editor spec §6, drag_moves_box; risk UX-5). Typed edits go
// through the note's editor, so Cmd+Z reaches them. A nudge written behind the editor's back would not be reached. So,
// with the note open in the editing view, a drag is one change to the editor and the file is never written behind it.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, until } from './host/load-plugin.js';
import { cmState, editorInfoField, editorLivePreviewField } from './host/fake-obsidian.js';
import { PATH, TEAM, card, mouse, noteOf } from './host/drag-steps.js';

before(() => build());

describe('a drag on the card, with the note open in the editing view', () => {
  // proves: drag_moves_box
  test('is one change to the editor, marked as the plug-in’s, and writes nothing to the file behind it', async () => {
    const note = noteOf(TEAM);
    const { env, vp, boxOf, placeOf, besideOf, at, writes } = await card(note);
    try {
      const sent = [];
      const view = {
        state: cmState.EditorState.create({
          doc: note,
          extensions: [editorLivePreviewField.init(() => true), editorInfoField.init(() => ({ file: { path: PATH } }))],
        }),
        dispatch(spec) {
          sent.push(spec);
          view.state = view.state.update(spec).state;
        },
      };
      env.plugin.editorViews.add(view);
      const start = at(placeOf('ann').x, placeOf('ann').y),
        drop = besideOf('cy');
      vp.dispatch('pointerdown', mouse(1, boxOf('ann'), start));
      vp.dispatch('pointermove', mouse(1, vp, drop));
      vp.dispatch('pointerup', mouse(1, vp, drop));
      await until(() => sent.length > 0);
      assert.equal(sent.length, 1, 'one change, so one Cmd+Z takes it back');
      assert.equal(sent[0].userEvent, 'input.thoughtknot');
      assert.match(
        view.state.doc.toString(),
        /STYLE team[\s\S]*\(nudge_1:Nudge \{word: 'beside', thing: 'ann', other: 'cy'\}\)/,
      );
      assert.ok(view.state.doc.toString().includes(TEAM), 'the data block untouched');
      assert.deepEqual(writes, [], 'the file is not written behind the editor');
      assert.equal(env.state.notices.at(-1), 'Moved: Put Ann beside Cy');
    } finally {
      env.uninstall();
    }
  });
});
