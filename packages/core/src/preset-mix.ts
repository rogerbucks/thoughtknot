// A mix of two view presets (editor spec ES§74, presets_mix; ES§69). A person takes each link of a view's chain from
// one preset or the other. An example is calm motion from one and focus support from another. Each setting a preset
// turns comes with the link it belongs to. Where two links taken from different presets clash, the preset named the
// winner keeps its link, and the other link follows it. Each clash is said in words. The mix is kept like any own
// preset. Host-free and pure.
import { PRESET_SETTINGS } from './view-presets.ts';
import type { ViewChain, ViewPreset } from './view-presets.ts';
import type { Settings } from './settings.ts';
import { word } from './words.ts';
import type { WordKey } from './words.ts';

/** The links of a view's chain, in the order the settings page shows them. */
export const CHAIN_LINKS = [
  'ordering',
  'layout',
  'projection',
  'detail',
  'formatting',
  'motion',
  'text',
  'keys',
] as const satisfies readonly (keyof ViewChain)[];

/** One link of a view's chain. */
export type ChainLink = (typeof CHAIN_LINKS)[number];

/** Which of the two presets a part comes from. */
export type MixSide = 'first' | 'second';

/** What a person chose: the two presets, the side each link comes from, and the side that wins a clash. */
export interface MixChoice {
  parts: Record<ChainLink, MixSide>;
  winner: MixSide;
}

/** Each setting a preset turns, by the link it belongs to: it comes from the side that link comes from. */
const SETTING_LINK: Record<(typeof PRESET_SETTINGS)[number], ChainLink> = {
  direction: 'layout',
  focusDepth: 'detail',
  labelsByZoom: 'detail',
  foldHubs: 'layout',
  foldGroups: 'layout',
  mergeLinks: 'formatting',
  detailsOpen: 'detail',
  miniMap: 'projection',
};

/** Two links that must agree: a pinned layout is never reordered, and a matrix is drawn as a grid. */
const MUST_AGREE: { links: [ChainLink, ChainLink]; agree: (c: ViewChain) => boolean }[] = [
  { links: ['layout', 'ordering'], agree: (c) => c.layout !== 'pinned' || c.ordering === 'fixed' },
  { links: ['projection', 'layout'], agree: (c) => c.projection !== 'matrix' || c.layout === 'grid' },
];

/** The choice that takes every link from the first preset, with the first winning a clash. */
export const firstOnly = (): MixChoice => ({
  parts: Object.fromEntries(CHAIN_LINKS.map((l) => [l, 'first'])) as Record<ChainLink, MixSide>,
  winner: 'first',
});

/** A link's name in words, as the settings page shows it. */
export const linkName = (link: ChainLink): string => word(`settings.preset-mix.link.${link}` as WordKey);

/**
 * The mix of `first` and `second` as `choice` says, and each clash it settled, said in words. A clash is two links
 * that must agree, taken from different presets. The winner's link stays, and the other link is taken from the winner.
 */
export function mixPresets(
  first: ViewPreset,
  second: ViewPreset,
  choice: MixChoice,
): { preset: ViewPreset; clashes: string[] } {
  const of = { first, second };
  const parts = { ...choice.parts };
  const chain = (): ViewChain =>
    Object.fromEntries(CHAIN_LINKS.map((l) => [l, of[parts[l]].chain[l]])) as unknown as ViewChain;
  const clashes: string[] = [];
  for (const rule of MUST_AGREE) {
    const [a, b] = rule.links;
    if (parts[a] === parts[b] || rule.agree(chain())) continue;
    // the winner's link stays; the other link follows the winner, whose own chain agrees with itself
    const follows = parts[a] === choice.winner ? b : a;
    const kept = follows === a ? b : a;
    parts[follows] = choice.winner;
    clashes.push(
      word('settings.preset-mix.clash', {
        kept: linkName(kept),
        winner: of[choice.winner].name,
        follows: linkName(follows),
      }),
    );
  }
  const settings = Object.fromEntries(
    PRESET_SETTINGS.map((k) => [k, of[parts[SETTING_LINK[k]]].settings[k]]).filter(([, v]) => v !== undefined),
  ) as Partial<Settings>;
  const from = (side: MixSide) =>
    CHAIN_LINKS.filter((l) => parts[l] === side)
      .map(linkName)
      .join(', ');
  const preset: ViewPreset = {
    id: 'mix',
    name: word('settings.preset-mix.name', { first: first.name, second: second.name }),
    sentence: word('settings.preset-mix.sentence', {
      first: first.name,
      firstParts: from('first') || '-',
      second: second.name,
      secondParts: from('second') || '-',
    }),
    chain: chain(),
    settings,
  };
  return { preset, clashes };
}
