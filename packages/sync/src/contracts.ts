// The contracts a swapped part of sync is held to (editor spec ES§40, five_layer_stack; ES§43, layers_checked). A
// record store, a channel between devices and a keeper of keys each have one contract. Any build that passes it can
// stand in for another, so a person can bring a system they already have. Each check needs no test framework. It throws
// when the part breaks the promise, so a part's tests run the checks with whatever runner they have. Host-free.
import type { Channel } from './peer.ts';
import type { Keeper, Kept } from './sharing.ts';
import type { Shelf, Store } from './store.ts';

/** One check of a contract: what it holds a part to, and the run that throws when the part breaks it. */
export interface ContractCheck {
  name: string;
  run: () => Promise<void>;
}

function fail(name: string, wanted: string, got: unknown): never {
  throw new Error(`${name}: wanted ${wanted}, got ${JSON.stringify(got)}`);
}

const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const sameList = (a: readonly Uint8Array[], b: readonly Uint8Array[]): boolean =>
  a.length === b.length && a.every((r, i) => same(r, b[i]!));
const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 20));

/** The checks every record store holds to, each run on a fresh, empty store from `make`. */
export function storeContract(make: () => Store | Promise<Store>): ContractCheck[] {
  return [
    {
      name: 'an empty store holds no record',
      run: async () => {
        const s = await make();
        const got = await s.records('n');
        if (got.length) fail('records', 'none', got.length);
      },
    },
    {
      name: 'records read back byte for byte, each device’s file in the order written',
      run: async () => {
        const s = await make();
        const written = [bytes(1, 2, 3), bytes(), bytes(255, 0, 7), bytes(9)];
        for (const r of written) await s.add('n', 'a', r);
        const got = await s.records('n');
        if (!sameList(got, written))
          fail(
            'records',
            JSON.stringify(written.map((r) => [...r])),
            got.map((r) => [...r]),
          );
      },
    },
    {
      name: 'the records of every device are read, and a note keeps to its own',
      run: async () => {
        const s = await make();
        await s.add('n', 'a', bytes(1));
        await s.add('n', 'b', bytes(2));
        await s.add('other', 'a', bytes(3));
        const got = (await s.records('n')).map((r) => r[0]).sort();
        if (got.join() !== '1,2') fail('records', 'the two records of n', got);
      },
    },
    {
      name: 'a record handed in is copied, so changing it later changes nothing kept',
      run: async () => {
        const s = await make();
        const r = bytes(5, 5);
        await s.add('n', 'a', r);
        r[0] = 99;
        const got = await s.records('n');
        if (got[0]?.[0] !== 5) fail('records', 'the record as it was added', [...(got[0] ?? [])]);
      },
    },
  ];
}

/** The checks a store holds to when it can also say what it holds file by file, so two devices can send what one lacks. */
export function shelfContract(make: () => (Store & Shelf) | Promise<Store & Shelf>): ContractCheck[] {
  return [
    {
      name: 'an empty store holds no file',
      run: async () => {
        const s = await make();
        if ((await s.held()).size) fail('held', 'nothing', [...(await s.held()).keys()]);
      },
    },
    {
      name: 'held counts the records of each device’s file for each note',
      run: async () => {
        const s = await make();
        await s.add('n', 'a', bytes(1));
        await s.add('n', 'a', bytes(2));
        await s.add('n', 'b', bytes(3));
        const held = await s.held();
        if (held.get('n')?.get('a') !== 2 || held.get('n')?.get('b') !== 1)
          fail('held', 'a: 2, b: 1', [...(held.get('n') ?? [])]);
      },
    },
    {
      name: 'recordsOf gives a device’s records from a place on, and none past the end',
      run: async () => {
        const s = await make();
        for (const n of [1, 2, 3]) await s.add('n', 'a', bytes(n));
        const tail = await s.recordsOf('n', 'a', 1);
        if (tail.map((r) => r[0]).join() !== '2,3')
          fail(
            'recordsOf',
            '2,3',
            tail.map((r) => r[0]),
          );
        if ((await s.recordsOf('n', 'a', 3)).length) fail('recordsOf', 'none past the end', 'some');
        if ((await s.recordsOf('n', 'nobody', 0)).length) fail('recordsOf', 'none for an unknown device', 'some');
      },
    },
    {
      name: 'copyIn adds records to the end of a device’s file, after those already there',
      run: async () => {
        const s = await make();
        await s.add('n', 'a', bytes(1));
        await s.copyIn('n', 'a', [bytes(2), bytes(3)]);
        const mine = await s.recordsOf('n', 'a', 0);
        if (mine.map((r) => r[0]).join() !== '1,2,3')
          fail(
            'copyIn',
            '1,2,3',
            mine.map((r) => r[0]),
          );
        if ((await s.records('n')).length !== 3) fail('records', 'all three', 'other');
      },
    },
    {
      name: 'two copies in at once lose no record',
      run: async () => {
        const s = await make();
        await Promise.all([
          s.copyIn('n', 'a', [bytes(1)]),
          s.copyIn('n', 'a', [bytes(2)]),
          s.copyIn('n', 'a', [bytes(3)]),
        ]);
        const got = (await s.records('n')).map((r) => r[0]).sort();
        if (got.join() !== '1,2,3') fail('copyIn', 'all three records', got);
      },
    },
  ];
}

