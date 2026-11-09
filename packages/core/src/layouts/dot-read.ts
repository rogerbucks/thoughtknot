// Reading a layout source (editor spec §53, layout_own_engine). The core writes each drawing as a DOT source. Our own
// measuring (measure.ts) reads it back here, with no Graphviz. It reads the attributes of the graph, each thing and
// each link, with the defaults in force where each is written. It reads the groups (clusters) and their things. It reads the DOT the
// core writes, which is a subset of the language: no ports, no `strict`, no edge to a subgraph. Host-free and pure.

/** Attributes by name, their values unquoted as DOT means them. An HTML label keeps its `<` and `>`. */
export type Attrs = Record<string, string>;

/** A thing of the source: its key, its attributes with the defaults in force, and the place it was first named. */
export interface DotNode {
  key: string;
  attrs: Attrs;
  order: number;
}

/** A link of the source, with the defaults in force where it is written. */
export interface DotEdge {
  tail: string;
  head: string;
  attrs: Attrs;
}

/** A subgraph: its name, its own attributes, the keys of the things in it, and the subgraphs inside it. */
export interface DotGroup {
  name: string;
  attrs: Attrs;
  members: string[];
  groups: DotGroup[];
}

/** A whole source: directed or not, its name, its graph attributes, things in order, links in order, top groups. */
export interface DotGraph {
  directed: boolean;
  name: string;
  attrs: Attrs;
  nodes: DotNode[];
  edges: DotEdge[];
  groups: DotGroup[];
}

type Token = { t: 'id'; v: string; html?: true } | { t: 'op'; v: string };

/** Why a source cannot be read: it is not the DOT the core writes. Its message is a code, never shown to a person. */
export class DotError extends Error {
  /** The text where reading stopped, when there is one. */
  readonly near: string;
  constructor(code: 'dot.unreadable' | 'dot.expected' | 'dot.unclosed', near = '') {
    super(code);
    this.near = near;
  }
}

/** The tokens of a source: names, numbers, quoted strings, HTML strings and the punctuation between them. */
function tokens(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i] as string;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
    else if (c === '/' && src[i + 1] === '/') while (i < n && src[i] !== '\n') i++;
    else if (c === '/' && src[i + 1] === '*') i = src.indexOf('*/', i + 2) < 0 ? n : src.indexOf('*/', i + 2) + 2;
    else if (c === '#' && (i === 0 || src[i - 1] === '\n')) while (i < n && src[i] !== '\n') i++;
    else if (c === '"') {
      let v = '';
      i++;
      while (i < n && src[i] !== '"') {
        // a quoted string keeps every escape but \" (and a line joined by a backslash), as Graphviz reads it
        if (src[i] === '\\' && src[i + 1] === '"') {
          v += '"';
          i += 2;
        } else if (src[i] === '\\' && src[i + 1] === '\n') i += 2;
        else v += src[i++];
      }
      i++;
      // "a" + "b" joins the two
      const last = out.at(-1);
      const before = out.at(-2);
      if (last?.t === 'op' && last.v === '+' && before?.t === 'id') {
        out.pop();
        before.v += v;
      } else out.push({ t: 'id', v });
    } else if (c === '<') {
      let depth = 0;
      const start = i;
      for (; i < n; i++) {
        if (src[i] === '<') depth++;
        else if (src[i] === '>' && --depth === 0) break;
      }
      out.push({ t: 'id', v: src.slice(start + 1, i), html: true });
      i++;
    } else if (c === '-' && (src[i + 1] === '>' || src[i + 1] === '-')) {
      out.push({ t: 'op', v: src.slice(i, i + 2) });
      i += 2;
    } else if ('{}[]=;,:+'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
    } else {
      const m = /^(-?(?:\d+\.?\d*|\.\d+)|[A-Za-z_\u0080-￿][\w\u0080-￿]*)/.exec(src.slice(i, i + 256));
      if (!m) throw new DotError('dot.unreadable', src.slice(i, i + 20));
      out.push({ t: 'id', v: m[1] as string });
      i += (m[1] as string).length;
    }
  }
  return out;
}

