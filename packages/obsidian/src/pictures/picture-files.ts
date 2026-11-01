// The picture files of a note, kept in step with its graphs (editor spec §62, picture_kept_in_step, picture_where).
// - A note gets pictures once they are on for it: it has a picture line, a command turned them on, or its folder is set.
// - Each picture is written only when the fingerprint of its text changed, so two machines never take turns.
// - A file goes where Obsidian keeps new attachments, or the folder set, named after the note and the graph.
// - Only a file that names itself as ThoughtKnot's is ever written over, renamed or put in the trash.
// - A picture whose block is gone goes, line and file. A renamed note's pictures follow it.
import { TFile } from 'obsidian';
import {
  PICTURE_ENDING,
  gqlBlocks,
  isPictureFile,
  madeByThoughtKnot,
  namesSharedSchema,
  notePictures,
  pictureBlocks,
  pictureFileName,
  pictureHref,
  pictureLinkOf,
  pictureLines,
  pictureState,
  pictureTarget,
  picturesOnFor,
  withPictureLine,
  word,
} from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { classificationOf } from '../export/classification';
import { exportText, moveExport, vaultOps } from '../export/vault-write';
import { changeVaultNote, noteText } from '../storage/plugin-notes';

/** What a refresh did: the pictures written, the question a classified note asks first, and what was not written. */
export interface PictureRun {
  drawn: number;
  ask?: string;
  failed: string[];
}

/** The folder of a vault path; empty at the top of the vault. */
const folderOf = (path: string) => path.split('/').slice(0, -1).join('/');
const joined = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

/** The day where the person is, as the picture's foot says it. */
function today(): string {
  const now = new Date(),
    two = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** Whether the file at `path` is a picture ThoughtKnot made, which it may write over or remove. */
export async function oursAt(plugin: ThoughtKnotPlugin, path: string): Promise<boolean> {
  const text = isPictureFile(path) ? await exportText(plugin, path) : null;
  return text !== null && madeByThoughtKnot(text);
}

/**
 * Where a new picture named `name` for note `note` goes: the folder set, else where Obsidian keeps attachments. A
 * picture of ours already there is the one to keep up to date. Past a file of someone else's, a number goes before the
 * ending, so the name still ends .thoughtknot.svg.
 */
async function placeFor(plugin: ThoughtKnotPlugin, note: string, name: string): Promise<string> {
  const folder =
    plugin.settings.pictureFolder || folderOf(await plugin.app.fileManager.getAvailablePathForAttachment(name, note));
  const stem = name.slice(0, -PICTURE_ENDING.length);
  for (let n = 0; ; n++) {
    const path = joined(folder, n ? `${stem} ${n}${PICTURE_ENDING}` : name);
    if (!plugin.app.vault.getAbstractFileByPath(path) || (await oursAt(plugin, path))) return path;
  }
}

/** Puts the picture at `path` in the trash, only when ThoughtKnot made it. */
export async function trashOurs(plugin: ThoughtKnotPlugin, path: string): Promise<void> {
  const f = plugin.app.vault.getAbstractFileByPath(path);
  if (f instanceof TFile && (await oursAt(plugin, path))) await plugin.app.fileManager.trashFile(f);
}

/**
 * The picture lines of `text` that belong to no picture block any more, with their files. One is a line after a block
 * not drawn as a graph. Another is a line left where its block was, linking a picture of this note's name.
 */
function leftOver(text: string, path: string): { line: number; target: string }[] {
  const drawn = new Set(pictureBlocks(text).map((b) => b.block));
  const after = new Map(pictureLines(text).map((p) => [p.line, p]));
  const stem = `${(path.split('/').pop() ?? '').replace(/\.md$/i, '')}.`;
  return text.split('\n').flatMap((l, line) => {
    const placed = after.get(line);
    if (placed) return drawn.has(placed.block) ? [] : [{ line, target: pictureTarget(path, placed.href) }];
    const href = pictureLinkOf(l.replace(/\r$/, ''));
    const target = href ? pictureTarget(path, href) : '';
    return href && (target.split('/').pop() ?? '').startsWith(stem) ? [{ line, target }] : [];
  });
}

/**
 * Brings the pictures of the note at `path` up to date, when they are on for it (or `turnOn` turns them on). Each
 * picture is written only when its fingerprint changed. The note gets each image line it lacks. It loses each line
 * whose block is gone, with its file. Null when pictures are not on for the note.
 */
export async function refreshPictures(
  plugin: ThoughtKnotPlugin,
  path: string,
  { turnOn = false, confirmed = false } = {},
): Promise<PictureRun | null> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  const text = file instanceof TFile && file.extension === 'md' ? await noteText(plugin.app, path) : null;
  if (!(file instanceof TFile) || text === null) return null;
  // on by a line it has, even one left where its block was, which then goes
  const lined = text.split('\n').some((l) => pictureLinkOf(l.replace(/\r$/, '')) !== null);
  if (!turnOn && !lined && !picturesOnFor(plugin.settings, path)) return null;
  const texts = gqlBlocks(text).map((b) => b.text);
  const made = await notePictures({
    text,
    note: path,
    date: today(),
    layout: (d, theme) => plugin.layoutForExport(d, theme),
    noteClassification: classificationOf(plugin.app, file, text, plugin.settings.classifications),
    settings: plugin.settings,
    confirmed,
    shared: texts.some(namesSharedSchema) ? await plugin.sharedSchemas() : [],
  });
  const run: PictureRun = { drawn: 0, failed: [] };
  const lines = new Map(pictureLines(text).map((p) => [p.block, p]));
  const wanted = new Map<number, string>();
  for (const { block, graph, decision } of made) {
    if (!decision || 'nothing' in decision) continue;
    if ('ask' in decision) {
      run.ask = decision.ask;
      continue;
    }
    const { picture } = decision;
    const at = lines.get(block);
    const target = at ? pictureTarget(path, at.href) : await placeFor(plugin, path, picture.fileName);
    const state = pictureState(await exportText(plugin, target), picture.fingerprint);
    if (state === 'not-ours') {
      run.failed.push(word('pictures.not-written', { graph, why: word('pictures.not-ours', { path: target }) }));
      continue;
    }
    if (state !== 'current') {
      await vaultOps(plugin).write(target, picture.svg);
      run.drawn++;
    }
    const href = pictureHref(path, target);
    if (at?.href !== href) wanted.set(block, picture.line(href));
  }
  const gone = leftOver(text, path);
  for (const g of gone) await trashOurs(plugin, g.target);
  if (wanted.size || gone.length)
    await changeVaultNote(plugin.app, path, (now) => {
      // the lines left over taken out, from the foot up, then each line wanted put after its block
      const kept = leftOver(now, path).map((g) => g.line);
      let next = now
        .split('\n')
        .filter((_, i) => !kept.includes(i))
        .join('\n');
      for (const [block, line] of wanted) next = withPictureLine(next, block, line);
      return next;
    });
  return run;
}

