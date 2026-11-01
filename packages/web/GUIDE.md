# The web layer: where things live

Web presentation, as a separate and secure layer (editor spec §40, web_layer_separate). It is hosted where the owner
chooses, apart from the stores on each device.

- **Built from a parcel alone.** A parcel is what crossed the boundary (packages/boundary). The web layer never takes
  a store, a key or a synced note, so nothing a device keeps can reach the web.
- **Static files only.** `buildSite` gives a page, its stylesheet and the parcel's own files. No server runs.
- **Host it anywhere you control:** your own domain, GitHub Pages, a SharePoint library or a plain folder.
- **Read-only and safe.** The page runs no script. Its content policy loads only its own files, so it fetches nothing
  from elsewhere and works offline once copied.
- **What the note says is shown as text,** never as markup.

## The tests

- `test/web-layer.test.js`: the site serves the view with no store behind it. No sealed record or hidden name reaches
  it, and anything but a parcel is refused. It holds no script, starts no server and loads nothing from elsewhere.
