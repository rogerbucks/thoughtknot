// The small helpers the Share panel's screens use (editor spec §45, board_access).
import { fingerprint, fromHex } from '@thoughtknot/sync/sharing';

export const make = <K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: Record<string, unknown> = {},
) => Object.assign(doc.createElement(tag), props);

/** The fingerprint of a public key written in hexadecimal. */
export const printOf = async (hex: string): Promise<string> => fingerprint(fromHex(hex) ?? new Uint8Array());
