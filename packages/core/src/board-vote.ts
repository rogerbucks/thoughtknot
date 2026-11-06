// Votes and reactions on a board (editor spec §45, board_vote). Each person may vote on an item or react to it. What was
// voted is kept in the board block, on the item, as a property `votes` holding `person=reaction` entries split by
// semicolons. So the note stays the only store, each person's vote is theirs, and the tally is worked out from it.
// Pure and host-free.
import type { BoardItem } from './board.ts';

/** The reaction a plain vote is. */
export const VOTE = '+1';

/** One person's vote or reaction on an item. */
export interface Vote {
  person: string;
  reaction: string;
}

/** What an item has been voted: each reaction with how many people gave it, the most first, and the people in all. */
export interface Tally {
  reactions: { reaction: string; count: number; people: string[] }[];
  people: number;
  total: number;
}

/** The votes written on an item, in the order written. An entry with no person or no reaction is left out. */
export function votesOf(item: BoardItem): Vote[] {
  const raw = item.more.votes;
  if (typeof raw !== 'string') return [];
  const out: Vote[] = [];
  for (const entry of raw.split(';')) {
    const at = entry.lastIndexOf('=');
    const person = entry.slice(0, at).trim();
    const reaction = entry.slice(at + 1).trim();
    if (at > 0 && person && reaction) out.push({ person, reaction });
  }
  return out;
}

/** The tally of an item's votes. */
export function tallyOf(item: BoardItem): Tally {
  const by = new Map<string, string[]>();
  const votes = votesOf(item);
  for (const v of votes) by.set(v.reaction, [...(by.get(v.reaction) ?? []), v.person]);
  const reactions = [...by.entries()]
    .map(([reaction, people]) => ({ reaction, count: people.length, people }))
    .sort((a, b) => b.count - a.count || a.reaction.localeCompare(b.reaction));
  return { reactions, people: new Set(votes.map((v) => v.person)).size, total: votes.length };
}

/** Votes written as the property value: `person=reaction` entries split by semicolons. */
const written = (votes: Vote[]) => votes.map((v) => `${v.person}=${v.reaction}`).join('; ');

/**
 * The item's `more` with `person`'s `reaction` given, or taken back when they had already given it: a second press is an
 * undo. A reaction of null takes back all that person's votes. A person's name or a reaction may not hold `;` or `=`.
 */
export function votedMore(item: BoardItem, person: string, reaction: string | null): BoardItem['more'] {
  const clean = (s: string) => s.replace(/[;=]/g, ' ').trim();
  const who = clean(person);
  const what = reaction === null ? null : clean(reaction);
  const was = votesOf(item);
  const had = what !== null && was.some((v) => v.person === who && v.reaction === what);
  let now = was.filter((v) => !(v.person === who && (what === null || v.reaction === what)));
  if (what && who && !had) now = [...now, { person: who, reaction: what }];
  const more = { ...item.more };
  if (now.length) more.votes = written(now);
  else delete more.votes;
  return more;
}

/** An item's tally in words, such as `3 votes: +1 2, ❤ 1`; empty when it has none. */
export function tallySaid(item: BoardItem, say: (people: number, list: string) => string): string {
  const t = tallyOf(item);
  return t.total ? say(t.people, t.reactions.map((r) => `${r.reaction} ${r.count}`).join(', ')) : '';
}
