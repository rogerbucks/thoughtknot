// The note's folder in VS Code, as the tab and the AI command reach it (spec §41, vscode_plugin). Its files are read
// and written through VS Code's file system, as folder-calls.ts asks. A note open in a text editor is read from there,
// unsaved typing too. An edit goes in as a change to that text, then is saved, so VS Code's undo stays true.
import * as vscode from 'vscode';
import { word } from '@thoughtknot/core';
import type { FolderDisk } from './folder-calls.ts';

/** VS Code's word for "no file there", as the core and folder-calls.ts read it. */
const asNotThere = (e: unknown): unknown =>
  e instanceof vscode.FileSystemError && e.code === 'FileNotFound'
    ? Object.assign(new Error(e.message), { code: 'ENOENT' })
    : e;

/** The text editor's copy of the file at `uri`, when one is open. */
const openCopy = (uri: vscode.Uri) => vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());

/** The folder at `root`, through VS Code's file system, as folder-calls.ts asks it. */
export function vscodeDisk(root: vscode.Uri): FolderDisk {
  const fs = vscode.workspace.fs;
  const at = (path: string) => (path ? vscode.Uri.joinPath(root, ...path.split('/')) : root);
  const call = async <T>(run: () => PromiseLike<T>): Promise<T> => {
    try {
      return await run();
    } catch (e) {
      throw asNotThere(e);
    }
  };
  return {
    readText: async (path) => {
      const open = openCopy(at(path));
      if (open) return open.getText();
      // the byte order mark is kept, as the core's workspace storage asks
      return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await call(() => fs.readFile(at(path))));
    },
    writeText: async (path, text) => {
      const open = openCopy(at(path));
      if (!open) return call(() => fs.writeFile(at(path), new TextEncoder().encode(text)));
      const edit = new vscode.WorkspaceEdit();
      edit.replace(open.uri, new vscode.Range(open.positionAt(0), open.positionAt(open.getText().length)), text);
      if (!(await vscode.workspace.applyEdit(edit)) || !(await open.save())) throw new Error(word('server.no-answer'));
    },
    readBytes: (path) => call(() => fs.readFile(at(path))),
    // made as a temporary file, then moved to its name without overwriting: a name taken in between is an error
    createBytes: async (path, bytes) => {
      const temp = at(
        `${path}.${[...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16)).join('')}.tmp`,
      );
      await call(() => fs.writeFile(temp, bytes));
      try {
        await fs.rename(temp, at(path), { overwrite: false });
      } catch (e) {
        await Promise.resolve(fs.delete(temp)).catch(() => undefined);
        throw e instanceof vscode.FileSystemError && e.code === 'FileExists'
          ? Object.assign(new Error(e.message), { code: 'EEXIST' })
          : asNotThere(e);
      }
    },
    sizeOf: async (path) => (await call(() => fs.stat(at(path)))).size,
    delete: (path) => call(() => fs.delete(at(path))),
    readDirectory: (path) => call(() => fs.readDirectory(at(path))),
    createDirectory: (path) => call(() => fs.createDirectory(at(path))),
    typeOf: async (path) => {
      try {
        return (await fs.stat(at(path))).type;
      } catch (e) {
        if (asNotThere(e) !== e) return null;
        throw e;
      }
    },
  };
}

/** The note's folder and its path there: its workspace folder, or its own folder outside one. */
export function placeOf(uri: vscode.Uri): { folder: vscode.Uri; note: string } {
  const folder = vscode.workspace.getWorkspaceFolder(uri)?.uri ?? vscode.Uri.joinPath(uri, '..');
  return { folder, note: uri.path.slice(folder.path.replace(/\/$/, '').length + 1) };
}

/** The note `given`, or the one in the active editor; with no Markdown note, VS Code says so and gives none. */
export function noteOf(given?: unknown): vscode.Uri | null {
  const uri = given instanceof vscode.Uri ? given : vscode.window.activeTextEditor?.document.uri;
  if (uri && /\.md$/i.test(uri.path)) return uri;
  void vscode.window.showInformationMessage(word('vscode.open-a-note'));
  return null;
}
