// The offer beside a loose line in Obsidian (spec §47, line_to_gql_offer and line_to_gql_ai). In Source mode the
// line with the caret, if the library cannot read it, gets a button at its end. Convert to GQL shows the GQL code
// made of it, and writes it only on Accept. Convert with AI, while AI is on, opens the send dialog on the line. The
// fake host never reaches the network.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { cmState, cmView, editorLivePreviewField, editorInfoField } from './host/fake-obsidian.js';

before(() => build());

const PATH = 'Team.md';
const fence = (lines) =>
  ['---', 'classification: Public', '---', '# Team', '', '```gql', ...lines, '```', ''].join('\n');
const GRAPH = ['// graph: team', "(alice:Employee {name: 'Alice'}),"];
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
};
const ON = { settings: { aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] } };

/** The plugin's own editor extensions: those that are real CodeMirror extensions. */
const ownExtension = (env) => (env.state.editorExtensions ?? []).filter((e) => !e?.listener);

/** An editor state for the note with the caret at the end of `typed`, in Source mode unless `livePreview`. */
function editorState(env, doc, typed, livePreview = false) {
  const at = typed === null ? 0 : doc.indexOf(typed) + typed.length;
  return cmState.EditorState.create({
    doc,
    selection: { anchor: at },
    extensions: [
      editorLivePreviewField.init(() => livePreview),
      editorInfoField.init(() => ({ file: { path: PATH } })),
      ...ownExtension(env),
    ],
  });
}

/** The offer buttons the editor would draw: where each is, and its button. */
function offers(state) {
  const out = [];
  for (const source of state.facet(cmView.EditorView.decorations)) {
    const set = typeof source === 'function' ? null : source;
    set?.between(0, state.doc.length, (from, _to, deco) => {
      if (deco.spec.widget?.constructor?.name === 'OfferButton') out.push({ at: from, widget: deco.spec.widget });
    });
  }
  return out;
}

/** A stand-in for the editor's view: its state, and the changes dispatched to it. */
const viewOf = (state) => {
  const view = { state, dispatched: [] };
  view.dispatch = (spec) => view.dispatched.push(spec);
  return view;
};
const button = (m, label) => m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);

async function open(note, data = {}) {
  const env = await load({ files: { [PATH]: note }, data });
  return env;
}

// line_to_gql_offer
test('a loose line gets the offer, valid lines and lines outside a block do not, and the line changes only on Accept', async () => {
  const typed = 'Alice likes Bob';
  const note = fence([...GRAPH, typed]);
  const env = await open(note);
  try {
    const state = editorState(env, note, typed);
    const [offer, ...more] = offers(state);
    assert.ok(offer, 'the loose line has an offer');
    assert.equal(more.length, 0);
    assert.equal(offer.at, note.indexOf(typed) + typed.length, 'at the end of the line');
    // a valid line, a heading, and Live Preview, where the block is a card with the fix in its text field: no offer
    assert.deepEqual(offers(editorState(env, note, GRAPH[1])), []);
    assert.deepEqual(offers(editorState(env, note, '# Team')), []);
    assert.deepEqual(offers(editorState(env, note, typed, true)), []);
    // pressing it shows the GQL, and changes nothing yet
    const view = viewOf(state);
    const dom = offer.widget.toDOM(view);
    assert.equal(dom.textContent, 'Convert to GQL');
    dom.dispatch('click');
    await until(() => env.state.modals.length);
    const review = env.state.modals.at(-1);
    assert.match(review.contentEl.textContent, /Alice likes Bob/);
    assert.match(review.contentEl.textContent, /\(alice\)-\[:LIKES\]->\(bob\)/);
    assert.equal(view.dispatched.length, 0, 'nothing is written before Accept');
    // Cancel leaves the line as typed
    button(review, 'Cancel').click();
    assert.equal(view.dispatched.length, 0);
    // Accept writes the GQL in place of the line, as one step
    offer.widget.toDOM(view).dispatch('click');
    await until(() => env.state.modals.length);
    button(env.state.modals.at(-1), 'Accept').click();
    await until(() => view.dispatched.length);
    const [{ changes, annotations }] = view.dispatched;
    assert.equal(changes.from, note.indexOf(typed));
    assert.equal(changes.to, note.indexOf(typed) + typed.length);
    assert.equal(changes.insert, "(bob {name: 'Bob'}),\n(alice)-[:LIKES]->(bob)");
    assert.equal(annotations.value, 'input.convert');
  } finally {
    env.uninstall();
  }
});

// line_to_gql_ai
test('a line code cannot convert is offered to an AI only while AI is on, through the send dialog', async () => {
  const typed = 'Alice manages the new hire, Bob, from March';
  const note = fence([...GRAPH, typed]);
  const off = await open(note, { settings: { aiModels: [LOCAL] } });
  try {
    assert.deepEqual(offers(editorState(off, note, typed)), [], 'with AI off there is no offer');
  } finally {
    off.uninstall();
  }
  const env = await open(note, ON);
  try {
    const [offer] = offers(editorState(env, note, typed));
    assert.ok(offer, 'with AI on, Convert with AI is offered');
    const dom = offer.widget.toDOM(viewOf(editorState(env, note, typed)));
    assert.equal(dom.textContent, 'Convert with AI');
    dom.dispatch('click');
    await until(() => env.state.modals.length);
    const m = env.state.modals.at(-1);
    const row = m.contentEl
      .querySelectorAll('.setting-item')
      .find((r) => r.querySelector('.setting-item-name')?.textContent === 'Model');
    const sel = row.querySelector('select');
    sel.value = 'Local';
    sel.dispatch('change');
    button(m, 'Show what will be sent').click();
    const body = m.contentEl.querySelector('.thoughtknot-ai-body')?.textContent ?? '';
    assert.match(body, /source-text\\nAlice manages the new hire, Bob, from March/);
    assert.equal(env.state.requests.length, 0, 'nothing is sent before Send');
    const answer = {
      things: [{ name: 'bob', kind: 'Employee', text: 'Bob', quote: 'Bob' }],
      links: [{ from: 'alice', type: 'MANAGES', to: 'bob', quote: 'Alice manages the new hire, Bob' }],
    };
    env.state.reply = async () => ({
      status: 200,
      text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }),
    });
    button(m, 'Send').click();
    // the answer is shown as the GQL the line becomes; the note is unchanged until Accept
    await until(() => env.state.modals.some((x) => x.titleEl?.textContent === 'Convert the line to GQL'));
    assert.equal(env.state.files.get(PATH), note);
    assert.equal(env.state.data.aiSends.length, 1, 'the send is recorded');
    button(env.state.modals.at(-1), 'Accept').click();
    await until(() => env.state.files.get(PATH) !== note);
    const written = env.state.files.get(PATH);
    assert.ok(written.includes("(bob:Employee {name: 'Bob'}),\n(alice)-[:MANAGES]->(bob)"), written);
    assert.ok(!written.includes(typed), 'the loose line is gone');
  } finally {
    env.uninstall();
  }
});
