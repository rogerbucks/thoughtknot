// The drawing's SVG, cleaned before it is shown (TRUST-7, security_fix_rule). An SVG may hold a script, an event
// attribute, a foreignObject or a link out of the drawing. It is drawn without them. A clean one is left as it was.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanSvg } from '../src/svg-allowlist.ts';
import { readNote } from '../src/drawing.ts';
import { draw } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';

// Read once, a long drawing is cleaned too quickly to notice. Read square, it took minutes (js/polynomial-redos).
const LIMIT = { timeout: 10_000 };
const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`;

describe('a drawing’s SVG', () => {
  test('is left byte for byte as it was when it is clean', () => {
    const clean = svg(
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>' +
        '<g class="node" id="n1" data-key="a" role="button" tabindex="0" aria-label="A &amp; B">' +
        '<title>A &lt; B</title><rect x="0" y="0" width="5" height="5" fill="url(#g)" style="stroke: #000"/>' +
        '<text x="1" y="4" text-anchor="middle">A &amp; B</text><use href="#n1"/></g>',
    );
    assert.equal(cleanSvg(clean), clean);
  });

  test('loses a script, a foreignObject and any element not on the allowlist, with all they hold', () => {
    const got = cleanSvg(
      svg(
        '<script>alert(1)</script><SCRIPT>alert(2)</SCRIPT><foreignObject><div><g/></div></foreignObject>' +
          '<iframe src="x"></iframe><svg:script>alert(3)</svg:script><g><rect/></g>',
      ),
    );
    assert.equal(got, svg('<g><rect/></g>'));
  });

  test('loses every event attribute, and a link that leaves the drawing', () => {
    const got = cleanSvg(
      svg(
        '<rect onload="alert(1)" ONCLICK="x" width="1"/><a href="javascript:alert(1)"><text>a</text></a>' +
          '<a xlink:href="https://example.com/x"><text>b</text></a><a href="#n1"><text>c</text></a>' +
          '<image href="https://example.com/p.png"/><image href="data:image/svg+xml;base64,PHN2Zz4="/>' +
          '<image href="data:image/png;base64,iVBORw0KGgo="/>',
      ),
    );
    assert.doesNotMatch(got, /on\w+=|javascript:|example\.com|svg\+xml/i);
    assert.match(got, /<rect width="1"\/>/);
    assert.match(got, /<a href="#n1"><text>c<\/text><\/a>/);
    assert.match(got, /<image href="data:image\/png;base64,iVBORw0KGgo="\/>/);
  });

  test('loses a url() or a style sheet that reaches outside, and an animation that sets a link', () => {
    const got = cleanSvg(
      svg(
        '<style>@import url(https://example.com/a.css); rect { fill: red }</style><style>rect { fill: url(#g) }</style>' +
          '<rect fill="url(https://example.com/x)" style="background: url(x.png)" width="2"/>' +
          '<a href="#n"><set attributeName="href" to="javascript:alert(1)"/><animate attributeName="opacity" to="1"/></a>',
      ),
    );
    assert.doesNotMatch(got, /example\.com|x\.png|javascript:|attributeName="href"/);
    assert.match(got, /<style><\/style><style>rect \{ fill: url\(#g\) \}<\/style>/);
    assert.match(got, /<rect width="2"\/>/);
    assert.match(got, /<animate attributeName="opacity" to="1"\/>/);
  });

  test('loses comments, a doctype with its entities, processing instructions and a foreign namespace', () => {
    const got = cleanSvg(
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><!-- note -->' +
        svg('<g xmlns="http://www.w3.org/1999/xhtml"><text>&amp;</text></g><text>a < b</text>'),
    );
    assert.equal(got, svg('<g><text>&amp;</text></g><text>a &lt; b</text>'));
  });

  test('is cleaned in time that grows with its length, whatever runs of spaces or tags it holds', LIMIT, () => {
    // a pattern tried at every place took time growing with the square of a run of spaces (CodeQL js/polynomial-redos)
    const many = 100_000;
    cleanSvg(svg(`<rect${'\t'.repeat(many)}`));
    cleanSvg(svg(`<rect${' x="1"'.repeat(many / 8)}${'\t'.repeat(many)}/>`));
    cleanSvg(svg('<g>'.repeat(many / 4)));
    // tags that never close, each starting another (the shapes CodeQL named)
    for (const run of ['<A\t', '\t<A\t', '<A\t!=""\t', '<A\t!="', "<A\t!='", '<!x'])
      cleanSvg(`<A${run.repeat(many / run.length)}`);
    assert.equal(cleanSvg(svg('<rect \t x="1"\t\ty="2" />')), svg('<rect \t x="1"\t\ty="2"/>'));
    assert.equal(cleanSvg('<a <b x="1">'), '&lt;a ', 'text that is not a tag is escaped');
    assert.equal(cleanSvg('<rect x="1 <script>'), '&lt;rect x="1 &lt;script>', 'a value left open holds no tag');
  });
});

test('every drawing the engine makes of the repository’s own graphs passes through unchanged', async () => {
  const engine = await loadEngine();
  let drawn = 0;
  for (const file of ['requirements/ethos.gql', 'requirements/architecture.gql']) {
    const text = readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');
    for (const d of readNote([text]).graphs.values()) {
      const { svg } = draw(d, engine);
      assert.equal(cleanSvg(svg), svg, file);
      drawn += 1;
    }
  }
  assert.ok(drawn >= 2, 'the control: graphs were drawn');
});

test('both places a drawing enters a page pass it through the allowlist: the live page and Claude’s pane', () => {
  const source = (file) => readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');
  assert.match(source('packages/core/src/display/graph-view/drawing-svg.ts'), /const clean = cleanSvg\(drawn\.svg\);/);
  assert.match(source('packages/claude-code/mod/hooks/register.tsx'), /<Svg source=\{cleanSvg\(shown\.svg\)\}/);
});
