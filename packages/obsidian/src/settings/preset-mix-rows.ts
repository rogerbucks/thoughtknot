// Mixing two view presets on the settings page (editor spec ES§74, presets_mix). The person picks two presets and
// takes each part of the view from one or the other. They also say which wins where two parts clash. The page says
// each clash and who won it before anything is kept. Keep the mix adds it to their own presets, picked like any other.
// Nothing is saved, and no drawing moves, until then.
import { CHAIN_LINKS, firstOnly, linkName, mixPresets, word } from '@thoughtknot/core';
import type { ChainLink, MixChoice, MixSide, ViewPreset } from '@thoughtknot/core';
import type { SettingDefinition } from 'obsidian';

/** The start of every control key of the mix. */
export const MIX_KEY = 'presetMix.';

/** The mix being made: the two presets picked, and the choice of parts. Never saved until it is kept. */
export interface MixDraft {
  first: string;
  second: string;
  choice: MixChoice;
}

/** A new mix: calm motion and focus support, as the ethos names them, every part from the first until changed. */
export const newMix = (): MixDraft => ({ first: 'calm', second: 'focus', choice: firstOnly() });

const sideOptions = (): Record<MixSide, string> => ({
  first: word('settings.preset-mix.from-first'),
  second: word('settings.preset-mix.from-second'),
});

/** The two presets of the mix, each the one picked, or the first offered when the picked one is gone. */
function picked(d: MixDraft, presets: readonly ViewPreset[]): [ViewPreset, ViewPreset] | null {
  const find = (id: string) => presets.find((p) => p.id === id) ?? presets[0];
  const a = find(d.first),
    b = find(d.second);
  return a && b ? [a, b] : null;
}

/** The rows of the mix: the two presets, a side for each part, the winner, what clashed, and Keep the mix. */
export function mixDefinitions(
  d: MixDraft,
  presets: readonly ViewPreset[],
  keep: (mix: ViewPreset) => void,
): SettingDefinition[] {
  const both = picked(d, presets);
  if (!both) return [];
  const { preset, clashes } = mixPresets(both[0], both[1], d.choice);
  const names = Object.fromEntries(presets.map((p) => [p.id, p.name]));
  const pick = (which: 'first' | 'second'): SettingDefinition => ({
    name: word(`settings.preset-mix.${which}`),
    desc: '',
    control: { type: 'dropdown', key: `${MIX_KEY}${which}`, options: names },
  });
  return [
    { name: word('settings.preset-mix.heading'), desc: word('settings.preset-mix.help') },
    pick('first'),
    pick('second'),
    ...CHAIN_LINKS.map((l): SettingDefinition => ({
      name: linkName(l),
      desc: '',
      control: { type: 'dropdown', key: `${MIX_KEY}part.${l}`, options: sideOptions() },
    })),
    {
      name: word('settings.preset-mix.winner'),
      // each clash, and who won it, is said before the mix is kept
      desc: clashes.length ? clashes.join(' ') : word('settings.preset-mix.no-clash'),
      control: {
        type: 'dropdown',
        key: `${MIX_KEY}winner`,
        options: {
          first: word('settings.preset-mix.winner-first'),
          second: word('settings.preset-mix.winner-second'),
        },
      },
    },
    {
      name: word('settings.preset-mix.save'),
      desc: `${word('settings.preset-mix.save.sentence')} ${preset.sentence}`,
      action: () => keep(preset),
    },
  ];
}

/** The value a control of the mix shows. */
export function mixValue(d: MixDraft, key: string): string {
  const what = key.slice(MIX_KEY.length);
  if (what === 'first' || what === 'second') return d[what];
  if (what === 'winner') return d.choice.winner;
  return d.choice.parts[what.slice('part.'.length) as ChainLink] ?? 'first';
}

/** A control of the mix changed: the draft takes it. Nothing is saved. */
export function setMixValue(d: MixDraft, key: string, value: unknown): void {
  const what = key.slice(MIX_KEY.length),
    v = String(value);
  if (what === 'first' || what === 'second') d[what] = v;
  else if (v === 'first' || v === 'second') {
    if (what === 'winner') d.choice.winner = v;
    else if ((CHAIN_LINKS as readonly string[]).includes(what.slice('part.'.length)))
      d.choice.parts[what.slice('part.'.length) as ChainLink] = v;
  }
}