/** The checks every channel between devices holds to. `make` gives two ends of one channel. */
export function channelContract(make: () => [Channel, Channel] | Promise<[Channel, Channel]>): ContractCheck[] {
  return [
    {
      name: 'a message arrives whole and byte for byte',
      run: async () => {
        const [a, b] = await make();
        const heard: Uint8Array[] = [];
        b.listen(
          (m) => heard.push(m),
          () => {},
        );
        a.send(bytes(1, 2, 3));
        await flush();
        if (heard.length !== 1 || !same(heard[0]!, bytes(1, 2, 3)))
          fail(
            'send',
            'one message, 1,2,3',
            heard.map((m) => [...m]),
          );
        a.close();
        b.close();
      },
    },
    {
      name: 'messages arrive in the order sent, none run together',
      run: async () => {
        const [a, b] = await make();
        const heard: number[] = [];
        b.listen(
          (m) => heard.push(m.length),
          () => {},
        );
        for (const n of [1, 5, 2, 9]) a.send(new Uint8Array(n));
        await flush();
        if (heard.join() !== '1,5,2,9') fail('order', '1,5,2,9', heard);
        a.close();
        b.close();
      },
    },
    {
      name: 'both ends can send',
      run: async () => {
        const [a, b] = await make();
        const atA: number[] = [];
        const atB: number[] = [];
        a.listen(
          (m) => atA.push(m[0]!),
          () => {},
        );
        b.listen(
          (m) => atB.push(m[0]!),
          () => {},
        );
        a.send(bytes(1));
        b.send(bytes(2));
        await flush();
        if (atA.join() !== '2' || atB.join() !== '1') fail('both ways', 'A hears 2, B hears 1', [atA, atB]);
        a.close();
        b.close();
      },
    },
    {
      name: 'closing one end tells the other end it is closed',
      run: async () => {
        const [a, b] = await make();
        let closed = false;
        b.listen(
          () => {},
          () => (closed = true),
        );
        a.close();
        await flush();
        if (!closed) fail('close', 'the other end told it closed', closed);
        b.close();
      },
    },
    {
      name: 'a send after the channel is closed does not throw',
      run: async () => {
        const [a, b] = await make();
        a.listen(
          () => {},
          () => {},
        );
        a.close();
        a.send(bytes(1));
        await flush();
        b.close();
      },
    },
  ];
}

const keptFor = (n: number): Kept => ({
  pair: { n } as unknown as CryptoKeyPair,
  sealed: bytes(n),
  trusted: [`k${n}`],
});

/** The checks every keeper of keys holds to, each run on a fresh keeper from `make`. */
export function keeperContract(make: () => Keeper | Promise<Keeper>): ContractCheck[] {
  return [
    {
      name: 'a new keeper holds nothing',
      run: async () => {
        const got = await (await make()).load();
        if (got !== null) fail('load', 'null', got);
      },
    },
    {
      name: 'what is kept comes back, with its sealed vault key and who is trusted',
      run: async () => {
        const k = await make();
        await k.save(keptFor(1));
        const got = await k.load();
        if (!got?.sealed || !same(got.sealed, bytes(1)) || got.trusted.join() !== 'k1')
          fail('load', 'what was saved', got);
      },
    },
    {
      name: 'a second save replaces the first',
      run: async () => {
        const k = await make();
        await k.save(keptFor(1));
        await k.save(keptFor(2));
        const got = await k.load();
        if (got?.trusted.join() !== 'k2') fail('load', 'the second save', got);
      },
    },
    {
      name: 'the link and the invitation kept come back too',
      run: async () => {
        const k = await make();
        await k.save({
          ...keptFor(1),
          link: { listen: '100.64.0.1:1', dial: '100.64.0.2:1' },
          joined: { board: 'Plan', as: 'edit', from: 'ab' },
        });
        const got = await k.load();
        if (got?.link?.dial !== '100.64.0.2:1' || got.joined?.board !== 'Plan')
          fail('load', 'link and invitation', got);
      },
    },
  ];
}
