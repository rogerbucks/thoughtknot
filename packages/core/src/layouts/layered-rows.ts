// The rows of our own engine's layered layout (editor spec §53, layout_layered), for layered.ts. It finds which row
// each thing goes in, and cuts a row far too long in more than one. Host-free and pure.
import type { Size } from './layered.ts';

/**
 * The shape a drawing is aimed at: this many across the rows to one along them. Very long rows, so a row is cut only
 * when far too long, since a cut row breaks the flow a reader follows.
 */
const ASPECT = 0.05;

/**
 * Each thing's row, by index. `out` is each thing's links, and is given back with the links that ran back turned round.
 */
export function rowsOf(n: number, out: number[][]): number[] {
  // turn round the links that run back: a link to a thing still being searched from is one
  const state = new Uint8Array(n);
  const forward: number[][] = out.map(() => []);
  const visit = (start: number) => {
    const stack: [number, number][] = [[start, 0]];
    state[start] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1] as [number, number];
      const [v, k] = top;
      const next = out[v] ?? [];
      if (k >= next.length) {
        state[v] = 2;
        stack.pop();
        continue;
      }
      top[1] = k + 1;
      const w = next[k] as number;
      if (state[w] === 1) (forward[w] as number[]).push(v);
      else {
        (forward[v] as number[]).push(w);
        if (state[w] === 0) {
          state[w] = 1;
          stack.push([w, 0]);
        }
      }
    }
  };
  const into = new Int32Array(n);
  for (const next of out) for (const w of next) into[w] = (into[w] as number) + 1;
  for (let v = 0; v < n; v++) if (!into[v] && !state[v]) visit(v);
  for (let v = 0; v < n; v++) if (!state[v]) visit(v);
  // longest path: each thing a row after the latest thing that links to it
  const indeg = new Int32Array(n);
  for (const next of forward) for (const w of next) indeg[w] = (indeg[w] as number) + 1;
  const row = new Int32Array(n);
  const queue: number[] = [];
  for (let v = 0; v < n; v++) if (!indeg[v]) queue.push(v);
  for (let h = 0; h < queue.length; h++) {
    const v = queue[h] as number;
    for (const w of forward[v] ?? []) {
      row[w] = Math.max(row[w] as number, (row[v] as number) + 1);
      indeg[w] = (indeg[w] as number) - 1;
      if (!indeg[w]) queue.push(w);
    }
  }
  // a start sits just before the nearest thing it links to, so its links do not run the length of the drawing
  const fed = new Uint8Array(n);
  for (const next of forward) for (const w of next) fed[w] = 1;
  for (let v = 0; v < n; v++) {
    const next = forward[v] ?? [];
    if (!fed[v] && next.length) row[v] = Math.min(...next.map((w) => row[w] as number)) - 1;
  }
  out.splice(0, out.length, ...forward);
  return Array.from(row);
}

/**
 * Rows too long for the drawing's shape, split into several, so a shallow graph is not one long strip. A drawing is
 * aimed at `ASPECT` wide to one high. Each long row is cut in order of where its things' sources sit, and the rows
 * after it move along.
 */
export function wrapped(
  rows: number[],
  links: readonly number[][],
  sizeOf: (i: number) => Size,
  across: number,
  gap: number,
  rowGap: number,
): number[] {
  const count = Math.max(...rows) + 1;
  let area = 0;
  const length = new Float64Array(count);
  rows.forEach((r, i) => {
    const s = sizeOf(i);
    area += (s[0] + gap) * (s[1] + rowGap);
    length[r] = (length[r] as number) + (s[across] as number) + gap;
  });
  // a row is cut only when far longer than the drawing is deep, whichever way the rows run
  const most = Math.sqrt(area / ASPECT);
  const parts = Array.from(length, (l) => Math.max(1, Math.ceil(l / most)));
  if (parts.every((p) => p === 1)) return rows;
  const firstSource = new Float64Array(rows.length).fill(Infinity);
  links.forEach((next, v) => {
    for (const w of next) firstSource[w] = Math.min(firstSource[w] as number, v);
  });
  const start = new Int32Array(count);
  for (let r = 1; r < count; r++) start[r] = (start[r - 1] as number) + (parts[r - 1] as number);
  const out = rows.slice();
  for (let r = 0; r < count; r++) {
    const members = rows.flatMap((row, i) => (row === r ? [i] : []));
    members.sort((p, q) => (firstSource[p] as number) - (firstSource[q] as number) || p - q);
    const each = Math.ceil(members.length / (parts[r] as number));
    members.forEach((i, k) => (out[i] = (start[r] as number) + Math.floor(k / each)));
  }
  return out;
}
