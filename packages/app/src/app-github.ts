// Sending a note to GitHub from the desktop app (spec §48, github_repo_access and github_repo_writes_reviewed).
// - A GitHub button opens a panel: the picked repositories, the branch changes go on, and the highest classification a
//   repository may hold. They are kept in this window's storage on this computer, never in a note or the repository.
// - In the editor the panel also sends the open note, or asks for a review as a pull request.
// - Nothing goes until the show-before-send screen has said where it goes and every line that changes, and the
//   person pressed Send. Its Cancel has the focus first, and Escape cancels.
// - It is on a computer only: a phone has no gh.
import {
  DEFAULT_SETTINGS,
  askRepoReview,
  ghRepoHost,
  repoListFrom,
  repoSettingsFrom,
  repoSettingsProblems,
  sendNoteToRepo,
  word,
  type OutgoingShown,
  type RepoSendOutcome,
  type RepoSettings,
} from '@thoughtknot/core';
import type { Invoke } from './tauri-files.ts';
import { tauriStorage } from './tauri-files.ts';
import { tauriGh } from './tauri-gh.ts';

/** Where the panel's settings are kept in this window's storage. */
export const GITHUB_KEY = 'thoughtknot.github';

/** The classifications the app knows, lowest first, and the level a note with none counts as: the highest. */
const LEVELS = DEFAULT_SETTINGS.classifications;
const UNLABELLED = LEVELS.at(-1) ?? '';

/** The settings as kept, or the defaults when there are none or storage cannot be read. */
export function keptSettings(store: Storage | undefined): RepoSettings {
  let saved: unknown;
  try {
    saved = JSON.parse(store?.getItem(GITHUB_KEY) ?? 'null');
  } catch {
    saved = null;
  }
  return repoSettingsFrom(saved, LEVELS);
}

function keep(store: Storage | undefined, s: RepoSettings): void {
  try {
    store?.setItem(GITHUB_KEY, JSON.stringify(s));
  } catch {
    // a window that keeps nothing still sends, with what was typed this time
  }
}

const make = <K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, props: Record<string, unknown> = {}) =>
  Object.assign(doc.createElement(tag), props);

/**
 * Shows what is about to go, and resolves true only when the person presses Send. Cancel, Escape or closing the
 * screen send nothing. The focus goes back where it was.
 */
export function showOutgoing(doc: Document, shown: OutgoingShown): Promise<boolean> {
  const back = doc.activeElement as HTMLElement | null;
  const dialog = make(doc, 'dialog', { className: 'gn-app-outgoing' });
  const title = make(doc, 'h2', { id: 'gn-outgoing-title', textContent: shown.title });
  dialog.setAttribute('aria-labelledby', title.id);
  const rows = make(doc, 'dl');
  for (const [label, value] of shown.rows)
    rows.append(make(doc, 'dt', { textContent: label }), make(doc, 'dd', { textContent: value }));
  dialog.append(title, rows);
  if (shown.diff === null)
    dialog.append(make(doc, 'p', { textContent: word('repo.send.too-long', { count: shown.count }) }));
  else if (shown.diff.length) {
    // each line marked by + or -, as well as by its look, so no change is told by colour alone
    const lines = shown.diff.map((l) => `${l.kind === 'add' ? '+' : l.kind === 'remove' ? '-' : ' '} ${l.text}`);
    dialog.append(make(doc, 'pre', { className: 'gn-app-diff', textContent: lines.join('\n'), tabIndex: 0 }));
  }
  const send = make(doc, 'button', { type: 'button', textContent: word('repo.send.send') });
  const cancel = make(doc, 'button', { type: 'button', textContent: word('repo.send.cancel') });
  const buttons = make(doc, 'p', { className: 'gn-app-buttons' });
  buttons.append(cancel, send);
  dialog.append(buttons);
  doc.body.append(dialog);
  return new Promise((resolve) => {
    const done = (yes: boolean) => {
      dialog.remove();
      back?.focus?.();
      resolve(yes);
    };
    send.addEventListener('click', () => done(true));
    cancel.addEventListener('click', () => done(false));
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      done(false);
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        done(false);
      }
    });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    cancel.focus();
  });
}

/** What the panel is given: the window's document, the app's calls, its storage, and the open note, if any. */
export interface GithubPanelOptions {
  doc: Document;
  invoke: Invoke;
  store?: Storage | undefined;
  /** The open note's path in the folder; none on the list of notes, where the panel holds the settings alone. */
  note?: string | null;
  /** The show-before-send screen; `showOutgoing` unless a test hands in its own. */
  show?: (shown: OutgoingShown) => Promise<boolean>;
}

/** A labelled field of the panel, saved as it changes. */
function field(doc: Document, label: string, control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const wrap = make(doc, 'label', { className: 'gn-app-field' });
  if (control instanceof doc.defaultView!.HTMLInputElement && control.type === 'checkbox')
    wrap.append(control, ` ${label}`);
  else wrap.append(make(doc, 'span', { textContent: label }), control);
  return wrap;
}

/** The GitHub button, and the panel it opens. On a phone there is none: gh runs on a computer only. */
export function githubButton(o: GithubPanelOptions): HTMLButtonElement {
  const { doc } = o;
  const button = make(doc, 'button', {
    type: 'button',
    textContent: word('repo.settings.open'),
    className: 'gn-app-github-open',
  });
  button.addEventListener('click', () => openPanel(o, button));
  return button;
}

