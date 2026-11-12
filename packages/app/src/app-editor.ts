// Runs before the browser editor's page in the app's window (spec §41, standalone_app). It answers the page's
// `/api/` calls from the picked folder (app-api.ts), so the page itself runs unchanged. It also adds a link back to
// the list of notes, and on a computer the GitHub button, which sends the open note (app-github.ts). A note too big to
// read at once is kept in the app's file on disk (tauri-parts-store.ts).
import { setLanguage, SOURCE_LANGUAGE, word } from '@thoughtknot/core';
import type { NoteStorage, WriteOptions } from '@thoughtknot/core';
import { appFetch } from './app-api.ts';
import { indexedShelves } from './app-shelves.ts';
import { startShared, type Shared } from './app-shared.ts';
import { indexedKeeper } from './app-share-keeper.ts';
import { githubButton, onComputer, storeOf } from './app-github.ts';
import { tauriSaveNew, tauriStorage, type Invoke } from './tauri-files.ts';
import { orInMemory, tauriPartsStore } from './tauri-parts-store.ts';

const tauri = (globalThis as { __TAURI__?: { core: { invoke: Invoke } } }).__TAURI__;

/** The notes' storage once sharing has had its say: the folder's notes, under the sharing layer when there is one. */
function sharedStorage(base: NoteStorage, ready: Promise<Shared | undefined>): NoteStorage {
  const through = async () => {
    const shared = await ready;
    return shared ? shared.layer(base) : base;
  };
  return {
    list: async () => (await through()).list(),
    read: async (path: string) => (await through()).read(path),
    write: async (path: string, text: string, options?: WriteOptions) => (await through()).write(path, text, options),
    remove: async (path: string, options?: WriteOptions) => (await through()).remove(path, options),
  };
}

if (tauri) {
  let shared: Shared | undefined;
  const ready = startShared({
    invoke: tauri.core.invoke,
    keeper: indexedKeeper(window),
    shelves: indexedShelves(window),
  }).then(
    (s) => (shared = s),
    () => undefined,
  );
  // the page asks for a board's seat once it has read its note, which waited for sharing to start
  (window as Window & { thoughtknotSeat?: unknown }).thoughtknotSeat = (note: string, board: string) =>
    shared?.seat(note, board);
  // sharing may start after the page first drew its boards, so the page is called back once it has, if it does
  (window as Window & { thoughtknotSeatsReady?: unknown }).thoughtknotSeatsReady = (then: () => void) =>
    void ready.then((s) => s && then());
  // a note too big to read at once keeps its rows in the app's file on disk, not in the window (scale_parts_on_disk)
  (window as Window & { thoughtknotPartsStore?: unknown }).thoughtknotPartsStore = (place: string) =>
    orInMemory(tauriPartsStore(tauri.core.invoke, place), (e) =>
      console.warn('ThoughtKnot: the store on disk failed; this session keeps huge notes in memory', e),
    );
  window.fetch = appFetch(
    { storage: sharedStorage(tauriStorage(tauri.core.invoke), ready), saveNew: tauriSaveNew(tauri.core.invoke) },
    window.fetch.bind(window),
  );
  // the link is made before the page runs, so it speaks the system's language itself, as app-start.ts does
  setLanguage(navigator.language || SOURCE_LANGUAGE);
  // in a nav of the page's prose, so the link takes the page's own link colour in both themes
  const nav = Object.assign(document.createElement('nav'), { className: 'gn-prose' });
  nav.append(Object.assign(document.createElement('a'), { href: 'index.html', textContent: word('app.back') }));
  document.querySelector('header')?.prepend(nav);
  const note = new URLSearchParams(location.hash.slice(1)).get('note');
  const { invoke } = tauri.core;
  void onComputer(invoke).then((yes) => {
    if (yes) nav.append(' ', githubButton({ doc: document, invoke, store: storeOf(document), note }));
  });
}
