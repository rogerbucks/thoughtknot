// A card on a board (editor spec §45, board_cards_rich). It holds a title, a Markdown body, properties, attachments and
// links, and shows them as a thing's details do: the title first, then the body, the properties as rows, then what is
// attached and what it links to. All of it is kept as the card's own properties in the board block, so the note stays the
// only store. Pure and host-free. The Markdown is shown as plain words in the picture, with nothing remote loaded.
import type { Value } from '@thoughtknot/graph-spec';
import type { BoardItem } from './board.ts';
import { word } from './words.ts';

/** A card read from its item. */
export interface Card {
  title: string;
  /** The body as Markdown, as written. */
  body: string;
  /** The other properties, in the order written. */
  properties: [string, string][];
  attachments: string[];
  links: string[];
}

// the item properties that are the card's body, attachments and links (the last two are texts told apart by semicolons); every other one is a property of the card
const OWN = new Set(['body', 'attachments', 'links']);

/** A list of words from a value: one text, its parts told apart by a semicolon. Anything else is nothing. */
const listOf = (v: Value | undefined): string[] =>
  typeof v === 'string'
    ? v
        .split(';')
        .map((x) => x.trim())
        .filter((x) => x)
    : [];

/** The card an item holds. Its text is the title. */
export function cardOf(item: BoardItem): Card {
  const body = item.more.body;
  return {
    title: item.text ?? '',
    body: typeof body === 'string' ? body : '',
    properties: Object.entries(item.more)
      .filter(([key]) => !OWN.has(key))
      .map(([key, v]) => [key, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string]),
    attachments: listOf(item.more.attachments),
    links: listOf(item.more.links),
  };
}

/** One line of Markdown as plain words: no heading, list, emphasis or code marks, and a link shown by its words. */
export function plainLine(line: string): string {
  return line
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/(\*\*|__|\*|_|`|~~)/g, '')
    .trim();
}

/** The body as plain lines, each as written, with no empty line. */
export const bodyLines = (card: Card): string[] =>
  card.body
    .split('\n')
    .map(plainLine)
    .filter((l) => l);

/** What a card says, for a screen reader and the outline: its title, its body, its properties and what is joined to it. */
export function cardSaid(card: Card): string {
  const said = [card.title, bodyLines(card).join(' ')];
  for (const [key, v] of card.properties) said.push(word('board.card.property', { key, value: v }));
  if (card.attachments.length) said.push(word('board.card.attached', { names: card.attachments.join(', ') }));
  if (card.links.length) said.push(word('board.card.links', { names: card.links.join(', ') }));
  return said.filter((s) => s).join('. ');
}

/** The lines a card draws, top to bottom: the title, the body, a row for each property, then attachments and links. */
export function cardLines(card: Card): { text: string; role: 'title' | 'body' | 'row' }[] {
  const lines: { text: string; role: 'title' | 'body' | 'row' }[] = [];
  if (card.title) lines.push({ text: card.title, role: 'title' });
  for (const l of bodyLines(card)) lines.push({ text: l, role: 'body' });
  for (const [key, v] of card.properties)
    lines.push({ text: word('board.card.property', { key, value: v }), role: 'row' });
  if (card.attachments.length)
    lines.push({ text: word('board.card.attached', { names: card.attachments.join(', ') }), role: 'row' });
  if (card.links.length) lines.push({ text: word('board.card.links', { names: card.links.join(', ') }), role: 'row' });
  return lines;
}
