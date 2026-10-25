// The 3D view's names are edged in the colour behind the view (editor spec §53, space_phone_readable):
// space-canvas-painter.ts. The system's page colour can differ from the theme's. A phone in light mode under a dark
// theme painted white names on white edges (Roger, 25 Oct 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backgroundOf } from '../src/display/graph-view/space-canvas-painter.ts';

/** A chain of elements, innermost first, each painted the background given, in a window that reports them. */
function chain(...backgrounds) {
  const styles = new Map();
  const win = { getComputedStyle: (el) => ({ backgroundColor: styles.get(el) }) };
  let parent = null;
  for (const b of [...backgrounds].reverse()) {
    const el = { parentElement: parent, ownerDocument: { defaultView: win } };
    styles.set(el, b);
    parent = el;
  }
  return parent;
}

// proves: space_phone_readable
test('the names are edged in the first colour painted behind the view, and in the system page colour only when none is', () => {
  assert.equal(backgroundOf(chain('rgb(30, 30, 30)', 'rgb(255, 255, 255)')), 'rgb(30, 30, 30)', 'its own');
  assert.equal(
    backgroundOf(chain('rgba(0, 0, 0, 0)', 'transparent', 'rgb(20, 20, 20)', 'rgb(255, 255, 255)')),
    'rgb(20, 20, 20)',
    'the theme behind it, not the white system page further out',
  );
  assert.equal(backgroundOf(chain('rgb(0 0 0 / 0)', 'rgba(10, 10, 10, 0.5)')), 'rgba(10, 10, 10, 0.5)');
  assert.equal(backgroundOf(chain('transparent', '')), 'Canvas', 'nothing painted: the system page colour');
});
