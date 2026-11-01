// The web layer (editor spec §40, web_layer_separate). Web presentation is a separate, secure layer. It is hosted where
// the owner chooses, apart from the stores on each device.
// - It is built from a parcel alone (packages/boundary). It never takes a store, a key or a synced note. So nothing a
//   device keeps, sealed or not, can reach the web.
// - It is static files only: a page, its stylesheet, and the parcel's own files. No server runs, so it can be hosted
//   anywhere the owner controls: their own domain, GitHub Pages, a SharePoint library or a plain folder.
// - It is read-only and runs no script. Its content policy lets the page load only its own files, so it fetches
//   nothing from anywhere else, and works offline once copied.
import { isParcel } from '@thoughtknot/boundary';
import type { Parcel } from '@thoughtknot/boundary';

/** One file of the site: where it goes, its type and its text. */
export interface SiteFile {
  path: string;
  type: string;
  text: string;
}

/** The content policy every page carries: its own files only, no script, no form, no frame. */
export const CONTENT_POLICY =
  "default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";

const STYLE = `:root { color-scheme: light dark; --ink: #1d1d1f; --paper: #ffffff; --muted: #5f6368; --rule: #d0d4da; --link: #0b57d0; }
@media (prefers-color-scheme: dark) { :root { --ink: #e8eaed; --paper: #16181b; --muted: #a8adb4; --rule: #3a3f45; --link: #8ab4f8; } }
body { margin: 0; padding: 16px; background: var(--paper); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
a:link,
a:visited { color: var(--link); }
main { max-width: 60rem; margin: 0 auto; }
figure { margin: 1.5rem 0; }
img { max-width: 100%; height: auto; background: #ffffff; border: 1px solid var(--rule); }
pre { white-space: pre-wrap; overflow-wrap: anywhere; border-top: 1px solid var(--rule); padding-top: 1rem; }
.said { color: var(--muted); }
`;

const escaped = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The site of one parcel: its page, its stylesheet and the parcel's files. Anything but a parcel is refused. */
export function buildSite(parcel: Parcel): SiteFile[] {
  if (!isParcel(parcel))
    throw new TypeError('The web layer is built from a parcel only, never from a store or a note.');
  const m = parcel.manifest;
  const note = parcel.files.find((f) => f.type === 'text/markdown');
  const title = m.note.replace(/^.*\//, '').replace(/\.md$/i, '');
  const figures = m.graphs
    .filter((g) => parcel.files.some((f) => f.path === `${g}.svg`))
    .map(
      (g) =>
        `<figure><img src="${escaped(encodeURI(`${g}.svg`))}" alt="Picture of the graph ${escaped(g)}"><figcaption>${escaped(g)}</figcaption></figure>`,
    );
  const said = [
    `Shared under the setting ${m.setting} on ${m.date}.`,
    m.aiLabelled.length
      ? `${plural(m.aiLabelled.length, 'thing')} made with AI help ${m.aiLabelled.length === 1 ? 'is' : 'are'} labelled "${m.aiLabel}".`
      : '',
    m.left.length ? `${plural(m.left.length, 'thing')} left out by the setting's rules.` : '',
  ].filter(Boolean);
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CONTENT_POLICY}">
<meta name="referrer" content="no-referrer">
<title>${escaped(title)}</title>
<link rel="stylesheet" href="site.css">
</head>
<body>
<main>
<h1>${escaped(title)}</h1>
<p class="said">${escaped(said.join(' '))}</p>
${figures.join('\n')}
${note ? `<pre>${escaped(note.text)}</pre>` : ''}
<p class="said"><a href="${escaped(encodeURI(note?.path ?? ''))}">The note as text</a> · <a href="manifest.json">What was done to it</a></p>
</main>
</body>
</html>
`;
  return [
    { path: 'index.html', type: 'text/html', text: page },
    { path: 'site.css', type: 'text/css', text: STYLE },
    ...parcel.files.map((f) => ({ path: f.path, type: f.type, text: f.text })),
  ];
}
