// The contract of the transport point (editor spec ES§40, five_layer_stack). It is kept apart from the other points'
// contracts so no source file grows past its size. Its checks need no test framework.
import type { TransportBackend, TransportChannel } from './plugin-points.ts';
import type { StorageCheck } from './storage-contract.ts';
import { readsInHostDirection } from './plugins-contract.ts';

/** Fails a check with what was wanted and what the transport did. */
function fail(name: string, wanted: string, got: unknown): never {
  throw new Error(`${name}: wanted ${wanted}, got ${JSON.stringify(got)}`);
}

/** Waits for messages in flight: a hundred turns of the event loop. */
const turns = async (): Promise<void> => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
};

/** Opens a transport, listens at its test address, and dials the address it gave: the two ends of one channel. */
async function twoEnds(b: TransportBackend): Promise<[TransportChannel, TransportChannel, () => Promise<void>]> {
  const t = b.open();
  const listener = await t.listen(b.testAddress ?? 'loopback');
  const [dialled, accepted] = await Promise.all([t.dial(listener.address), listener.next()]);
  return [dialled, accepted, () => listener.stop()];
}

/**
 * Every check a transport is held to (ES§40, five_layer_stack). Messages are bytes it cannot read, so it must give back
 * each one whole and in order, both ways, and tell one end when the other closes.
 */
export function transportBackendContract(b: TransportBackend): StorageCheck[] {
  const title = readsInHostDirection(b.name, b.title);
  return [
    {
      name: 'a message arrives whole and byte for byte, in the order sent, both ways',
      run: async () => {
        const [a, c, stop] = await twoEnds(b);
        const atC: number[] = [];
        const atA: number[] = [];
        c.listen(
          (m) => atC.push(...m),
          () => {},
        );
        a.listen(
          (m) => atA.push(...m),
          () => {},
        );
        a.send(Uint8Array.from([1, 2, 3]));
        a.send(Uint8Array.from([255, 0]));
        c.send(Uint8Array.from([9]));
        await turns();
        if (atC.join() !== '1,2,3,255,0') fail(b.name, '1,2,3,255,0 at the listener', atC);
        if (atA.join() !== '9') fail(b.name, '9 at the dialler', atA);
        a.close();
        c.close();
        await stop();
      },
    },
    {
      name: 'closing one end tells the other end it is closed, and a send after that does not throw',
      run: async () => {
        const [a, c, stop] = await twoEnds(b);
        let closed = false;
        c.listen(
          () => {},
          () => (closed = true),
        );
        a.close();
        await turns();
        if (!closed) fail(b.name, 'the other end told it closed', closed);
        a.send(Uint8Array.from([1]));
        c.close();
        await stop();
      },
    },
    { name: title.name, run: async () => title.run() },
  ];
}
