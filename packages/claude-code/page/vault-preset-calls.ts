// The page's calls on the vault's view preset (editor spec ES§69, view_presets_scoped, view_presets_portable). They are
// the only settings the page changes. The page names a starter by its id and never a path or a file's text. The server
// writes the file itself (server/vault-preset-api.ts). The token is the one the page holds, passed in.
import { vaultChoice, word } from '@thoughtknot/core';
import { whyOf } from '../src/api-types.ts';

/** What a write came to: the starter the vault now names, or why nothing was written. */
export type PresetWritten = { ok: true; id: string | null } | { ok: false; why: string };

/** The page's vault preset calls, with `token` held in them. */
export function vaultPresetCalls(token: string, fetcher: typeof fetch) {
  const authorization = `Bearer ${token}`;
  return {
    /** The preset the vault names, a starter's or its own, or null for none. A vault that cannot be asked has none. */
    read: async (): Promise<string | null> => {
      const reply = await fetcher(`/api/vault-preset`, { headers: { authorization } }).catch(() => null);
      if (!reply?.ok) return null;
      const body = (await reply.json().catch(() => null)) as { id?: unknown; file?: unknown } | null;
      // the page reads the file itself, as it reads any untrusted one, and takes the id from that
      if (typeof body?.file === 'string') return vaultChoice(body.file) ?? null;
      vaultChoice(undefined);
      return typeof body?.id === 'string' && !body.id.startsWith('vault:') ? body.id : null;
    },
    /** Makes starter `id` the vault's preset, or with null gives the vault none; never rejects. */
    write: async (id: string | null): Promise<PresetWritten> => {
      try {
        const reply = await fetcher(`/api/vault-preset`, {
          method: 'PUT',
          headers: { authorization, 'content-type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        if (reply.ok) return { ok: true, id };
        const body = (await reply.json().catch(() => null)) as unknown;
        return { ok: false, why: whyOf(body) ?? word('page.write-refused', { status: reply.status }) };
      } catch (e) {
        return { ok: false, why: word('page.preset-not-sent', { why: e instanceof Error ? e.message : String(e) }) };
      }
    },
  };
}