/** The settings' fields, saved as they change: each change is kept, then `changed` is told. */
function settingsForm(doc: Document, store: Storage | undefined, changed: (s: RepoSettings) => void) {
  const s = keptSettings(store);
  const repos = make(doc, 'textarea', { rows: 3, value: s.repos.join('\n') });
  const branch = make(doc, 'input', { type: 'text', value: s.branch });
  const main = make(doc, 'input', { type: 'text', value: s.mainBranch });
  const folder = make(doc, 'input', { type: 'text', value: s.folder });
  const allowed = make(doc, 'select');
  for (const level of LEVELS) allowed.append(make(doc, 'option', { value: level, textContent: level }));
  allowed.value = s.allowed;
  const mainAllowed = make(doc, 'input', { type: 'checkbox', checked: s.mainAllowed });
  const save = () => {
    const next = repoSettingsFrom(
      {
        repos: repoListFrom(repos.value),
        branch: branch.value,
        mainBranch: main.value,
        folder: folder.value,
        allowed: allowed.value,
        mainAllowed: mainAllowed.checked,
      },
      LEVELS,
    );
    keep(store, next);
    changed(next);
  };
  for (const c of [repos, branch, main, folder]) c.addEventListener('input', save);
  for (const c of [allowed, mainAllowed]) c.addEventListener('change', save);
  const fields = [
    field(doc, word('repo.settings.repos'), repos),
    field(doc, word('repo.settings.branch'), branch),
    field(doc, word('repo.settings.main'), main),
    field(doc, word('repo.settings.folder'), folder),
    field(doc, word('repo.settings.allowed'), allowed),
    field(doc, word('repo.settings.main-allowed'), mainAllowed),
  ];
  return { settings: s, fields, first: repos };
}

/** Says how a send went, and turns the buttons back on, whatever failed on the way. */
async function reported(what: () => Promise<RepoSendOutcome>, status: HTMLElement): Promise<void> {
  status.textContent = word('repo.send.working');
  // a failure anywhere, reading the note too, is said, and never leaves the buttons off
  const done = await what().catch((e: unknown) => ({
    ok: false as const,
    reason: e instanceof Error ? e.message : String(e),
  }));
  status.textContent = done.ok ? done.message : done.reason;
}

function openPanel(o: GithubPanelOptions, opener: HTMLElement): void {
  const { doc } = o;
  const dialog = make(doc, 'dialog', { className: 'gn-app-github' });
  const heading = make(doc, 'h2', { id: 'gn-github-title', textContent: word('repo.settings.heading') });
  dialog.setAttribute('aria-labelledby', heading.id);
  dialog.append(heading, make(doc, 'p', { textContent: word('repo.settings.sentence') }));
  const problems = make(doc, 'ul', { className: 'gn-app-problems' });
  problems.setAttribute('role', 'alert');
  const pick = make(doc, 'select');
  const pickField = field(doc, word('repo.settings.pick'), pick);
  const status = make(doc, 'p', { className: 'gn-app-status' });
  status.setAttribute('role', 'status');
  const actions = make(doc, 'p', { className: 'gn-app-buttons' });
  const sendNote = make(doc, 'button', { type: 'button', textContent: word('repo.send.open') });
  const review = make(doc, 'button', { type: 'button', textContent: word('repo.review.open') });

  const refresh = () => {
    const said = repoSettingsProblems(s, LEVELS);
    problems.replaceChildren(...said.map((p) => make(doc, 'li', { textContent: p })));
    const kept = pick.value;
    pick.replaceChildren(...s.repos.map((r) => make(doc, 'option', { value: r, textContent: r })));
    if (s.repos.includes(kept)) pick.value = kept;
    pickField.hidden = s.repos.length < 2;
    sendNote.disabled = review.disabled = said.length > 0;
  };
  const form = settingsForm(doc, o.store, (next) => {
    s = next;
    refresh();
  });
  let s = form.settings;
  dialog.append(...form.fields, problems);

  const sending = () => ({
    host: ghRepoHost(tauriGh(o.invoke), s.mainBranch, s.mainAllowed),
    settings: s,
    repo: s.repos.length > 1 ? pick.value : (s.repos[0] ?? ''),
    levels: LEVELS,
    unlabelled: UNLABELLED,
    show: o.show ?? ((shown: OutgoingShown) => showOutgoing(doc, shown)),
  });
  const run = async (what: () => Promise<RepoSendOutcome>) => {
    sendNote.disabled = review.disabled = true;
    await reported(what, status);
    refresh();
  };
  const note = o.note;
  if (note) {
    dialog.append(pickField);
    const sendIt = async (): Promise<RepoSendOutcome> => {
      const read = await tauriStorage(o.invoke).read(note);
      if (!read) return { ok: false, reason: word('server.note-gone') };
      return sendNoteToRepo(sending(), note, read.text);
    };
    sendNote.addEventListener('click', () => void run(sendIt));
    review.addEventListener('click', () => void run(() => askRepoReview(sending(), word('repo.review.default-title'))));
    actions.append(sendNote, review);
  }

  // the editor's own word for leaving a panel, so it is said in every language the editor speaks
  const close = make(doc, 'button', { type: 'button', textContent: word('editor.done') });
  const shut = () => {
    dialog.remove();
    opener.focus();
  };
  close.addEventListener('click', shut);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    shut();
  });
  actions.append(close);
  dialog.append(actions, status);
  doc.body.append(dialog);
  refresh();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  form.first.focus();
}

/** The window's storage, or none where it cannot be reached. */
export function storeOf(doc: Document): Storage | undefined {
  try {
    return doc.defaultView?.localStorage;
  } catch {
    return undefined;
  }
}

/** Whether the app runs on a computer, where gh can: a phone names its own folder (`own_folder`). */
export async function onComputer(invoke: Invoke): Promise<boolean> {
  try {
    return (await invoke('own_folder')) == null;
  } catch {
    return true;
  }
}
