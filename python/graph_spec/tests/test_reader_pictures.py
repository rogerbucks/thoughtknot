"""The Python reader's command line for pictures for readers (editor spec §62,
picture_outside_tools, picture_same_everywhere). It draws with its own Graphviz, in the light
theme's fixed colours, and marks each picture with the fingerprint the apps give it. Its check
writes nothing and fails while a picture is out of date. Graphviz is stood in for here.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_reader_pictures
"""

import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)

import fake_dot  # noqa: E402
import graph_svg  # noqa: E402
import reader_pictures  # noqa: E402
from graphspec.reader import reader_picture as rp  # noqa: E402

NOTE = (
    "# Team\n\n```gql\n// graph: team\n(ann:Person {name: 'Ann'}),\n"
    "(bob:Person {name: 'Bob'}),\n(ann)-[:ASKS]->(bob)\n```\n"
)
# What Graphviz draws, as graph_svg hands it on: a box in a theme's colours
DRAWN = (
    '<svg width="300pt" height="100pt" viewBox="0.00 0.00 300.00 100.00">'
    '<path fill="#000001" stroke="#000002" d="M0,0"/></svg>'
)


def dot(args, input, **_kw):
    return mock.Mock(returncode=0, stdout=fake_dot.LAYOUT if "-Tjson" in args else DRAWN)


class Drawing(unittest.TestCase):
    # proves: picture_same_everywhere
    def test_colours_are_fixed_and_the_picture_names_itself_with_the_shared_fingerprint(self):
        themed = (
            'style="fill:rgba(var(--color-blue-rgb), 0.16);'
            'stroke:color-mix(in srgb, var(--color-pink) 75%, var(--text-normal))" '
            'fill="var(--text-muted)"'
        )
        self.assertEqual(
            reader_pictures.fixed_light(themed),
            'style="fill:#d7e8fa;stroke:#a8336c" fill="#5c5c5c"',
        )
        svg = reader_pictures.framed(DRAWN, "0123456789abcdef", "team", "A & B", "Drawn")
        self.assertEqual(rp.picture_state(svg, "0123456789abcdef"), "current")
        self.assertIn("<desc>A &amp; B</desc>", svg)
        self.assertIn('viewBox="0.00 0.00 300.00 120.00"', svg, "room for the foot")
        self.assertEqual(reader_pictures.said_date("2026-10-30"), "30 Oct 2026")

    # proves: picture_outside_tools
    def test_the_command_line_refreshes_a_folder_and_its_check_fails_on_one_out_of_date(self):
        root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, root)
        os.makedirs(os.path.join(root, "Work"))
        note, picture = (
            os.path.join(root, "Work", n) for n in ("Team.md", "Team.team.thoughtknot.svg")
        )
        with open(note, "w", encoding="utf-8") as f:
            f.write(NOTE)
        said = []
        with (
            mock.patch.object(graph_svg, "DOT", "dot"),
            mock.patch.object(graph_svg.subprocess, "run", dot),
        ):
            self.assertEqual(reader_pictures.reader_pictures(root, add=True, say=said.append), 0)
            with open(picture, encoding="utf-8") as f:
                drawn = f.read()
            self.assertNotIn("var(--", drawn)
            self.assertIn("Drawn by ThoughtKnot from Work/Team.md", drawn)
            with open(note, encoding="utf-8") as f:
                text = f.read()
            self.assertIn(
                "![Graph team: 2 things, 1 link. Ann is a Person. Bob is a Person. Ann asks Bob.]"
                "(Team.team.thoughtknot.svg)",
                text,
            )
            self.assertEqual(reader_pictures.reader_pictures(root, check=True, say=said.append), 0)
            with open(note, "w", encoding="utf-8") as f:
                f.write(text.replace("'Bob'", "'Robert'"))
            self.assertEqual(reader_pictures.reader_pictures(root, check=True, say=said.append), 1)
            self.assertIn("out of date: Work/Team.team.thoughtknot.svg", said)
            with open(picture, encoding="utf-8") as f:
                self.assertEqual(f.read(), drawn, "the check writes nothing")


if __name__ == "__main__":
    unittest.main()
