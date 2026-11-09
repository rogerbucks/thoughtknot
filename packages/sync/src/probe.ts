// What this machine offers for each swappable part (editor spec ES§40, five_layer_stack). Roger, 9 Nov 2026: swap any part for
// a system the person already has, and never silently. A host finds what is there and hands it in as `Found`. Each thing
// found becomes an offer, said in plain words. Nothing is chosen until the person accepts that offer. The place in use
// now is never removed: an offer adds a place, and the old one stays. Host-free, so each host runs it the same way.

/** The parts a machine can offer a system for. */
export type OfferedPart = 'keeper' | 'syncstore' | 'transport';

/** What a host found on this machine. Every field is optional: a host reports only what it looked for. */
export interface Found {
  /** The name of the machine's keychain, such as `macOS Keychain`. */
  keychain?: string;
  /** Folders that something else already syncs, such as iCloud Drive or Dropbox, by name and path. */
  syncedFolders?: readonly { name: string; path: string }[];
  /** Private addresses of a VPN this device is on, by the VPN's name. */
  vpns?: readonly { name: string; address: string }[];
}

/** One thing this machine could be used for. */
export interface Offer {
  /** Stable, so a choice can be kept: the part and what was found. */
  id: string;
  part: OfferedPart;
  /** In plain words, what the person would get. */
  says: string;
  /** What is found, for the host to wire in once the person accepts. */
  detail: string;
}

/** The offers for what was found, each for a person to accept or leave. Nothing found, nothing offered. */
export function offers(found: Found): Offer[] {
  const out: Offer[] = [];
  if (found.keychain) {
    out.push({
      id: `keeper:${found.keychain}`,
      part: 'keeper',
      says: `Keep this device's keys in ${found.keychain}. The keys now kept stay where they are.`,
      detail: found.keychain,
    });
  }
  for (const f of found.syncedFolders ?? []) {
    out.push({
      id: `syncstore:${f.path}`,
      part: 'syncstore',
      says: `Keep the sealed records in ${f.name}, which already syncs. The records now kept stay where they are.`,
      detail: f.path,
    });
  }
  for (const v of found.vpns ?? []) {
    out.push({
      id: `transport:${v.address}`,
      part: 'transport',
      says: `Reach your other devices over ${v.name} at ${v.address}.`,
      detail: v.address,
    });
  }
  return out;
}

/** The offers the person accepted. With nothing accepted, nothing is returned: no offer is taken for them. */
export function accepted(all: readonly Offer[], ids: ReadonlySet<string>): Offer[] {
  return all.filter((o) => ids.has(o.id));
}
