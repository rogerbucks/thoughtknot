"""Generated graphs for the axiom tests (editor spec §64, axioms_on_generated_graphs; GS8): the
twin of packages/graph-spec/test/axiom-graphs.mjs. graphs() makes graphs as plain data from a fixed
seed, so every run checks the same ones. text() writes one as a block the reader reads, and plant()
breaks one axiom in it. Every graph made here keeps every axiom until plant() breaks one.
smallest() finds a graph that fails a check and shrinks it, a thing at a time, to the smallest that
still fails. Only the standard library is used, so a plain install runs these tests too.
"""

import random

import gql_profile as gp
import graph_rules as gr

WORDS = ["almost-no-chance", "very-unlikely", "unlikely", "even-chance", "likely", "very-likely"]
IDS = ["a", "b", "c", "d", "e", "f", "g", "h"]
KINDS = ["Item", "Part"]
TYPES = ["OWNS", "USES"]
# the axioms one graph can break, and the ones plant() can write in a block
PLANTABLE = ["A1", "A2", "A3", "A4", "A7", "A8"]
IN_TEXT = ["A3", "A7", "A8"]

# the seed and the number of graphs, as the JavaScript tests' fast-check seed gives theirs
SEED = 20261028
RUNS = 2000
FEW = 300
_VALUES = [*range(-5, 6), "red", "blue", "it's", True, False]


def graph(rnd):
    """A graph as data: things (id, kind, a value or none, a likelihood range or none), links
    between them, and who supersedes whom (a forest: at most one successor each, always a later
    thing). schema says whether it declares its own kinds and link types."""
    ids = IDS[: rnd.randint(1, len(IDS))]
    things = []
    for i in ids:
        t = {"id": i, "kind": rnd.choice(KINDS)}
        if rnd.random() < 0.5:
            t["v"] = rnd.choice(_VALUES)
        if rnd.random() < 0.5:
            lo, hi = sorted((rnd.randint(0, 5), rnd.randint(0, 5)))
            t["likelihood"], t["likelihood_to"] = WORDS[lo], WORDS[hi]
        things.append(t)
    links = []
    for _ in range(rnd.randint(0, 10)):
        link = [rnd.choice(ids), rnd.choice(TYPES), rnd.choice(ids)]
        if link not in links:
            links.append(link)
    taken, supersedes = set(), []
    for i, item in enumerate(ids[:-1]):
        if rnd.random() < 0.5:
            continue
        succ = rnd.choice(ids[i + 1 :])
        if succ not in taken:
            taken.add(succ)
            supersedes.append([succ, item])
    return {
        "name": "g",
        "things": things,
        "links": links,
        "supersedes": supersedes,
        "schema": rnd.random() < 0.5,
    }


def graphs(n=RUNS, seed=SEED):
    """n graphs, the same ones on every run."""
    rnd = random.Random(seed)
    return [graph(rnd) for _ in range(n)]


def without(g, thing):
    """Graph g with one thing taken out, and its links and successions with it."""
    return {
        **g,
        "things": [t for t in g["things"] if t["id"] != thing],
        "links": [link for link in g["links"] if thing not in (link[0], link[2])],
        "supersedes": [s for s in g["supersedes"] if thing not in s],
    }


def shrink(g, fails):
    """The smallest graph got from g by taking out things that still fails: a thing at a time."""
    smaller = True
    while smaller and len(g["things"]) > 1:
        smaller = False
        for t in g["things"]:
            h = without(g, t["id"])
            if fails(h):
                g, smaller = h, True
                break
    return g


def smallest(fails, n=FEW):
    """The first generated graph that fails, shrunk, or None when none of n fails."""
    for g in graphs(n):
        if fails(g):
            return shrink(g, fails)
    return None


def _gql(v):
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, int):
        return str(v)
    return "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"


def text(g):
    """The graph as one block: its schema, when it has one, then its things and its links."""
    lines = []
    if g["schema"]:
        name = g["name"]
        lines.append(
            f"(meta:Meta:GraphMeta {{id: 'meta', graph: '{name}', schema: '{name}@1',"
            " owner_engine: 'e'})"
        )
        for k in KINDS:
            lines.append(
                f"(t_{k}:Meta:ElementType {{id: 't_{k}', kind: 'node', name: '{k}',"
                " origin: 'source'})"
            )
        for t in [*TYPES, "SUPERSEDES"]:
            lines.append(
                f"(t_{t}:Meta:ElementType {{id: 't_{t}', kind: 'edge', name: '{t}',"
                " origin: 'source', reading: 'r', reverse_name: 'rr'})"
            )
        for k in [*KINDS, *TYPES, "SUPERSEDES"]:
            lines.append(f"(meta)-[:DECLARES]->(t_{k})")
    for t in g["things"]:
        props = ", ".join(f"{k}: {_gql(v)}" for k, v in t.items() if k != "kind")
        lines.append(f"({t['id']}:{t['kind']} {{{props}}})")
    lines += [f"({a})-[:{ty}]->({b})" for a, ty, b in g["links"]]
    lines += [f"({s})-[:SUPERSEDES]->({i})" for s, i in g["supersedes"]]
    return f"// graph: {g['name']}\nINSERT\n" + ",\n".join(lines)


def world_of_text(block):
    """The world a block reads into."""
    st_ = gp.Store()
    st_.apply(block)
    return gr.World.from_store(st_)


def planted(g, axiom):
    """Graph g as data with axiom A3, A7 or A8 broken, by the smallest change that breaks it."""
    first = g["things"][0]["id"]
    if axiom == "A3":
        return {**g, "schema": True, "things": [*g["things"], {"id": "zz", "kind": "Stray"}]}
    if axiom == "A7":
        t0 = {**g["things"][0], "likelihood": WORDS[-1], "likelihood_to": WORDS[0]}
        return {**g, "things": [t0, *g["things"][1:]]}
    if axiom == "A8":
        things = [*g["things"], {"id": "y1", "kind": "Item"}, {"id": "y2", "kind": "Item"}]
        sup = [s for s in g["supersedes"] if s[1] != first] + [["y1", first], ["y2", first]]
        return {**g, "things": things, "supersedes": sup}
    raise ValueError(axiom)


def plant(g, axiom):
    """The world of graph g with one axiom broken. A1, A2 and A4 cannot be written in a block the
    reader takes, so they are made in the graph read."""
    if axiom in IN_TEXT:
        return world_of_text(text(planted(g, axiom)))
    w = world_of_text(text(g))
    old = w.graphs[g["name"]]
    nodes = {k: (labels, dict(p)) for k, (labels, p) in old.nodes.items()}
    edges = [(s, t, d, dict(p)) for s, t, d, p in old.edges]
    first = g["things"][0]["id"]
    if axiom == "A1":
        nodes[first + "_copy"] = nodes.pop(first)
        rename = {first: first + "_copy"}
        edges = [(rename.get(s, s), t, rename.get(d, d), p) for s, t, d, p in edges]
    elif axiom == "A2":
        edges.append((first, "OWNS", "nowhere", {}))
    elif axiom == "A4":
        nodes[first][1]["tags"] = ["x", "y"]
    w.graphs[g["name"]] = gr.Graph(nodes, edges)
    return w
