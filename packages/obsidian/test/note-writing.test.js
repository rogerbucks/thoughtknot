// Each way the plugin writes a note, with the note changed between the vault's read and its write. It holds
// spec §9 (undo_never_over_theirs), storage_contract and risk CODE-5. Obsidian's vault.process reads, then writes, each
// awaited, and a keystroke, a sync or another program can land in between. The stand-in vault runs state.inProcess in
// that gap. So each writer must find the change there, refuse to write over it, and keep what was typed as a draft.
// Typing in the pane, its Undo and Redo, an estimated link's quick fix and Lock the graph are each held to it.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH as CARD_PATH, show } from './host/card-notes.js';
import { READER, NOTE, PATH, open, textarea, type, note } from './host/pane-notes.js';

before(() => build());

const MINE = READER + ',\n(mine:Reason)';
const THEIRS = READER + ',\n(theirs:Reason)';
const THEIRS_NOTE = NOTE.replace(READER, THEIRS);

/** Has the next vault write find the note changed to `text` after its read, as another program would change it. */
const changeInTheGap = (env, text) => {
  let ran = false;
  env.state.inProcess = async (f) => {
    ran = true;
    await env.app.vault.modify(f, text);
  };
  return () => ran;
};

describe('the note changes between the vault’s read and its write', () => {
  test('what is typed in the pane is never written over it: the pane keeps it as a draft', async () => {
    const env = await open();
    try {
      const gapped = changeInTheGap(env, THEIRS_NOTE);
      type(env.el, MINE);
      await until(() => gapped() && Object.keys(env.state.data?.drafts ?? {}).length > 0, 2000);
      await until(() => textarea(env.el).value === THEIRS, 2000);
      assert.equal(note(env), THEIRS_NOTE, 'their change is kept');
      assert.deepEqual(
        Object.values(env.state.data.drafts).map((d) => d.text),
        [MINE],
        'what was typed is kept',
      );
      assert.match(env.el.querySelector('.thoughtknot-draft').textContent, /kept as a draft/);
    } finally {
      env.uninstall();
    }
  });

  /** The pane open on the note, with MINE typed and written. */
  async function written() {
    const env = await open();
    type(env.el, MINE);
    await until(() => note(env) === NOTE.replace(READER, MINE), 2000);
    return env;
  }

  for (const which of ['Undo', 'Redo'])
    test(`${which} in the pane is refused: the note keeps their change, and the step is kept as a draft`, async () => {
      const env = await written();
      try {
        if (which === 'Redo') {
          labelled(env.el, 'Undo').click();
          await until(() => note(env) === NOTE, 2000);
          await until(() => labelled(env.el, 'Redo')?.getAttribute('aria-disabled') !== 'true', 2000);
        }
        const gapped = changeInTheGap(env, THEIRS_NOTE);
        labelled(env.el, which).click();
        await until(() => gapped() && textarea(env.el).value === THEIRS, 2000);
        assert.equal(note(env), THEIRS_NOTE, 'not written over');
        // what the step would have written is kept as a draft, offered to restore
        await until(() => Object.keys(env.state.data?.drafts ?? {}).length > 0, 2000);
        assert.deepEqual(
          Object.values(env.state.data.drafts).map((d) => d.text),
          [which === 'Undo' ? READER : MINE],
        );
      } finally {
        env.uninstall();
      }
    });

  test('an estimated link’s quick fix writes nothing over it, and says why', async () => {
    const block =
      "// graph: reader\n(small_reader:Option {name: 'Small'}),\n(eyes:Reason),\n(eyes)-[:FAVOURS]->(small_reeder)";
    const text = ['# Reader', '', fence(block), ''].join('\n'),
      changed = text.replace("name: 'Small'", "name: 'Smaller'");
    const env = await load({ files: { [CARD_PATH]: text } });
    try {
      const el = await show(env);
      const guess = el.querySelectorAll('g.edge').find((g) => g.getAttribute('data-estimate') === '0'),
        vp = el.querySelector('.thoughtknot-viewport'),
        at = { target: guess, pointerId: 9, pointerType: 'touch', clientX: 5, clientY: 5, button: 0 };
      vp.dispatch('pointerdown', at);
      vp.dispatch('pointerup', at);
      const details = el.querySelector('.thoughtknot-details'),
        gapped = changeInTheGap(env, changed);
      labelled(details, 'Change small_reeder to small_reader').click();
      await until(() => /nothing was written/.test(details.textContent), 2000);
      assert.ok(gapped(), 'the change came between the read and the write');
      assert.equal(env.state.files.get(CARD_PATH), changed);
    } finally {
      env.uninstall();
    }
  });

  test('Lock the graph writes its schema into the note as it then is, their change kept', async () => {
    const env = await open();
    try {
      const theirs = NOTE.replace('Between.', 'Between, and theirs.'),
        gapped = changeInTheGap(env, theirs);
      labelled(env.el, 'Lock the graph').click();
      await until(() => gapped() && /The schema: locked/.test(note(env)), 2000);
      assert.match(note(env), /Between, and theirs\./, 'their change is kept');
    } finally {
      env.uninstall();
    }
  });
});