/** A reader of tokens: what comes next, a name, a mark taken, a list of attributes. */
function cursor(ts: Token[]) {
  let p = 0;
  const peek = () => ts[p];
  const isOp = (v: string) => ts[p]?.t === 'op' && ts[p]?.v === v;
  const skip = () => {
    p++;
  };
  const take = (v: string) => {
    if (!isOp(v)) throw new DotError('dot.expected', v);
    p++;
  };
  const id = (): string => {
    const tk = ts[p++];
    if (tk?.t !== 'id') throw new DotError('dot.expected');
    return tk.html ? `<${tk.v}>` : tk.v;
  };
  const attrList = (): Attrs => {
    const a: Attrs = {};
    while (isOp('[')) {
      p++;
      while (!isOp(']')) {
        const k = id();
        take('=');
        a[k] = id();
        if (isOp(',') || isOp(';')) p++;
      }
      p++;
    }
    return a;
  };
  return { peek, isOp, skip, take, id, attrList, atEnd: () => p >= ts.length };
}

/** Reads `src`, a DOT source as the core writes it. Throws DotError on what it cannot read. */
export function readDot(src: string): DotGraph {
  const { peek, isOp, skip, take, id, attrList, atEnd } = cursor(tokens(src));
  const head = id().toLowerCase();
  const directed = head === 'digraph' || (head === 'strict' && id().toLowerCase() === 'digraph');
  const name = peek()?.t === 'id' ? id() : '';
  const graph: DotGraph = { directed, name, attrs: {}, nodes: [], edges: [], groups: [] };
  const byKey = new Map<string, DotNode>();
  type Scope = { node: Attrs; edge: Attrs; graph: Attrs; group?: DotGroup; up?: Scope };
  const addMember = (scope: Scope, key: string) => {
    for (let s: Scope | undefined = scope; s; s = s.up)
      if (s.group && !s.group.members.includes(key)) s.group.members.push(key);
  };
  const node = (scope: Scope, key: string, attrs: Attrs = {}) => {
    let n = byKey.get(key);
    if (!n) {
      n = { key, attrs: { ...scope.node }, order: graph.nodes.length };
      byKey.set(key, n);
      graph.nodes.push(n);
    }
    Object.assign(n.attrs, attrs);
    addMember(scope, key);
    return n;
  };
  const body = (scope: Scope): void => {
    take('{');
    while (!isOp('}')) {
      if (atEnd()) throw new DotError('dot.unclosed');
      if (isOp(';')) {
        skip();
        continue;
      }
      if (isOp('{') || (peek()?.t === 'id' && peek()?.v.toLowerCase() === 'subgraph')) {
        sub(scope);
        continue;
      }
      const first = id();
      const word = first.toLowerCase();
      if ((word === 'graph' || word === 'node' || word === 'edge') && isOp('[')) {
        Object.assign(scope[word], attrList());
        if (word === 'graph') Object.assign(scope.group ? scope.group.attrs : graph.attrs, scope.graph);
      } else if (isOp('=')) {
        skip();
        const v = id();
        scope.graph[first] = v;
        (scope.group ? scope.group.attrs : graph.attrs)[first] = v;
      } else if (isOp('->') || isOp('--')) {
        const chain = [first];
        while (isOp('->') || isOp('--')) {
          skip();
          chain.push(id());
        }
        const attrs = attrList();
        chain.forEach((k) => node(scope, k));
        for (let i = 1; i < chain.length; i++)
          graph.edges.push({
            tail: chain[i - 1] as string,
            head: chain[i] as string,
            attrs: { ...scope.edge, ...attrs },
          });
      } else node(scope, first, attrList());
      if (isOp(';') || isOp(',')) skip();
    }
    skip();
  };
  const sub = (scope: Scope) => {
    let subName = '';
    if (!isOp('{')) {
      skip(); // subgraph
      if (!isOp('{')) subName = id();
    }
    const group: DotGroup = { name: subName, attrs: {}, members: [], groups: [] };
    const inner: Scope = { node: { ...scope.node }, edge: { ...scope.edge }, graph: {}, group, up: scope };
    body(inner);
    if (subName.startsWith('cluster')) (scope.group ? scope.group.groups : graph.groups).push(group);
    else if (scope.group) {
      // a plain subgraph (a rank) holds no box of its own: its things stay in the group around it
      scope.group.groups.push(...group.groups);
    } else graph.groups.push(...group.groups);
  };
  body({ node: {}, edge: {}, graph: {} });
  return graph;
}