/** The note at `path` with every picture line taken away, and each picture file ThoughtKnot made for them in the trash. */
export async function removePictures(plugin: ThoughtKnotPlugin, path: string): Promise<void> {
  const text = await noteText(plugin.app, path);
  if (text === null) return;
  const targets = [
    ...pictureLines(text).map((p) => pictureTarget(path, p.href)),
    ...leftOver(text, path).map((g) => g.target),
  ];
  for (const t of new Set(targets)) await trashOurs(plugin, t);
  await changeVaultNote(plugin.app, path, (now) => {
    const after = new Set(pictureLines(now).map((p) => p.line));
    for (const g of leftOver(now, path)) after.add(g.line);
    return now
      .split('\n')
      .filter((_, i) => !after.has(i))
      .join('\n');
  });
}

/**
 * A note renamed or moved from `old` to `path`. Each picture of ThoughtKnot's it links is renamed after it, beside
 * where it was. Its line links it again from the note's new place. The pictures are then redrawn, naming the new note.
 */
export async function followNote(plugin: ThoughtKnotPlugin, path: string, old: string): Promise<void> {
  const text = path.endsWith('.md') ? await noteText(plugin.app, path) : null;
  if (text === null) return;
  const graphs = new Map(pictureBlocks(text).map((b) => [b.block, b.graph]));
  const moved = new Map<number, string>();
  for (const at of pictureLines(text)) {
    const graph = graphs.get(at.block);
    // Obsidian may have mended the link already: it is then the new note's, else still the old one's
    const now = pictureTarget(path, at.href),
      was = pictureTarget(old, at.href);
    const from = (await oursAt(plugin, now)) ? now : was;
    if (!graph || !(await oursAt(plugin, from))) continue;
    const to = joined(folderOf(from), pictureFileName(path, graph));
    if (to !== from && !plugin.app.vault.getAbstractFileByPath(to)) await moveExport(plugin, from, to);
    moved.set(at.block, pictureHref(path, plugin.app.vault.getAbstractFileByPath(to) ? to : from));
  }
  if (moved.size)
    await changeVaultNote(plugin.app, path, (now) => {
      let next = now;
      for (const at of pictureLines(now)) {
        const href = moved.get(at.block);
        const line = href ? next.split('\n')[at.line] : undefined;
        if (href && line) next = withPictureLine(next, at.block, `${line.slice(0, line.lastIndexOf(']('))}](${href})`);
      }
      return next;
    });
  await refreshPictures(plugin, path);
}
