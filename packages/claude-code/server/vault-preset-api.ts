// The vault's view preset (editor spec ES§69, view_presets_scoped, view_presets_portable). It is the one thing the
// browser editor's page may write, besides an export. Everything else the page is told stays read only
// (cc_settings_shared).
//   GET vault-preset   {id}: the starter the vault's preset file names, or null when it has none.
//   PUT vault-preset   {id} makes that starter the vault's preset; {id: null} gives the vault none.
// The file name is the server's own and never comes from the page. It sits at the vault's top. The page sends a
// starter's id and nothing else. The server writes the file itself from the core's starters. So no text of the page's
// is ever written. A link is never read or written through. The write is a new file renamed over the old.
import { word } from '@thoughtknot/core';
import { VAULT_PRESET_PLACE, vaultPresetFile, vaultPresetId } from '@thoughtknot/core';
import { constants, promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { ApiAnswer, ApiHandler, ApiRequest } from './start-server.ts';

const codeOf = (e: unknown): string => (e && typeof e === 'object' && 'code' in e ? String(e.code) : '');
const plain = (status: number, text: string): ApiAnswer => ({ status, text });
const json = (body: object): ApiAnswer => ({
  status: 200,
  text: JSON.stringify(body),
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

/** What lies at the preset's place: nothing, a plain file, or something the server will not touch. */
async function found(path: string): Promise<'none' | 'file' | 'other'> {
  try {
    const stat = await fs.lstat(path);
    return stat.isFile() && !stat.isSymbolicLink() ? 'file' : 'other';
  } catch (e) {
    if (codeOf(e) === 'ENOENT') return 'none';
    throw e;
  }
}

/** Answers the vault preset calls for the vault at `vault`, its real path. */
export class VaultPresetApi {
  private readonly place: string;

  constructor(vault: string) {
    this.place = join(vault, VAULT_PRESET_PLACE);
  }

  /** Answers a vault preset call, or null when the path is not one. */
  readonly handle = async (r: ApiRequest): Promise<ApiAnswer | null> => {
    if (r.path !== 'vault-preset') return null;
    try {
      return r.method === 'GET' ? await this.read() : await this.write(r.body);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      return plain(500, word('server.vault-preset.not-written', { why }));
    }
  };

  private async read(): Promise<ApiAnswer> {
    if ((await found(this.place)) !== 'file') return json({ id: null });
    const handle = await fs.open(this.place, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      return json({ id: vaultPresetId(await handle.readFile('utf8')) ?? null });
    } finally {
      await handle.close();
    }
  }

  private async write(body: string): Promise<ApiAnswer> {
    let given: unknown;
    try {
      given = JSON.parse(body);
    } catch {
      return plain(400, word('server.vault-preset.not-json'));
    }
    const id = given && typeof given === 'object' ? (given as { id?: unknown }).id : undefined;
    if (id !== null && (typeof id !== 'string' || vaultPresetId(vaultPresetFile(id)) !== id))
      return plain(400, word('server.vault-preset.bad-id'));
    const at = await found(this.place);
    if (at === 'other') return plain(403, word('server.vault-preset.link'));
    if (id === null) {
      if (at === 'file') await fs.unlink(this.place);
      return json({ id: null });
    }
    const temporary = `${this.place}.${process.pid}-${Date.now()}.tmp`;
    const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
    try {
      const handle = await fs.open(temporary, flags, 0o644);
      try {
        await handle.writeFile(vaultPresetFile(id), 'utf8');
      } finally {
        await handle.close();
      }
      await fs.rename(temporary, this.place);
    } catch (e) {
      await fs.unlink(temporary).catch(() => {});
      throw e;
    }
    return json({ id });
  }
}

/** `inner`, with the vault preset's route answered here. */
export function withVaultPreset(preset: VaultPresetApi, inner: ApiHandler | undefined): ApiHandler {
  return async (request) =>
    (await preset.handle(request)) ?? (inner ? inner(request) : { status: 404, text: word('server.not-found') });
}
