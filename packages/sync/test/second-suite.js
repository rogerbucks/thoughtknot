// A second, real cipher suite for tests of swapping the cipher (editor spec ES§40, encrypted_everywhere).
/** A second, real suite: AES-CTR sealed, then HMAC-SHA-256 over nonce, ciphertext and bound data. */
export const ctrHmac = (() => {
  const subtle = globalThis.crypto.subtle;
  const join = (...p) => Uint8Array.from(p.flatMap((x) => [...x]));
  const split = async (raw) => ({
    enc: await subtle.importKey('raw', raw.slice(0, 16), 'AES-CTR', false, ['encrypt', 'decrypt']),
    mac: await subtle.importKey('raw', raw.slice(16), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  });
  const tag = async (k, iv, body, bound = new Uint8Array()) =>
    new Uint8Array(await subtle.sign('HMAC', k.mac, join(iv, body, bound, Uint8Array.of(bound.length))));
  return {
    id: 'aes-ctr-hmac',
    keyFrom: (raw) => split(raw),
    newKey: () => split(globalThis.crypto.getRandomValues(new Uint8Array(48))),
    async seal(k, plain, bound) {
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(16));
      const body = new Uint8Array(await subtle.encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, k.enc, plain));
      return join(iv, body, await tag(k, iv, body, bound));
    },
    async open(k, sealed, bound) {
      if (sealed.length < 48) throw new Error('too short');
      const [iv, body, got] = [sealed.slice(0, 16), sealed.slice(16, -32), sealed.slice(-32)];
      const want = await tag(k, iv, body, bound);
      if (!want.every((v, i) => v === got[i])) throw new Error('refused');
      return new Uint8Array(await subtle.decrypt({ name: 'AES-CTR', counter: iv, length: 64 }, k.enc, body));
    },
  };
})();
