"""TRUST-6 (security_fix_rule): a fill recipe reads only inside its folder, and names only plain
ids. A recipe naming a file through ../ or a link out of the vault or the standards folder is
refused. So is a graph, basis, judgement or state holding a quote or other query syntax, before any
query is made.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_fill_contained
"""

import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import graph_spec as gs  # noqa: E402
from test_fill import DOCUMENT, RECIPES  # noqa: E402


class FillContained(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.TemporaryDirectory()
        self.vault = os.path.join(self.root.name, "vault")
        self.std = os.path.join(self.root.name, "standards")
        os.makedirs(self.vault)
        os.makedirs(self.std)
        with open(os.path.join(self.root.name, "secret.md"), "w", encoding="utf-8") as f:
            f.write("## H\n```gql\n// graph: g\n```\n")
        with open(os.path.join(self.vault, "own.txt"), "wb") as f:
            f.write(b"kept")

    def tearDown(self):
        self.root.cleanup()

    def refused(self, recipe):
        with self.assertRaisesRegex(ValueError, "refused"):
            gs.compute(recipe, DOCUMENT, self.std, self.vault)

    def test_a_file_inside_the_vault_is_read(self):
        self.assertTrue(
            gs.compute({"ni": "own.txt"}, DOCUMENT, self.std, self.vault).startswith("ni:")
        )

    def test_a_file_named_through_dot_dot_is_refused(self):
        self.refused({"ni": "../secret.md"})
        self.refused({"ni": os.path.join(self.root.name, "secret.md")})
        self.refused({"load": ["../secret#H"], "state_of": "g"})

    def test_a_link_out_of_the_folder_is_refused(self):
        os.symlink(os.path.join(self.root.name, "secret.md"), os.path.join(self.vault, "link.md"))
        os.symlink(os.path.join(self.root.name, "secret.md"), os.path.join(self.std, "link.md"))
        self.refused({"ni": "link.md"})
        self.refused({"load": ["link#H"], "state_of": "g"})

    def test_an_id_with_query_syntax_is_refused(self):
        for key, bad in (
            ("basis", "lisbon'}) DETACH DELETE (x) //"),
            ("graph", "jud_d1 x"),
            ("judgement", "d2'"),
            ("state_of", "{g}"),
        ):
            recipe = dict(RECIPES["BASIS"] if key in ("basis", "graph") else RECIPES["JUDGEMENT"])
            if key == "state_of":
                recipe = dict(RECIPES["STATE"])
            recipe[key] = bad
            self.refused(recipe)


if __name__ == "__main__":
    unittest.main()
