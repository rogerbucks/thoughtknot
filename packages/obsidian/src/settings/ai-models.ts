// The AI models on the settings page (spec §21, settings_ai_models; §19): a list with a page for each model. It holds
// its name, address (with whether it is private, and a test), model, key, purpose and ceiling. The key is chosen in the
// app's own secret store, by name. So it never reaches the vault: the plugin's saved settings hold only that name.
import { SecretComponent } from 'obsidian';
import type { App, SettingDefinition, SettingDefinitionItem, SettingDefinitionList, SettingTab } from 'obsidian';
import {
  AI_PURPOSES,
  aiModel,
  endpointProblem,
  formatSeries,
  isPrivate,
  privateProblem,
  purposeWords,
  word,
} from '@thoughtknot/core';
import type { AiModel, MatrixRow, Settings } from '@thoughtknot/core';
import { AI_PRESETS } from './ai-presets';
import { showTest } from './ai-check';
import { matrixControls, switchIsOn, switchedClass, withSwitch } from './ai-matrix-controls';
import type ThoughtKnotPlugin from '../main';

/** A text field of a model's page, with its name, sentence and the hint shown while it is empty. */
const text = (i: number, field: keyof AiModel, name: string, desc = '', placeholder = '') => ({
  name,
  ...(desc ? { desc } : {}),
  control: { type: 'text' as const, key: `aiModels.${i}.${field}`, ...(placeholder ? { placeholder } : {}) },
});

/** The models, each a page of its own, with an affordance to add one and to remove each. */
export function aiModelList(
  app: App,
  owner: ThoughtKnotPlugin,
  tab: SettingTab,
  matrix: MatrixRow[],
): SettingDefinitionList {
  const s = owner.settings;
  const save = async (aiModels: AiModel[]) => {
    await owner.saveSettings({ ...owner.settings, aiModels });
    tab.update();
  };
  return {
    type: 'list',
    emptyState: word('models.none'),
    items: s.aiModels.map((m, i) => ({
      type: 'page',
      name: word('models.page', { n: i + 1 }),
      desc: [
        m.name
          ? word('models.said', {
              name: m.name,
              purpose: purposeWords(m.purpose) || word('models.no-purpose'),
              ceiling: m.ceiling,
            })
          : word('models.unnamed'),
        // where it goes, and whether it is private, read at a glance without opening its page
        ...(m.endpoint.trim()
          ? [`${m.endpoint.trim()} (${word(isPrivate(m) ? 'models.reach.private' : 'models.reach.public')})`]
          : []),
        // a ceiling no longer among the classifications is kept as written, and said, until it is chosen again
        ...(s.classifications.includes(m.ceiling) ? [] : [word('models.ceiling-gone', { ceiling: m.ceiling })]),
        // an address set but not usable is said, so a model that will never be offered says why (user_models)
        ...(m.endpoint.trim() ? [endpointProblem(m.endpoint) ?? ''].filter(Boolean) : []),
        ...(m.matrixRow ? [word('models.held', { row: m.matrixRow })] : []),
        // a model marked private at an address that is not the user's own is said, and treated as public
        ...(m.reach === 'private' && m.endpoint.trim() ? [privateProblem(m.endpoint) ?? ''].filter(Boolean) : []),
      ].join('. '),
      items: [
        {
          type: 'group',
          items: [...modelItems(app, owner, m, i, matrix, save)],
        },
      ],
    })),
    onDelete: (i) => void save(owner.settings.aiModels.filter((_, j) => j !== i)),
    addItem: {
      name: word('models.add'),
      action: () => void save([...owner.settings.aiModels, aiModel({}, owner.settings.classifications)]),
    },
  };
}

