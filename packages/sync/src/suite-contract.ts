// The contract a cipher suite is held to (editor spec ES§40, five_layer_stack; ES§43, layers_checked). A suite that hides
// nothing, or trusts what it opens, is refused. Host-free, and it needs no test framework: a check throws when broken.
import type { ContractCheck } from './contracts.ts';
import type { CipherSuite } from './suite.ts';

/** Names a suite may never have: each says that nothing is hidden. */
const NO_CIPHER = /^(none|null|plain|plaintext|identity|noop|nop|off|)$/i;

const secret = new TextEncoder().encode('the vault key is never in the clear');
const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

function fail(name: string, wanted: string, got: unknown): never {
  throw new Error(`${name}: wanted ${wanted}, got ${JSON.stringify(got)}`);
}

type Make<K> = () => CipherSuite<K> | Promise<CipherSuite<K>>;
/** A check body: a suite and one new key. */
type Run = <K>(c: CipherSuite<K>, key: K) => Promise<void>;

/** Whether `open` gave the bytes back, as opposed to refusing. */
const opens = <K>(c: CipherSuite<K>, key: K, sealed: Uint8Array, bound?: Uint8Array): Promise<boolean> =>
  c.open(key, sealed, bound).then(
    () => true,
    () => false,
  );

/** A check that is run on a suite from `make` with a new key. */
function on<K>(make: Make<K>, name: string, run: Run): ContractCheck {
  return {
    name,
    run: async () => {
      const c = await make();
      await run(c, await c.newKey());
    },
  };
}

async function roundTrips<K>(c: CipherSuite<K>, key: K): Promise<void> {
  for (const plain of [secret, bytes(), bytes(0), new Uint8Array(5000).fill(7)]) {
    const back = await c.open(key, await c.seal(key, plain));
    if (!same(back, plain)) fail('open', 'the bytes sealed', back.length);
  }
}

async function hidesPlain<K>(c: CipherSuite<K>, key: K): Promise<void> {
  const sealed = await c.seal(key, secret);
  if (new TextDecoder('latin1').decode(sealed).includes('never in the clear')) {
    fail('seal', 'the plain bytes hidden', 'found in the sealed bytes');
  }
  if (same(sealed, secret)) fail('seal', 'bytes unlike the plain bytes', 'the same bytes');
}

async function freshNonce<K>(c: CipherSuite<K>, key: K): Promise<void> {
  if (same(await c.seal(key, secret), await c.seal(key, secret))) {
    fail('seal', 'a fresh nonce for each seal', 'the same sealed bytes twice');
  }
}

async function refusesChanged<K>(c: CipherSuite<K>, key: K): Promise<void> {
  const sealed = await c.seal(key, secret);
  for (const at of [0, Math.floor(sealed.length / 2), sealed.length - 1]) {
    const changed = sealed.slice();
    changed[at] = changed[at]! ^ 1;
    if (await opens(c, key, changed)) fail('open', `a refusal when byte ${at} changed`, 'opened');
  }
}

async function refusesCut<K>(c: CipherSuite<K>, key: K): Promise<void> {
  const sealed = await c.seal(key, secret);
  for (const odd of [sealed.slice(0, sealed.length - 1), Uint8Array.from([...sealed, 0])]) {
    if (await opens(c, key, odd)) fail('open', 'a refusal for a message cut or extended', 'opened');
  }
}

async function holdsBound<K>(c: CipherSuite<K>, key: K): Promise<void> {
  const sealed = await c.seal(key, secret, bytes(1, 2, 3));
  const right = await c.open(key, sealed, bytes(1, 2, 3)).then(
    (b) => same(b, secret),
    () => false,
  );
  if (!right) fail('open', 'the bytes back with the same bound data', 'refused');
  if ((await opens(c, key, sealed, bytes(1, 2, 4))) || (await opens(c, key, sealed))) {
    fail('open', 'a refusal with other bound data', 'opened');
  }
}

/** The checks every cipher suite holds to. Together they refuse a suite that hides nothing, or that trusts what it opens. */
export function suiteContract<K>(make: Make<K>): ContractCheck[] {
  return [
    {
      name: 'the suite is named, and not as a way of hiding nothing',
      run: async () => {
        const id = (await make()).id;
        if (NO_CIPHER.test(id.trim())) fail('id', 'a name that says it seals', id);
      },
    },
    on(make, 'what is sealed opens to the same bytes, empty ones too', roundTrips),
    on(make, 'the sealed bytes do not hold the plain bytes', hidesPlain),
    on(make, 'sealing the same bytes twice gives different sealed bytes', freshNonce),
    {
      name: 'another key does not open it',
      run: async () => {
        const c = await make();
        const sealed = await c.seal(await c.newKey(), secret);
        if (await opens(c, await c.newKey(), sealed)) fail('open', 'a refusal with another key', 'opened');
      },
    },
    on(make, 'a changed byte, anywhere, is refused', refusesChanged),
    on(make, 'a cut or an extended message is refused', refusesCut),
    on(make, 'data the seal was bound to must be the same to open it', holdsBound),
    {
      name: 'two new keys differ',
      run: async () => {
        const c = await make();
        const [k1, k2] = [await c.newKey(), await c.newKey()];
        if (await opens(c, k2, await c.seal(k1, secret))) fail('newKey', 'keys that differ', 'one opens the other’s');
      },
    },
  ];
}
