// Glyphs for a board (editor spec §45, board_glyphs_offline). They come from this built-in set of emoji and symbols. The
// set is part of the code, so a glyph is never fetched from the network. Each one is a plain Unicode character, which the
// reader's own fonts draw. A glyph is found by its name or by any word that goes with it. Pure and host-free.
import { word } from './words.ts';

/** One glyph: its name in the set, the character that is drawn and the words it is found by. */
export interface Glyph {
  name: string;
  char: string;
  /** The name said in words, for a screen reader. */
  said: string;
  keywords: string[];
}

// name, character, keywords. Every name has its words in the catalogue as board.glyph.<name>
const SET: [string, string, string][] = [
  ['idea', '💡', 'light bulb idea'],
  ['question', '❓', 'question'],
  ['warning', '⚠️', 'warning caution'],
  ['check', '✅', 'check done yes'],
  ['cross', '❌', 'cross no'],
  ['star', '⭐', 'star favourite'],
  ['heart', '❤️', 'heart love'],
  ['flag', '🚩', 'flag'],
  ['pin', '📌', 'pin'],
  ['target', '🎯', 'target goal'],
  ['rocket', '🚀', 'rocket launch'],
  ['fire', '🔥', 'fire hot'],
  ['clock', '⏰', 'clock time'],
  ['calendar', '📅', 'calendar date'],
  ['book', '📖', 'book read'],
  ['note', '📝', 'note write'],
  ['link', '🔗', 'link'],
  ['lock', '🔒', 'lock'],
  ['key', '🔑', 'key'],
  ['bell', '🔔', 'bell alert'],
  ['people', '👥', 'people team'],
  ['person', '👤', 'person'],
  ['chat', '💬', 'chat comment'],
  ['thumbs-up', '👍', 'thumbs up agree'],
  ['thumbs-down', '👎', 'thumbs down disagree'],
  ['chart', '📊', 'chart data'],
  ['money', '💰', 'money cost'],
  ['tools', '🛠️', 'tools build'],
  ['bug', '🐛', 'bug'],
  ['globe', '🌐', 'globe web'],
  ['home', '🏠', 'home'],
  ['map', '🗺️', 'map place'],
  ['camera', '📷', 'camera'],
  ['mail', '✉️', 'mail email'],
  ['cloud', '☁️', 'cloud'],
  ['sun', '☀️', 'sun'],
  ['leaf', '🌱', 'leaf grow'],
  ['puzzle', '🧩', 'puzzle piece'],
  ['arrow-right', '➡️', 'arrow right next'],
  ['stop', '🛑', 'stop'],
];

/** Every glyph in the built-in set, in the order the set lists them. */
export const GLYPHS: readonly Glyph[] = SET.map(([name, char, keywords]) => ({
  name,
  char,
  said: word(`board.glyph.${name}` as 'board.glyph.idea'),
  keywords: keywords.split(' '),
}));

/** The glyph with exactly this name, or nothing. */
export const glyphNamed = (name: string): Glyph | undefined => GLYPHS.find((g) => g.name === name);

/**
 * The glyphs a search finds, best first. A name that is the search comes first. Next come names and words that start
 * with it, then those that hold it. An empty search finds every glyph. Case is ignored.
 */
export function findGlyphs(search: string): Glyph[] {
  const q = search.trim().toLocaleLowerCase();
  if (!q) return [...GLYPHS];
  const rank = (g: Glyph): number => {
    if (g.name === q) return 0;
    if (g.name.startsWith(q) || g.keywords.some((k) => k.startsWith(q))) return 1;
    if (g.name.includes(q) || g.keywords.some((k) => k.includes(q))) return 2;
    return 3;
  };
  return GLYPHS.map((g) => ({ g, r: rank(g) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.g);
}
