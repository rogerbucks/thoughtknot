// The contract of the identity point (editor spec ES§40, five_layer_stack; §45, board_access). It is kept apart from
// the other points' contracts so no source file grows past its size. Its checks need no test framework.
// An identity system says who uses a device and, if it likes, the most they may do at a board. It is given a device's
// public key alone, never a key that seals or a note's text. It only narrows what an invitation gives, never widens it.
import type { BoardRole } from './board-access.ts';
import type { IdentityBackend, SharingPerson, SyncIdentity } from './plugin-points.ts';
import type { StorageCheck } from './storage-contract.ts';
import { readsInHostDirection } from './plugins-contract.ts';

/** The longest id or name an identity system may give, in characters, as a board seat keeps it. */
const MOST_CHARS = 64;
const ROLES: readonly (BoardRole | null)[] = [null, 'view', 'comment', 'edit'];

/** Two public keys the contract asks about, in hexadecimal: a key's first byte 04, then made-up points. */
const DEVICES = [`04${'a1'.repeat(64)}`, `04${'5c'.repeat(64)}`] as const;

/** Fails a check with what was wanted and what the identity system did. */
function fail(name: string, wanted: string, got: unknown): never {
  throw new Error(`${name}: wanted ${wanted}, got ${JSON.stringify(got)}`);
}

/** Why a person an identity system gave cannot sit at a board, or null when they can. */
export function personProblem(p: unknown): string | null {
  const ok = (v: unknown) => typeof v === 'string' && v.trim() !== '' && [...v].length <= MOST_CHARS;
  if (!p || typeof p !== 'object') return 'a person with an id and a name';
  const { id, name } = p as Partial<SharingPerson>;
  if (!ok(id)) return `an id of 1 to ${MOST_CHARS} characters`;
  if (!ok(name)) return `a name of 1 to ${MOST_CHARS} characters`;
  // eslint-disable-next-line no-control-regex -- a control character is what this refuses
  if (/[\u0000-\u001f\u007f]/.test(`${id}${name}`)) return 'an id and a name with no control characters';
  return null;
}

/** The narrower of two roles: what an invitation gives, cut down to what the identity system allows. */
export function narrowerRole(a: BoardRole | null, b: BoardRole | null): BoardRole | null {
  return ROLES[Math.min(ROLES.indexOf(a), ROLES.indexOf(b))] ?? null;
}

/**
 * Who this device's person is, and the role they sit at a board with, when an identity system stands in. Checked at
 * every start: a person it cannot seat, or a role that is not one, stops sharing by name instead of running quietly.
 */
export async function identitySeat(
  identity: SyncIdentity,
  device: string,
  invited: BoardRole | null,
): Promise<{ who: SharingPerson; role: BoardRole | null }> {
  const who = await identity.who(device);
  const why = personProblem(who);
  if (why) fail('the identity system', why, who);
  const most = identity.most ? await identity.most(device) : 'edit';
  if (!ROLES.includes(most)) fail('the identity system', 'view, comment, edit or null', most);
  return { who: { id: who.id, name: who.name }, role: narrowerRole(invited, most) };
}

/**
 * Every check an identity system is held to (ES§40, five_layer_stack). It must name a person for each device, the same
 * one each time, and a different one for a different device. A role it gives must be a board role, or none.
 */
export function identityBackendContract(b: IdentityBackend): StorageCheck[] {
  const title = readsInHostDirection(b.name, b.title);
  return [
    {
      name: 'it names a person for a device: an id and a name of 1 to 64 characters, with no control characters',
      run: async () => {
        const who = await b.open().who(DEVICES[0]);
        const why = personProblem(who);
        if (why) fail(b.name, why, who);
      },
    },
    {
      name: 'the same device gives the same id each time, and another device another id',
      run: async () => {
        const identity = b.open();
        const [one, again, other] = await Promise.all([
          identity.who(DEVICES[0]),
          identity.who(DEVICES[0]),
          identity.who(DEVICES[1]),
        ]);
        if (one.id !== again.id) fail(b.name, 'the same id for the same device', [one.id, again.id]);
        if (one.id === other.id) fail(b.name, 'another id for another device', [one.id, other.id]);
      },
    },
    {
      name: 'the most a person may do, when it says, is view, comment, edit or nothing',
      run: async () => {
        const identity = b.open();
        if (!identity.most) return;
        for (const device of DEVICES) {
          const most = await identity.most(device);
          if (!ROLES.includes(most)) fail(b.name, 'view, comment, edit or null', most);
        }
      },
    },
    { name: title.name, run: async () => title.run() },
  ];
}