/** A model's page: the address first, with whether it is private and a test beside it; then its model, key and limits. */
function modelItems(
  app: App,
  owner: ThoughtKnotPlugin,
  m: AiModel,
  i: number,
  matrix: MatrixRow[],
  save: (aiModels: AiModel[]) => Promise<void>,
): SettingDefinition[] {
  const s = owner.settings;
  return [
    text(i, 'name', word('models.name')),
    text(i, 'endpoint', word('models.endpoint'), word('models.endpoint.sentence'), word('models.endpoint.placeholder')),
    {
      name: word('models.private'),
      desc: word('models.private.sentence'),
      control: { type: 'toggle' as const, key: `aiModels.${i}.reach` },
    },
    text(i, 'model', word('models.model'), word('models.model.sentence')),
    {
      name: word('models.key'),
      desc: word('models.key.sentence'),
      render: (setting) => {
        new SecretComponent(app, setting.controlEl)
          .setValue(m.keyName)
          .onChange((name) => void save(changed(owner.settings, i, { keyName: name ?? undefined })));
      },
    },
    {
      name: word('models.test'),
      desc: word('models.test.sentence'),
      action: () => {
        const now = owner.settings.aiModels[i];
        if (now) void showTest(now, now.keyName ? owner.app.secretStorage.getSecret(now.keyName) : null);
      },
    },
    text(
      i,
      'purpose',
      word('models.purpose'),
      word('models.purpose.sentence', { purposes: formatSeries(AI_PURPOSES.map(purposeWords)) }),
    ),
    {
      name: word('models.ceiling'),
      desc: word('models.ceiling.sentence'),
      control: {
        type: 'dropdown' as const,
        key: `aiModels.${i}.ceiling`,
        options: Object.fromEntries([...new Set([...s.classifications, m.ceiling])].filter(Boolean).map((c) => [c, c])),
      },
    },
    ...matrixControls(s, m, i, matrix),
  ];
}

/** The key of the picker that adds a model from a service. */
export const PRESET_KEY = 'aiPreset';

/** The picker: choosing a service adds a model with its name and address filled in (§19). */
export function presetPicker(): SettingDefinitionItem {
  return {
    type: 'group',
    items: [
      {
        name: word('models.preset'),
        desc: word('models.preset.sentence'),
        control: {
          type: 'dropdown',
          key: PRESET_KEY,
          options: {
            '': word('models.preset.pick'),
            ...Object.fromEntries(AI_PRESETS.map((p) => [p.id, word(p.name)])),
          },
        },
      },
    ],
  };
}

/** The models with a service's model added, or none changed when the choice is none. */
export function withPreset(s: Settings, id: string): Partial<Settings> {
  const preset = AI_PRESETS.find((p) => p.id === id);
  if (!preset) return {};
  return {
    aiModels: [
      ...s.aiModels,
      aiModel({ name: word(preset.name), endpoint: preset.endpoint, reach: preset.reach }, s.classifications),
    ],
  };
}

/** The models with one changed, read back as the core reads a model. */
function changed(s: Settings, i: number, part: Partial<AiModel>): AiModel[] {
  return s.aiModels.map((m, j) => (j === i ? aiModel({ ...m, ...part }, s.classifications) : m));
}

type Text = Exclude<keyof AiModel, 'matrixOn'>;
const parts = (key: string): [number, Text] => {
  const [, i, field] = key.split('.');
  return [Number(i), field as Text];
};

/** A model's field, by its control key `aiModels.<index>.<field>`; a class's switch is on or off. */
export function getModelValue(s: Settings, key: string, rows: MatrixRow[]): string | boolean {
  if (switchedClass(key)) return switchIsOn(s, rows, key);
  const [i, field] = parts(key);
  if (field === 'reach') return s.aiModels[i]?.reach === 'private';
  return s.aiModels[i]?.[field] ?? '';
}

/** The change a model's field makes to the settings, by its control key; a new row starts with every switch off. */
export function setModelValue(s: Settings, key: string, value: unknown, rows: MatrixRow[]): Partial<Settings> {
  const on = switchedClass(key);
  if (on) return { aiModels: changed(s, on.i, { matrixOn: withSwitch(s, rows, on.i, on.name, !!value) }) };
  const [i, field] = parts(key);
  if (field === 'reach') return { aiModels: changed(s, i, { reach: value ? 'private' : undefined }) };
  return { aiModels: changed(s, i, { [field]: String(value), ...(field === 'matrixRow' ? { matrixOn: [] } : {}) }) };
}
