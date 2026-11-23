// AI set up on a phone (editor spec ES§19, app_ai_settings; ES§40, phone_more). It is a group of the More view, in
// grouped rows as a phone's settings are, each control a whole row of 44 or more (phone.css). From it the person:
// - turns AI on or off: it is off until they turn it on (ai_off_until_chosen);
// - says what a note with no classification counts as: the highest, until they change it (unclassified_strictest);
// - sets the ceiling of the phone's own model, where it has one, which is listed first (app_ai_on_device);
// - adds a model by its address, checked as every host checks one (ai_private_is_own): https, or http on the device;
// - marks a model private, a model they run, which its address must show, such as a Tailscale name; or public;
// - sets its ceiling and its purpose, keeps its key in the Keychain (app-ai-key.ts), and removes it;
// - tests it, while AI is on: its address is asked for its list of models, with its key, and no note is sent.
// What is set is kept on this device only, in the window's own storage, never the vault: never a key.
import { AI_PURPOSES, endpointProblem, modelsAddress, privateProblem, purposeWords, word } from '@thoughtknot/core';
import type { AiModel, WordKey } from '@thoughtknot/core';
import { keyMark } from './app-ai-host.ts';
import type { AiSetup, AppAi, SetupStore } from './app-ai-host.ts';
import { keyNameOf, keyRow } from './app-ai-key.ts';
import { recordSection } from './app-ai-record.ts';

/** The key the setup is kept under, in this device's storage. */
export const SETUP_KEY = 'thoughtknot.ai.setup';

/** The AI setup in `storage`, this device's own: never the vault's. A setup that cannot be read is none: AI off. */
export function deviceSetupStore(storage: Pick<Storage, 'getItem' | 'setItem'>): SetupStore {
  return {
    read: () => {
      try {
        const read = JSON.parse(storage.getItem(SETUP_KEY) ?? 'null') as AiSetup | null;
        return read && typeof read === 'object' && Array.isArray(read.aiModels) ? read : null;
      } catch {
        return null;
      }
    },
    write: (setup) => storage.setItem(SETUP_KEY, JSON.stringify(setup)),
  };
}

