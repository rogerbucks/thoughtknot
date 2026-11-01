// The pictures for readers of every note in a folder or a repository, brought up to date at once (editor spec §62,
// picture_outside_tools). It is for a tool outside the apps: the command line, or a check in CI.
// - A note gets pictures once it has a picture line, or when the tool is asked to add them to every note.
// - A picture is changed only when the fingerprint of its text changed, as in the apps. So the tools and the apps never
//   take turns rewriting one.
// - A new picture goes beside its note. Only a file that names itself as ThoughtKnot's is written over or removed.
// - A picture whose block is gone goes, line and file.
// Host-free: the tool reads the files and writes the changes it is given.
import { notePictures } from './reader-picture.ts';
import type { NotePicturesInput } from './reader-picture.ts';
import {
  PICTURE_ENDING,
  madeByThoughtKnot,
  pictureHref,
  pictureLines,
  pictureState,
  pictureTarget,
  withPictureLine,
  pictureLinkOf,
  withoutPictureLines,
} from './reader-picture-note.ts';
import { word } from './words.ts';

/** A file to write, or to remove when its text is null. Paths are from the folder's top, with `/` between parts. */
export interface PictureChange {
  path: string;
  text: string | null;
}

/** What a folder's pictures need: the changes, each file out of date, and each picture that could not be written. */
export interface FolderPicturesRun {
  changes: PictureChange[];
  outOfDate: string[];
  problems: string[];
}

/** The notes of a folder and how to read a file in it, with the drawing a picture is made by. */
export type FolderPicturesInput = Omit<NotePicturesInput, 'text' | 'note'> & {
  notes: readonly string[];
  read: (path: string) => Promise<string | null>;
  /** True adds pictures to every note with a graph, not only those that have a picture line. */
  add?: boolean;
};

/** The folder of a path from the top; empty at the top. */
const folderOf = (path: string) => path.split('/').slice(0, -1).join('/');

/** Whether `line` is a picture line, whatever its line ending. */
const isPictureLine = (line: string) => pictureLinkOf(line.replace(/\r$/, '')) !== null;

/**
 * Brings the pictures of each note in `input.notes` up to date. A note with no picture line is left alone, unless
 * `add` is set. Nothing is written here: the changes are handed back.
 */
export async function folderPictures(input: FolderPicturesInput): Promise<FolderPicturesRun> {
  const run: FolderPicturesRun = { changes: [], outOfDate: [], problems: [] };
  const ours = async (path: string) => madeByThoughtKnot((await input.read(path)) ?? '');
  for (const note of input.notes) {
    const text = await input.read(note);
    if (text === null || (!input.add && !text.split('\n').some(isPictureLine))) continue;
    const made = await notePictures({ ...input, text, note });
    const placed = new Map(pictureLines(text).map((p) => [p.block, p]));
    const drawn = new Set<number>();
    let next = text;
    for (const { block, graph, decision } of made) {
      if (!decision || !('picture' in decision)) continue;
      const { picture } = decision;
      const at = placed.get(block);
      const beside = `${folderOf(note) ? `${folderOf(note)}/` : ''}${picture.fileName}`;
      const stem = beside.slice(0, -PICTURE_ENDING.length);
      let target = at ? pictureTarget(note, at.href) : beside;
      // past a file of someone else's, a number goes before the ending, as the apps do
      for (let n = 1; !at && pictureState(await input.read(target), picture.fingerprint) === 'not-ours'; n++)
        target = `${stem} ${n}${PICTURE_ENDING}`;
      const state = pictureState(await input.read(target), picture.fingerprint);
      if (state === 'not-ours') {
        run.problems.push(
          `${note}: ${word('pictures.not-written', { graph, why: word('pictures.not-ours', { path: target }) })}`,
        );
        continue;
      }
      drawn.add(block);
      if (state !== 'current') {
        run.changes.push({ path: target, text: picture.svg });
        run.outOfDate.push(target);
      }
      const href = pictureHref(note, target);
      if (at?.href !== href) next = withPictureLine(next, block, picture.line(href));
    }
    next = withoutPictureLines(next, (p) => !drawn.has(p.block));
    // a line left where its block was, or after one no longer drawn, goes, with its file when ThoughtKnot made it
    const kept = new Set(pictureLines(next).map((p) => p.line));
    const stem = `${(note.split('/').pop() ?? '').replace(/\.md$/i, '')}.`;
    const gone = pictureLines(text)
      .filter((p) => !drawn.has(p.block))
      .map((p) => p.href);
    const lines = next.split('\n').filter((l, i) => {
      const href = kept.has(i) ? null : pictureLinkOf(l.replace(/\r$/, ''));
      const left = href !== null && (pictureTarget(note, href).split('/').pop() ?? '').startsWith(stem);
      if (left) gone.push(href);
      return !left;
    });
    next = lines.join('\n');
    for (const target of new Set(gone.map((h) => pictureTarget(note, h))))
      if (await ours(target)) run.changes.push({ path: target, text: null });
    if (next !== text) {
      run.changes.push({ path: note, text: next });
      run.outOfDate.push(note);
    }
  }
  return run;
}
