// A model's key on a phone (editor spec ES§19, app_ai_key_keychain). The key is pasted into a row of the More view and
// handed straight to the app's Keychain port, under the model's key name. It is written nowhere else. Not to the
// vault, not to the AI setup this device keeps, and not to anything that syncs. The field is emptied once it is kept,
// and the row then says only whether a key is kept, never the key. The page never reads it back. The device writes it
// into a request to the model's address only. There a header names it by its mark (app-ai-host.ts, `keyMark`).
import { word } from '@thoughtknot/core';
import type { AiKeys } from './app-ai-host.ts';

/** The name a model's key is kept under: its own key name, or its name when it has none. */
export const keyNameOf = (m: { name: string; keyName: string }): string => m.keyName.trim() || m.name;

/**
 * The key's row for the model whose key is kept under `name`, for its `address` only. It has a field to paste it in, Keep
 * and Forget, and a line that says whether one is kept. `kept` is called with the name once a key is kept, so the model
 * can be told its key name.
 */
export function keyRow(
  doc: Document,
  keys: AiKeys,
  name: string,
  address: string,
  kept?: (name: string) => void,
): HTMLElement {
  const part = doc.createElement('div');
  part.className = 'gn-ai-key';
  const field = doc.createElement('input');
  field.type = 'password';
  field.autocomplete = 'off';
  field.spellcheck = false;
  field.setAttribute('aria-label', `${word('app.ai.key')}: ${name}`);
  field.placeholder = word('app.ai.key');
  const keep = Object.assign(doc.createElement('button'), { type: 'button', textContent: word('app.ai.key.keep') });
  const forget = Object.assign(doc.createElement('button'), { type: 'button', textContent: word('app.ai.key.forget') });
  const said = doc.createElement('p');
  said.className = 'gn-ai-quiet';
  said.setAttribute('role', 'status');
  const where = Object.assign(doc.createElement('p'), {
    className: 'gn-ai-quiet',
    textContent: word('app.ai.key.where'),
  });
  const tell = async () => {
    const has = await keys.has(name).catch(() => false);
    said.textContent = word(has ? 'app.ai.key.kept' : 'app.ai.key.none');
    forget.hidden = !has;
  };
  keep.addEventListener('click', () => {
    const key = field.value.trim();
    // the field is emptied first, so the key stays in the page no longer than the tap
    field.value = '';
    if (!key) return void (said.textContent = word('app.ai.key.empty'));
    void keys.set(name, key, address).then(
      () => {
        kept?.(name);
        return tell();
      },
      (e: unknown) =>
        (said.textContent = word('app.ai.key.failed', { why: e instanceof Error ? e.message : String(e) })),
    );
  });
  forget.addEventListener('click', () => void keys.forget(name).then(tell, tell));
  void tell();
  part.append(field, keep, forget, said, where);
  return part;
}
