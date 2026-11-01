// Parts of a layout worker's talk that need no worker (spec §9, layout_contained). One is a port served on the page's
// own thread, for where no worker can run. The other is the failure a layout gives when its worker or engine fails.
import type { LayoutPort, LayoutScope } from './layout-worker.ts';

/**
 * A layout that failed: its worker failed while laying out (`worker`), or its engine could not start (`start`). `why`
 * is the cause's own words, and `slow` marks an engine that took too long to start. Its message is for a developer; a
 * host says it from the catalogue by its stage (hosts/refusal-words.ts).
 */
export class LayoutFailure extends Error {
  readonly stage: 'worker' | 'start';
  readonly why: string;
  readonly slow: boolean;
  constructor(stage: 'worker' | 'start', why: string, slow = false) {
    super(stage === 'worker' ? `the layout worker failed: ${why}` : `the layout engine could not start: ${why}`);
    this.stage = stage;
    this.why = why;
    this.slow = slow;
    this.name = 'LayoutFailure';
  }
}

/** A port to a worker served on this thread, for where no worker can run: the same talk, with no time limit possible. */
export function inThreadPort(serve: (scope: LayoutScope) => void): LayoutPort {
  let open = true;
  const later = (run: () => void) => void Promise.resolve().then(() => open && run());
  const scope: LayoutScope = {
    onmessage: null,
    postMessage: (reply) => later(() => port.onmessage?.({ data: reply })),
  };
  const port: LayoutPort = {
    onmessage: null,
    onerror: null,
    postMessage: (request) => later(() => scope.onmessage?.({ data: request })),
    terminate: () => (open = false),
  };
  serve(scope);
  return port;
}
