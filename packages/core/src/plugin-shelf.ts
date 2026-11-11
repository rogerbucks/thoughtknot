// The shelves a plug-in registry keeps what each point adds on (editor spec ES§43, plugin_interface). Each plug-in's
// additions wait on a shelf of their own until all of them are accepted, then move onto the registry's.

/** What a plug-in adds to one point, kept aside until all it adds has been accepted. */
export interface Shelf<T> {
  items: T[];
  owner: Map<string, string>;
  /** What each is named by on its point, such as a command's `id`. */
  key: keyof T;
}

/** An empty shelf, its items named by `key`. */
export const shelf = <T>(key: keyof T): Shelf<T> => ({ items: [], owner: new Map(), key });
/** The name `t` is kept under on `s`. */
export const nameOf = <T>(s: Shelf<T>, t: T) => String(t[s.key]);
/** Moves what a plug-in added onto the registry's own shelf, once all of it was accepted. */
export const keep = <T>(from: Shelf<T>, to: Shelf<T>, plugin: string) => {
  for (const t of from.items) {
    to.items.push(t);
    to.owner.set(nameOf(to, t), plugin);
  }
};
