// The options for the pictures for readers without ThoughtKnot (editor spec §62, picture_opt_in, picture_where), in the
// Export section of the settings page. They say which folders' notes get a picture after each graph, and where the
// picture files are kept. A note anywhere else gets one only once a command turns it on for that note.
import type { Option } from './settings.ts';
import { vaultFolder } from './vault-folder.ts';

/** The settings of the pictures for readers. */
export interface PictureSettings {
  /** The vault folders whose notes get pictures, parted by commas; `/` is the whole vault; empty is none. */
  pictureFolders: string;
  /** The vault folder the picture files are kept in; empty is where the host keeps new attachments. */
  pictureFolder: string;
}

/** None turned on, and kept where the host keeps new attachments. */
export const DEFAULT_PICTURES: PictureSettings = { pictureFolders: '', pictureFolder: '' };

/** The options, in the order the settings page shows them. */
export const PICTURE_OPTIONS: Option[] = [
  {
    key: 'pictureFolders',
    section: 'Export',
    name: 'Pictures for readers without ThoughtKnot',
    sentence:
      'Notes in these folders get a picture after each graph, so GitHub and other Markdown apps show it. Part folders with commas; write / for the whole vault. Left empty, a note gets pictures only once you turn them on for it.',
  },
  {
    key: 'pictureFolder',
    section: 'Export',
    name: 'Picture folder',
    sentence: 'The vault folder the pictures are kept in. Left empty, they go where Obsidian keeps new attachments.',
  },
];

/** The folders as kept: each a vault folder, `/` alone for the whole vault, any unsafe one left out. */
export function pictureFoldersOf(given: unknown): string[] {
  const parts = (typeof given === 'string' ? given : '').split(',').map((p) => p.trim());
  if (parts.includes('/')) return ['/'];
  return parts.flatMap((p) => {
    const folder = p ? vaultFolder(p) : null;
    return folder ? [folder] : [];
  });
}

/** The picture settings read back from what was saved, anything unsafe left out. */
export function picturesFrom(s: Record<string, unknown>): PictureSettings {
  return {
    pictureFolders: pictureFoldersOf(s.pictureFolders).join(', '),
    pictureFolder: vaultFolder(s.pictureFolder) ?? '',
  };
}

/** Whether the settings turn pictures on for the note at `path` (a vault path), by its folder or the whole vault. */
export function picturesOnFor(settings: PictureSettings, path: string): boolean {
  const folders = pictureFoldersOf(settings.pictureFolders);
  return folders.includes('/') || folders.some((f) => path.startsWith(`${f}/`));
}
