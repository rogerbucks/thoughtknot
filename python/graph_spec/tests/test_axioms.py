"""The graph spec's axioms (editor spec §64, axioms_checker and axioms_on_generated_graphs; GS8):
graphspec/rules/axioms.py.
Each break in packages/graph-spec/test/axiom-cases.json is found with its place, the axiom in its
words and a fix, under its code, as the JavaScript library finds it
(packages/graph-spec/test/axioms.test.mjs). The words here are the table's,
packages/graph-spec/src/axioms/axioms.json. On 2000 generated graphs (tests/axiom_graphs.py), every
axiom holds. A break planted in one is found, and shrinks to a graph of two things at most.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_axioms
"""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402
from graphspec.engine.mesh.same_as import same_as  # noqa: E402
from graphspec.rules.axioms import AXIOMS, axioms  # noqa: E402
from graphspec.rules.projection import canon, projects_back  # noqa: E402

import axiom_graphs as ag  # noqa: E402

import random  # noqa: E402


def _json(*parts):
    with open(os.path.join(ROOT, "packages", "graph-spec", *parts), encoding="utf-8") as f:
        return json.load(f)


CASES = _json("test", "axiom-cases.json")["cases"]
TABLE = _json("src", "axioms", "axioms.json")["axioms"]


def world_of(c):
    if "blocks" in c:
        st = gp.Store()
        for lines in c["blocks"]:
            st.apply("\n".join(lines))
        return gr.World.from_store(st)
    graphs = {}
    for name, g in c["graphs"].items():
        nodes = {
            n.get("key", n["props"]["id"]): (frozenset(n["labels"]), n["props"])
            for n in g["nodes"]
        }
        graphs[name] = gr.Graph(nodes, [tuple(e) for e in g["links"]])
    return gr.World(graphs)


class AxiomsChecker(unittest.TestCase):
    def test_each_case(self):
        for c in CASES:
            with self.subTest(c["name"]):
                self.assertEqual(axioms(world_of(c), c["graph"]), c["answer"])

    def test_the_words_are_the_tables(self):
        self.assertEqual(
            [(a, law, code, message, fix) for a, law, code, message, fix in AXIOMS],
            [(t["id"], t["plain"], t["code"], t["message"], t["fix"]) for t in TABLE],
        )

    def test_a_check_switched_off_finds_nothing(self):
        c = next(x for x in CASES if x["name"].startswith("A8"))
        self.assertTrue(axioms(world_of(c), c["graph"]))
        self.assertEqual(axioms(world_of(c), c["graph"], off=("A8",)), [])


class AxiomsOnGeneratedGraphs(unittest.TestCase):
    def test_every_generated_graph_keeps_every_axiom(self):
        for g in ag.graphs():
            self.assertEqual(axioms(ag.world_of_text(ag.text(g)), g["name"]), [], ag.text(g))

    def test_a_planted_break_is_found_and_names_only_its_axiom(self):
        for axiom in ag.PLANTABLE:
            for g in ag.graphs(ag.FEW):
                problems = axioms(ag.plant(g, axiom), g["name"])
                self.assertTrue(problems, axiom)
                self.assertEqual({p["axiom"] for p in problems}, {axiom})

    def test_a_planted_break_shrinks_to_two_things_at_most(self):
        for axiom in ag.PLANTABLE:
            g = ag.smallest(lambda g, axiom=axiom: bool(axioms(ag.plant(g, axiom), g["name"])))
            self.assertLessEqual(len(g["things"]), 2, axiom)

    def test_a4_same_text_same_graph(self):
        for g in ag.graphs(ag.FEW):
            one, two = ag.world_of_text(ag.text(g)), ag.world_of_text(ag.text(g))
            self.assertEqual(canon(one[g["name"]]), canon(two[g["name"]]))
            self.assertTrue(projects_back(one[g["name"]], g["name"]))

    def test_a5_same_as_makes_whole_connected_sets_in_any_order(self):
        ids = ["a", "b", "c", "d", "e", "f"]

        def ones(pairs):
            lines = [", ".join(f"({i}:Item {{id: '{i}'}})" for i in ids)]
            lines += [f"({ids[x]})-[:SAME_AS]->({ids[y]})" for x, y in pairs]
            return same_as(ag.world_of_text("// graph: g\nINSERT\n" + ",\n".join(lines)))["ones"]

        rnd = random.Random(ag.SEED)
        for _ in range(ag.FEW):
            pairs = [(rnd.randint(0, 5), rnd.randint(0, 5)) for _ in range(rnd.randint(0, 8))]
            sets = ones(pairs)
            where = {}
            for i, s in enumerate(sets):
                for x in s:
                    self.assertNotIn(x, where)
                    where[x] = i
            for x, y in pairs:
                self.assertEqual(where.get(f"g/{ids[x]}"), where.get(f"g/{ids[y]}"))
            for s in sets:
                reached, grew = {s[0]}, True
                while grew:
                    grew = False
                    for x, y in pairs:
                        a, b = f"g/{ids[x]}", f"g/{ids[y]}"
                        if (a in reached) != (b in reached):
                            reached |= {a, b}
                            grew = True
                self.assertEqual(sorted(reached), s)
            other = [(y, x) if rnd.random() < 0.5 else (x, y) for x, y in pairs]
            rnd.shuffle(other)
            self.assertEqual(ones(other), sets)


if __name__ == "__main__":
    unittest.main()