/** The ids of the models a list answer names, at most eight: the chat completions shape's `data[].id`. */
function modelNames(text: string): string[] {
  try {
    const data = (JSON.parse(text) as { data?: unknown }).data;
    if (!Array.isArray(data)) return [];
    return data
      .map((d) => (d && typeof d === 'object' ? (d as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === 'string')
      .slice(0, 8);
  } catch {
    return [];
  }
}

/**
 * Test on a model: its address asked once for its list of models, with its key, while AI is on. No note is sent. The
 * header names the key by its mark: the device writes the key in.
 */
export async function testModel(ai: AppAi, m: AiModel): Promise<string> {
  if (ai.settings().aiUse !== 'on') return word('app.ai.test.off');
  const problem = endpointProblem(m.endpoint);
  if (problem) return word('app.ai.test.said', { answer: word('models.test.refused', { why: problem }) });
  const address = modelsAddress(m.endpoint);
  const name = keyNameOf(m);
  const has = await ai.ports.keys.has(name).catch(() => false);
  let answer: string;
  try {
    const reply = await ai.ports.probe(address, has ? { Authorization: `Bearer ${keyMark(name)}` } : {});
    const names = reply.status >= 200 && reply.status < 300 ? modelNames(reply.text) : [];
    answer =
      reply.status < 200 || reply.status >= 300
        ? word('models.test.status', { address, status: reply.status })
        : names.length
          ? word('models.test.ok', { address, names: names.join(', ') })
          : word('models.test.ok-none', { address });
  } catch (e) {
    answer = word('models.test.failed', { address, why: e instanceof Error ? e.message : String(e) });
  }
  return word('app.ai.test.said', { answer });
}

const el = <K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, text?: string) => {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** A row: what it sets, in words, over its control. */
function row(doc: Document, words: string, control: HTMLElement, hint?: string): HTMLElement {
  const label = el(doc, 'label', 'gn-ai-row');
  label.append(el(doc, 'span', '', words), control);
  if (!hint) return label;
  const part = el(doc, 'div', 'gn-ai-row-group');
  part.append(label, el(doc, 'p', 'gn-ai-quiet', hint));
  return part;
}

/** A pick of `options`, each [value, words], on `now`; `changed` takes the value picked. */
function pick(
  doc: Document,
  options: readonly (readonly [string, string])[],
  now: string,
  changed: (value: string) => void,
): HTMLSelectElement {
  const select = doc.createElement('select');
  for (const [value, words] of options)
    select.append(Object.assign(doc.createElement('option'), { value, textContent: words }));
  select.value = now;
  select.addEventListener('change', () => changed(select.value));
  return select;
}

const button = (doc: Document, words: string, then: () => void): HTMLButtonElement => {
  const b = Object.assign(doc.createElement('button'), { type: 'button', textContent: words });
  b.addEventListener('click', then);
  return b;
};

/**
 * The AI group of the More view, for AI on this phone. Each change is kept at once, and the group is drawn afresh
 * from what is kept. `changed` is told, so the page can offer the board's AI box or take it away.
 */
export function aiSection(doc: Document, ai: AppAi, changed?: () => void): HTMLElement {
  const section = el(doc, 'section', 'gn-ai');
  section.setAttribute('aria-labelledby', 'gn-ai-title');
  const levels = ai.levels.map((l) => [l, l] as const);
  const save = (next: AiSetup) => {
    ai.save(next);
    draw();
    changed?.();
  };
  const said = el(doc, 'p', 'gn-ai-said');
  said.setAttribute('role', 'status');
  const draw = () => {
    const setup = ai.setup;
    const title = el(doc, 'h2', '', word('app.ai.title'));
    title.id = 'gn-ai-title';
    const parts: HTMLElement[] = [
      title,
      el(doc, 'p', 'gn-ai-quiet', word('app.ai.intro')),
      row(
        doc,
        word('app.ai.use'),
        pick(
          doc,
          [
            ['off', word('app.ai.off')],
            ['on', word('app.ai.on')],
          ],
          setup.aiUse,
          (v) => save({ ...ai.setup, aiUse: v === 'on' ? 'on' : 'off' }),
        ),
      ),
      row(
        doc,
        word('app.ai.unlabelled'),
        pick(doc, levels, ai.settings().aiUnlabelled, (v) => save({ ...ai.setup, aiUnlabelled: v })),
      ),
    ];
    const own = ai.onDevice;
    if (own)
      parts.push(
        onDeviceGroup(doc, own.model.name, own.model.ceiling, levels, (v) => save({ ...ai.setup, onDeviceCeiling: v })),
      );
    setup.aiModels.forEach((m, i) =>
      parts.push(modelGroup(doc, ai, m, levels, (next) => save(withModel(ai.setup, i, next)), said)),
    );
    parts.push(addGroup(doc, ai, save, said), said, recordSection(doc, ai.ports.record));
    section.replaceChildren(...parts);
  };
  draw();
  return section;
}

/** The setup with the model at `i` changed, or taken out when `next` is null. */
const withModel = (setup: AiSetup, i: number, next: AiModel | null): AiSetup => ({
  ...setup,
  aiModels: next ? setup.aiModels.map((m, j) => (j === i ? next : m)) : setup.aiModels.filter((_, j) => j !== i),
});

/** The phone's own model: listed first, private, with only its ceiling to set. */
function onDeviceGroup(
  doc: Document,
  name: string,
  ceiling: string,
  levels: readonly (readonly [string, string])[],
  set: (ceiling: string) => void,
): HTMLElement {
  const group = el(doc, 'fieldset', 'gn-ai-model gn-ai-on-device');
  group.append(
    el(doc, 'legend', '', name),
    el(doc, 'p', 'gn-ai-quiet', word('app.ai.on-device.said')),
    el(doc, 'p', 'gn-ai-reach', word('app.ai.reach.private')),
    row(doc, word('app.ai.ceiling'), pick(doc, levels, ceiling, set)),
  );
  return group;
}

/** One model the person added: whose it is, its ceiling and purpose, its key, Test and Remove. */
function modelGroup(
  doc: Document,
  ai: AppAi,
  m: AiModel,
  levels: readonly (readonly [string, string])[],
  set: (next: AiModel | null) => void,
  said: HTMLElement,
): HTMLElement {
  const group = el(doc, 'fieldset', 'gn-ai-model');
  const purposes = AI_PURPOSES.map((p) => [p, purposeWords(p)] as const);
  const reach = pick(
    doc,
    [
      ['private', word('app.ai.reach.private')],
      ['public', word('app.ai.reach.public')],
    ],
    m.reach === 'private' ? 'private' : 'public',
    (v) => {
      // a model is private only where its address shows it is one the person runs: on this device or their network
      const why = v === 'private' ? privateProblem(m.endpoint) : null;
      if (why) {
        reach.value = 'public';
        said.textContent = why;
        return;
      }
      const { reach: _was, ...rest } = m;
      set(v === 'private' ? { ...rest, reach: 'private' } : rest);
    },
  );
  const answer = el(doc, 'p', 'gn-ai-quiet');
  answer.setAttribute('role', 'status');
  const test = button(doc, word('app.ai.test', { name: m.name }), () => {
    answer.textContent = '';
    void testModel(ai, m).then((a) => (answer.textContent = a));
  });
  group.append(
    el(doc, 'legend', '', m.name),
    el(doc, 'p', 'gn-ai-quiet', word('app.ai.address', { address: m.endpoint })),
    row(
      doc,
      word('app.ai.reach'),
      reach,
      m.reach !== 'private'
        ? word('app.ai.reach.public-off')
        : /\.ts\.net(?:[:/]|$)/i.test(m.endpoint)
          ? word('app.ai.reach.funnel')
          : undefined,
    ),
    row(
      doc,
      word('app.ai.ceiling'),
      pick(doc, levels, m.ceiling, (v) => set({ ...m, ceiling: v })),
    ),
    row(
      doc,
      word('app.ai.purpose'),
      pick(doc, purposes, m.purpose, (v) => set({ ...m, purpose: v })),
    ),
    keyRow(doc, ai.ports.keys, keyNameOf(m), m.endpoint, (name) => m.keyName !== name && set({ ...m, keyName: name })),
    test,
    answer,
    button(doc, word('app.ai.remove', { name: m.name }), () => {
      void ai.ports.keys.forget(keyNameOf(m)).catch(() => undefined);
      set(null);
    }),
  );
  return group;
}

/** Adding a model by its address: its name, address and id, checked before it is kept. It starts public. */
function addGroup(doc: Document, ai: AppAi, save: (next: AiSetup) => void, said: HTMLElement): HTMLElement {
  const group = el(doc, 'fieldset', 'gn-ai-add');
  const field = (key: WordKey, type = 'text') => {
    const f = doc.createElement('input');
    f.type = type;
    f.autocomplete = 'off';
    f.spellcheck = false;
    f.setAttribute('autocapitalize', 'off');
    return [f, row(doc, word(key), f)] as const;
  };
  const [name, nameRow] = field('app.ai.add.name');
  const [address, addressRow] = field('app.ai.add.address', 'url');
  const [model, modelRow] = field('app.ai.add.model');
  const add = button(doc, word('app.ai.add'), () => {
    const setup = ai.setup;
    const given = { name: name.value.trim(), endpoint: address.value.trim(), model: model.value.trim() };
    const why = !given.name
      ? word('app.ai.add.no-name')
      : setup.aiModels.some((m) => m.name === given.name) || ai.isOnDevice(given.name)
        ? word('app.ai.add.taken', { name: given.name })
        : (endpointProblem(given.endpoint) ?? (!given.model ? word('app.ai.add.no-model') : null));
    if (why) return void (said.textContent = why);
    const added: AiModel = {
      ...given,
      purpose: AI_PURPOSES[1] ?? '',
      ceiling: ai.levels[0] ?? '',
      // no key until one is kept: a model the person runs may need none (app-ai-key.ts names it then)
      keyName: '',
    };
    save({ ...setup, aiModels: [...setup.aiModels, added] });
    said.textContent = word('app.ai.added', { name: given.name });
  });
  group.append(el(doc, 'legend', '', word('app.ai.add.title')), nameRow, addressRow, modelRow, add);
  return group;
}
