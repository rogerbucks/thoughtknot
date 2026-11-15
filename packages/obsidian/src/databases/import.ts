// Importing from a database (spec §20, db_import_on_request; §21, settings_db_connections). The database is a SQLite
// file in the vault, so nothing is set up and nothing reaches the network, on desktop and mobile alike. The command
// opens a dialog on the note in front. The user picks the file, which lists its tables, read on the device. Then the
// user names the graph and picks the tables and columns: no SQL is written and nothing is guessed. Nothing is written
// until Import is pressed. Then the rows go at the end of the note, as a graph block of text that keeps no live link.
import { Modal, Notice, Setting } from 'obsidian';
import type { TFile } from 'obsidian';
import { readInHostDirection } from '@thoughtknot/core/display/host';
import {
  columnsOf,
  documentBlock,
  documentText,
  importedBlock,
  isDbFile,
  isDocumentPlace,
  pickedLinks,
  pickedThings,
  sqliteEntries,
  sqliteTable,
  withImport,
  workbookSheets,
  workbookTable,
  word,
} from '@thoughtknot/core';
import type { DbRow, SqliteEntry, SqliteTable, WordKey } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';
import { noteToRewrite } from '../reading-view';
import { changeVaultNote } from '../storage/plugin-notes';

/** The command's id and name. */
export const IMPORT_COMMAND = {
  id: 'import-from-database',
  get name(): string {
    return word('host.command.import');
  },
};

