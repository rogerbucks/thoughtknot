// A GraphML file read back in plain JavaScript (ES§67 format_loss_stated, format_untrusted_files): graphml-read.ts.
// Values come back as the kinds their keys say, a second or nested graph is said, never read in, and limits hold.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GRAPHML_LIMITS, readGraphml } from '../src/graphml-read.ts';

const doc = (body, keys = '') =>
  `<?xml version="1.0"?>\n<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n${keys}\n<graph id="G" edgedefault="directed">\n${body}\n</graph>\n</graphml>`;

describe('format_loss_stated: a GraphML file read back', () => {
  test('each value comes back as its key says: a number, a truth, a text, a day and an instant', () => {
    const keys = [
      '<key id="n" for="node" attr.name="size" attr.type="double"/>',
      '<key id="b" for="node" attr.name="ok" attr.type="boolean"/>',
      '<key id="d" for="node" attr.name="born" attr.type="string"><desc>gn:date</desc></key>',
      '<key id="t" for="node" attr.name="seen" attr.type="string"><desc>gn:datetime</desc></key>',
      '<key id="e" for="node" attr.name="empty" attr.type="int"/>',
    ].join('\n');
    const r = readGraphml(
      'a.graphml',
      doc(
        '<node id="a"><data key="n">-0</data><data key="b">true</data><data key="d">2026-01-02</data><data key="t">2026-01-02T03:04:05Z</data><data key="e"></data></node>',
        keys,
      ),
    );
    const [[id, kinds, p]] = r.things;
    assert.equal(id, 'a');
    assert.deepEqual(kinds, []);
    assert.ok(Object.is(p.size, -0));
    assert.equal(p.ok, true);
    assert.deepEqual(
      [p.born.kind, p.born.s, p.seen.kind, p.seen.s],
      ['date', '2026-01-02', 'datetime', '2026-01-02T03:04:05'],
    );
    assert.equal('empty' in p, false, 'an empty number is no value');
    assert.deepEqual(r.thingLines, [9]);
  });

  test('a second graph and a graph inside a node are said, never read in', () => {
    const r = readGraphml(
      'a.graphml',
      `<graphml><graph id="A"><node id="x"><graph id="in"><node id="y"/></graph></node></graph><graph id="B"><node id="z"/></graph></graphml>`,
    );
    assert.deepEqual(
      r.things.map(([id]) => id),
      ['x'],
    );
    assert.ok(r.dropped.some((d) => /graphs inside nodes/.test(d)));
    assert.ok(r.dropped.some((d) => /every graph after the first/.test(d)));
  });
});

describe('format_untrusted_files: a GraphML file past its limits', () => {
  test('more nodes than the limit, or more bytes, is refused whole', () => {
    const many = doc('<node id="n"/>'.repeat(GRAPHML_LIMITS.items + 1));
    assert.match(readGraphml('m.graphml', many).refused, /more than 50000 nodes and edges/);
    assert.match(readGraphml('m.graphml', ' '.repeat(GRAPHML_LIMITS.bytes + 1)).refused, /too large/);
  });
});
