// Runs before the browser editor's page in the app's window (spec §41, standalone_app). It answers the page's
// `/api/` calls from the picked folder (app-api.ts), so the page itself runs unchanged. It also adds a link back to
// the list of notes, and on a computer the GitHub button, which sends the open note (app-github.ts).
import { setLanguage, SOURCE_LANGUAGE, word } from '@thoughtknot/core';
import { appFetch } from './app-api.ts';
import { githubButton, onComputer, storeOf } from './app-github.ts';
import { tauriSaveNew, tauriStorage, type Invoke } from './tauri-files.ts';

const tauri = (globalThis as { __TAURI__?: { core: { invoke: Invoke } } }).__TAURI__;
if (tauri) {
  window.fetch = appFetch(
    { storage: tauriStorage(tauri.core.invoke), saveNew: tauriSaveNew(tauri.core.invoke) },
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
