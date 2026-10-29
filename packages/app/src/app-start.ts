// The app's first page (spec §41, standalone_app): pick a folder of notes, then open one. A note opens in the browser
// editor's page (editor.html), the same page the Claude Code host serves, with its calls answered in the window.
// The folder is kept by the app for as long as it runs, so going back lists it again without asking. The page speaks
// the system's language, as the editor's page speaks the browser's (language_follows_host).
// On a phone or tablet (spec §40, android_app and ios_app) the app keeps its own folder. It is open from the start, so
// there is nothing to pick. The page lists its notes, and a button makes a new one and opens it.
import { setLocale } from '@thoughtknot/core';
import { directionOf, setDirection, setLanguage, SOURCE_LANGUAGE, word } from '@thoughtknot/core';
import { tauriSaveNew, tauriStorage, type Invoke } from './tauri-files.ts';

/** The address of the editor for a note: its path in the fragment, as the server's address carries it. */
export const editorAddress = (path: string): string => `editor.html#token=app&note=${encodeURIComponent(path)}`;

/** The project's privacy page (risk LEGAL-2), shown on the first page as an address to type or copy. */
export const PRIVACY_PAGE = 'https://thoughtknot.app/privacy.html';

/** A new note's text: its title, then an empty graph block, where the editor shows how to start one. */
export const newNoteText = (title: string): string => `# ${title}\n\n\`\`\`gql\n// graph: first\n\`\`\`\n`;

/** The name of the app's own folder on a phone or tablet; null on a computer, or an app from before phones. */
async function ownFolder(invoke: Invoke): Promise<string | null> {
  try {
    return ((await invoke('own_folder')) as string | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Fills `main` with the folder's notes, each a link to the editor; or the button to pick a folder. `go` opens an
 * address in the window.
 */
export async function startApp(
  doc: Document,
  invoke: Invoke,
  go = (address: string) => doc.defaultView?.location.assign(address),
): Promise<void> {
  // as installHost sets a host's language (core display/host.ts), without the rest of the core it would bring
  const language = doc.defaultView?.navigator.language || SOURCE_LANGUAGE;
  const root = doc.documentElement;
  root.lang = setLanguage(language);
  setLocale(language);
  setDirection(directionOf(language));
  root.dir = directionOf(language);
  const privacy = doc.body.appendChild(Object.assign(doc.createElement('footer'), { className: 'gn-app-privacy' }));
  privacy.textContent = word('app.privacy', { address: PRIVACY_PAGE });
  const main = doc.getElementById('gn-app') as HTMLElement;
  const say = (text: string, tag = 'p') =>
    main.appendChild(Object.assign(doc.createElement(tag), { textContent: text }));
  const own = await ownFolder(invoke);
  const show = async (folder: string | null) => {
    main.replaceChildren();
    let notes: string[] | null = null;
    try {
      notes = await tauriStorage(invoke).list();
    } catch {
      // no folder picked yet
    }
    const pick = Object.assign(doc.createElement('button'), { type: 'button', textContent: word('app.open-folder') });
    pick.addEventListener('click', () => {
      void (async () => {
        try {
          const name = (await invoke('pick_folder')) as string | null;
          if (name !== null) await show(name);
        } catch (e) {
          say(word('app.cannot-read', { why: e instanceof Error ? e.message : String(e) }));
        }
      })();
    });
    if (own !== null && notes !== null) return showOwn(notes);
    if (notes === null) {
      say(word('app.no-folder'));
      main.appendChild(pick);
      return;
    }
    say(
      folder ? word('app.folder-notes', { folder, count: notes.length }) : word('app.notes', { count: notes.length }),
      'h2',
    );
    if (!notes.length) say(word('app.no-notes'));
    const list = main.appendChild(doc.createElement('ul'));
    for (const path of notes) {
      const link = Object.assign(doc.createElement('a'), { href: editorAddress(path), textContent: path });
      list.appendChild(doc.createElement('li')).appendChild(link);
    }
    main.appendChild(pick);
  };
  /** A phone's notes, each a link, and a button that makes a note and opens it. */
  const showOwn = (notes: string[]) => {
    say(word('app.notes', { count: notes.length }), 'h2');
    if (!notes.length) say(word('app.phone-no-notes'));
    const list = main.appendChild(doc.createElement('ul'));
    for (const path of notes) {
      const link = Object.assign(doc.createElement('a'), { href: editorAddress(path), textContent: path });
      list.appendChild(doc.createElement('li')).appendChild(link);
    }
    const make = Object.assign(doc.createElement('button'), { type: 'button', textContent: word('app.new-note') });
    make.addEventListener('click', () => {
      void (async () => {
        const title = word('app.new-note');
        try {
          // a name already taken gets the next number, so no note is ever written over
          const made = (
            await tauriSaveNew(invoke)('', [
              { name: `${title}.md`, bytes: new TextEncoder().encode(newNoteText(title)) },
            ])
          )[0];
          if (made) go(editorAddress(made));
        } catch (e) {
          say(word('app.cannot-read', { why: e instanceof Error ? e.message : String(e) }));
        }
      })();
    });
    main.appendChild(make);
  };
  await show(own);
}

const tauri = (globalThis as { __TAURI__?: { core: { invoke: Invoke } } }).__TAURI__;
if (tauri && typeof document !== 'undefined') void startApp(document, tauri.core.invoke);
