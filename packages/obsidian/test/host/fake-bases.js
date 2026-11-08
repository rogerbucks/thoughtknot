// A stand-in for Obsidian Bases, enough to open a plugin's Bases view in Node. It has the view's base class, its
// options as a .base file keeps them, and the notes a base picks. A test opens a view with `openBaseView`, and changes
// what it picks.

/** Bases' view base class and the plugin's registration, recording each view type in `state.basesViews`. */
export function fakeBases(state, Component) {
  state.basesViews = new Map();
  class BasesView extends Component {
    constructor(controller) {
      super();
      this.app = controller.app;
      this.config = controller.config;
      this.data = controller.data;
    }
  }
  const registerBasesView = (id, registration) => {
    state.basesViews.set(id, registration);
    return true;
  };
  return { BasesView, registerBasesView };
}

/** One view's entry in a .base file: its name and the values set on it, as Bases' `BasesViewConfig`. */
function fakeConfig(name, values) {
  return {
    name,
    values,
    get: (key) => values[key],
    set: (key, value) => {
      if (value === null) delete values[key];
      else values[key] = value;
    },
    getAsPropertyId: (key) => (typeof values[key] === 'string' ? values[key] : null),
  };
}

/**
 * Opens view type `id` over the notes at `paths`, in a container on the page. `values` are the view's settings as kept in
 * the .base file. Returns the view, its container, and `pick(paths)` that hands it new notes, as Bases does on a change.
 */
export function openBaseView(env, id, paths, values = {}) {
  const registration = env.state.basesViews.get(id);
  const entries = (ps) => ps.map((p) => ({ file: env.app.vault.getAbstractFileByPath(p) }));
  const controller = { app: env.app, config: fakeConfig('All notes', values), data: { data: entries(paths) } };
  const el = env.doc.body.createDiv();
  const view = registration.factory(controller, el);
  view.load();
  view.onDataUpdated();
  const pick = (ps) => {
    view.data = { data: entries(ps) };
    view.onDataUpdated();
  };
  return { view, el, pick, config: controller.config, registration };
}
