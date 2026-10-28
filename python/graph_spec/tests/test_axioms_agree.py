"""The two readers agree on generated graphs (editor spec §64, axioms_readers_agree; GS8). The same
generated graphs (tests/axiom_graphs.py) go to both readers: as they are, and with A3,
A7 or A8 broken in their text. Each reader gives the same things, links, ids, the same-as sets and
the broken axioms. The JavaScript library answers them all in one run of Node.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_axioms_agree
"""

import json
import os
import shutil
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

from graphspec.engine.mesh.same_as import same_as  # noqa: E402
from graphspec.rules.axioms import axioms  # noqa: E402
from graphspec.rules.projection import canon  # noqa: E402

import axiom_graphs as ag  # noqa: E402

# what the JavaScript library answers for each block, read from stdin as a JSON list
NODE = """
const C = require(process.argv[1] + '/packages/graph-spec/src/graph-spec-check.js');
const blocks = JSON.parse(require('fs').readFileSync(0, 'utf8'));
console.log(JSON.stringify(blocks.map((b) => {
  const s = new C.Store(); s.apply(b); const w = C.worldFromStore(s);
  return {things: [...w.g.nodes.keys()].sort(), links: w.g.edges.length, canon: C.canon(w.g),
          ones: C.sameAs(w).ones, axioms: C.axioms(w, 'g')};
})));
"""


def answer(block):
    """What this library answers for a block."""
    w = ag.world_of_text(block)
    g = w["g"]
    return {
        "things": sorted(g.nodes),
        "links": len(g.edges),
        "canon": canon(g),
        "ones": same_as(w)["ones"],
        "axioms": axioms(w, "g"),
    }


@unittest.skipUnless(shutil.which("node"), "the JavaScript reader needs Node")
class ReadersAgree(unittest.TestCase):
    def test_both_readers_give_the_same_answers_on_the_same_generated_graphs(self):
        blocks = []
        for g in ag.graphs(ag.FEW):
            blocks.append(ag.text(g))
            blocks.extend(ag.text(ag.planted(g, a)) for a in ag.IN_TEXT)
        self.assertGreaterEqual(len(blocks), 1000)
        js = json.loads(
            subprocess.run(
                ["node", "-e", NODE, ROOT],
                input=json.dumps(blocks),
                capture_output=True,
                text=True,
                check=True,
            ).stdout
        )
        broken = set()
        for block, theirs in zip(blocks, js, strict=True):
            ours = answer(block)
            self.assertEqual(ours, theirs, block)
            broken |= {p["axiom"] for p in ours["axioms"]}
        self.assertEqual(broken, set(ag.IN_TEXT), "every axiom planted in text is found by both")


if __name__ == "__main__":
    unittest.main()