/** Opens the import dialog on the note in front; or says why not: no database file is in the vault. */
export function importFromDatabase(plugin: ThoughtKnotPlugin): void {
  const files = plugin.app.vault
    .getFiles()
    .filter((f) => isDbFile(f.path) || isWorkbook(f.path) || isDocumentPlace(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (!files.length) {
    new Notice(word('db.none'));
    return;
  }
  // the rows are written into the note, so a note in reading view is refused, as any command that writes is
  const front = noteToRewrite(plugin.app.workspace, word('host.to-import'));
  if (front) new ImportDialog(plugin, front.file, files).open();
}

/** Whether a vault file is an Excel workbook, by its ending. */
const isWorkbook = (path: string): boolean => /\.xlsx$/i.test(path);

/** Today, as YYYY-MM-DD in the device's own time zone. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The dialog: the database file, the graph's name, and the tables and columns picked. Only Import writes. */
class ImportDialog extends Modal {
  private chosen = -1;
  private graph = '';
  private entries: SqliteEntry[] = [];
  /** A workbook's sheets, read once when it is chosen: the dialog then offers their columns as a database's. */
  private sheets = new Map<string, SqliteTable>();
  private bytes: Uint8Array | null = null;
  /** The file chosen is a Word document or a PDF: the dialog then only names the graph, and adds a linked block. */
  private doc = false;
  private refused = '';
  private things = '';
  private id = '';
  private kind = '';
  private links = '';
  private from = '';
  private to = '';
  private type = '';
  private typeName = '';
  private running = false;

  constructor(
    private readonly plugin: ThoughtKnotPlugin,
    private readonly file: TFile,
    private readonly files: TFile[],
  ) {
    super(plugin.app);
  }

  override onOpen(): void {
    readInHostDirection(this.modalEl);
    this.setTitle(word('import.title'));
    this.draw();
  }

  override onClose(): void {
    this.contentEl.empty();
  }

  /** The columns of table `name` as the file lists it; none when it is not read. */
  private columns(name: string): string[] {
    const sheet = this.sheets.get(name);
    if (sheet) return sheet.columns;
    const e = this.entries.find((x) => x.name === name && !x.unread);
    return e ? columnsOf(e.sql).columns : [];
  }

  /** The table `name` of the file chosen, whole; or why it cannot be read. */
  private table(name: string): SqliteTable | { refused: string } {
    return this.sheets.get(name) ?? sqliteTable(this.bytes ?? new Uint8Array(), name);
  }

  /** A row with a dropdown of `options`, the one `value` chosen; `none` adds a first choice of nothing. */
  private pick(
    name: WordKey,
    sentence: WordKey | '',
    options: string[],
    value: string,
    set: (v: string) => void,
    none = false,
  ) {
    new Setting(this.contentEl)
      .setName(word(name))
      .setDesc(sentence ? word(sentence) : '')
      .addDropdown((d) => {
        if (none) d.addOption('', word('import.none'));
        for (const o of options) d.addOption(o, o);
        d.setValue(value).onChange((v) => {
          set(v);
          this.draw();
        });
      });
  }

  /** Draws the dialog again from what is chosen, so each row offers only what the choice above it allows. */
  private draw(): void {
    const el = this.contentEl;
    el.empty();
    new Setting(el)
      .setName(word('import.file'))
      .setDesc(word('import.file.sentence'))
      .addDropdown((d) => {
        d.addOption('-1', word('import.file.choose'));
        for (const [i, f] of this.files.entries()) d.addOption(String(i), f.path);
        d.setValue(String(this.chosen)).onChange((v) => void this.choose(Number(v)));
      });
    if (this.refused) el.createDiv({ cls: 'thoughtknot-banner', attr: { role: 'alert' }, text: this.refused });
    if (!this.bytes) return;
    new Setting(el)
      .setName(word('import.graph'))
      .setDesc(word('import.graph.sentence'))
      .addText((t) =>
        t.setValue(this.graph).onChange((v) => {
          this.graph = v.trim();
        }),
      );
    if (this.doc) return this.drawDocument();
    const tables = this.entries.filter((e) => !e.unread).map((e) => e.name);
    this.pick('import.things', 'import.things.sentence', tables, this.things, (v) => {
      [this.things, this.id, this.kind] = [v, this.columns(v)[0] ?? '', ''];
    });
    const cols = this.columns(this.things);
    this.pick('import.id', 'import.id.sentence', cols, this.id, (v) => (this.id = v));
    this.pick('import.kind', 'import.kind.sentence', cols, this.kind, (v) => (this.kind = v), true);
    this.pick(
      'import.links',
      'import.links.sentence',
      tables,
      this.links,
      (v) => {
        const c = this.columns(v);
        [this.links, this.from, this.to, this.type] = [v, c[0] ?? '', c[1] ?? c[0] ?? '', ''];
      },
      true,
    );
    if (this.links) {
      const lc = this.columns(this.links);
      this.pick('import.from', '', lc, this.from, (v) => (this.from = v));
      this.pick('import.to', '', lc, this.to, (v) => (this.to = v));
      this.pick('import.type', 'import.type.sentence', lc, this.type, (v) => (this.type = v), true);
      if (!this.type)
        new Setting(el)
          .setName(word('import.type-name'))
          .setDesc(word('import.type-name.sentence'))
          .addText((t) =>
            t.setValue(this.typeName).onChange((v) => {
              this.typeName = v.trim();
            }),
          );
    }
    // a view or a table this reader cannot read is named with why, never offered as if it could be
    for (const e of this.entries.filter((x) => x.unread))
      el.createEl('p', { cls: 'setting-item-description', text: word('import.unread', { why: e.unread ?? '' }) });
    el.createEl('p', { text: word('import.copy') });
    new Setting(el)
      .addButton((b) =>
        b
          .setButtonText(word('import.run'))
          .setCta()
          .onClick(() => void this.run()),
      )
      .addButton((b) => b.setButtonText(word('import.cancel')).onClick(() => this.close()));
  }

  /** What a document offers: a name for its graph, and one button that adds the linked block to the note. */
  private drawDocument(): void {
    const el = this.contentEl;
    el.createEl('p', { text: word('import.document.copy') });
    new Setting(el)
      .addButton((b) =>
        b
          .setButtonText(word('import.document.run'))
          .setCta()
          .onClick(() => void this.addDocument()),
      )
      .addButton((b) => b.setButtonText(word('import.cancel')).onClick(() => this.close()));
  }

  /** Writes the block that draws the document chosen into the note; or says why nothing was written. */
  private async addDocument(): Promise<void> {
    const file = this.files[this.chosen];
    if (!file || !this.doc || this.running) return;
    this.running = true;
    try {
      const made = documentBlock(this.graph, file.path);
      if ('refused' in made) return void new Notice(word('import.failed', { file: file.basename, why: made.refused }));
      await changeVaultNote(this.app, this.file.path, (now) => withImport(now, made.block));
      new Notice(word('import.document.done', { graph: this.graph, file: file.path, note: this.file.basename }));
      this.close();
    } finally {
      this.running = false;
    }
  }

  /** Reads the file chosen, once, to list its tables; nothing is written. */
  private async choose(i: number): Promise<void> {
    this.chosen = i;
    this.bytes = null;
    this.entries = [];
    this.refused = '';
    this.doc = false;
    const db = this.files[i];
    if (db && isDocumentPlace(db.path)) {
      // a document is read once here, so a file that cannot be read is said now; the block that draws it reads it again
      const bytes = new Uint8Array(await this.app.vault.readBinary(db));
      const read = documentText(bytes, db.path);
      if ('refused' in read) this.refused = read.refused;
      else {
        [this.bytes, this.doc] = [bytes, true];
        this.graph = db.basename.replace(/\W+/g, '_').replace(/^(\d)/, '_$1');
      }
    } else if (db) {
      const bytes = new Uint8Array(await this.app.vault.readBinary(db));
      this.sheets = new Map();
      const listed = isWorkbook(db.path) ? this.readSheets(bytes) : sqliteEntries(bytes);
      if ('refused' in listed) this.refused = listed.refused;
      else [this.bytes, this.entries] = [bytes, listed];
      const first = this.entries.find((e) => !e.unread)?.name ?? '';
      [this.things, this.id, this.kind, this.links] = [first, this.columns(first)[0] ?? '', '', ''];
    }
    this.draw();
  }

  /** A workbook's sheets as the entries of a database, each read once; a sheet that cannot be read is listed with why. */
  private readSheets(bytes: Uint8Array): SqliteEntry[] | { refused: string } {
    const names = workbookSheets(bytes);
    if ('refused' in names) return names;
    return names.map((name, root) => {
      const t = workbookTable(bytes, name);
      if ('refused' in t) return { name, root, sql: '', unread: t.refused };
      this.sheets.set(name, { name, columns: t.header, rows: t.rows });
      return { name, root, sql: '' };
    });
  }

  /** Writes the rows of the tables picked into the note; or says why nothing was written. */
  private async run(): Promise<void> {
    const db = this.files[this.chosen];
    if (!db || !this.bytes || this.running) return;
    this.running = true;
    const failed = (why: string) => new Notice(word('import.failed', { file: db.basename, why }));
    try {
      const things = this.table(this.things);
      if ('refused' in things) return void failed(things.refused);
      const thingRows = pickedThings(things, this.id, this.kind || undefined);
      let linkRows: DbRow[] = [];
      if (this.links) {
        const links = this.table(this.links);
        if ('refused' in links) return void failed(links.refused);
        const type = this.type ? { column: this.type } : { name: this.typeName };
        linkRows = pickedLinks(links, this.from, this.to, type);
      }
      const made = importedBlock(this.graph, thingRows, linkRows, { file: db.basename, date: today() });
      if ('refused' in made) return void failed(made.refused);
      await changeVaultNote(this.app, this.file.path, (now) => withImport(now, made.block));
      new Notice(word('import.done', { graph: this.graph, file: db.basename, note: this.file.basename }));
      this.close();
    } finally {
      this.running = false;
    }
  }
}
