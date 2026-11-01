"""The Python reader brings a folder's pictures for readers up to date as the core's
reader-picture-folder.ts does (editor spec §62, picture_outside_tools). It places a new picture
beside its note and draws one again only when its fingerprint changed. It never writes over a file
it did not make. A picture it cannot draw now is kept, line and file.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_reader_picture_folder
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.reader import reader_picture as rp  # noqa: E402
from graphspec.reader.reader_picture_folder import folder_pictures  # noqa: E402

NOTE = "# Team\n\n```gql\n// graph: team\n(ann:Person {name: 'Ann'})\n```\n"
PICTURE = "Work/Team.team.thoughtknot.svg"


class Folder:
    """Files by path, and a drawing that counts its calls."""

    def __init__(self, files):
        self.files = dict(files)
        self.drawn = []

    def read(self, path):
        return self.files.get(path)

    def draw(self, note, text, graph, fingerprint):
        self.drawn.append(graph)
        return {"svg": f"<svg>{rp.picture_mark(fingerprint)}</svg>\n", "alt": f"Graph {graph}"}

    def run(self, add=False, draw=None):
        out = folder_pictures(sorted(self.files), self.read, draw or self.draw, add)
        for c in out["changes"]:
            if c["text"] is None:
                del self.files[c["path"]]
            else:
                self.files[c["path"]] = c["text"]
        return out


class FolderPictures(unittest.TestCase):
    # proves: picture_outside_tools
    def test_adds_keeps_and_redraws_a_picture_only_when_its_text_changed(self):
        f = Folder({"Work/Team.md": NOTE})
        self.assertEqual(f.run()["changes"], [], "no picture line: left alone")
        added = f.run(add=True)
        self.assertEqual(added["out_of_date"], [PICTURE, "Work/Team.md"])
        self.assertIn("![Graph team](Team.team.thoughtknot.svg)", f.files["Work/Team.md"])
        f.drawn.clear()
        self.assertEqual(f.run()["changes"], [])
        self.assertEqual(f.drawn, [], "a current picture is not drawn again")
        f.files["Work/Team.md"] = f.files["Work/Team.md"].replace("Ann", "Anna")
        self.assertEqual(f.run()["out_of_date"], [PICTURE])

    # proves: picture_outside_tools
    def test_never_writes_over_a_file_it_did_not_make_and_keeps_what_it_cannot_draw(self):
        f = Folder({"Work/Team.md": NOTE, PICTURE: "<svg>mine</svg>"})
        f.run(add=True)
        self.assertEqual(f.files[PICTURE], "<svg>mine</svg>")
        self.assertIn("(Team.team%201.thoughtknot.svg)", f.files["Work/Team.md"])
        before = dict(f.files)
        f.files["Work/Team.md"] = f.files["Work/Team.md"].replace("Ann", "Anna")
        before["Work/Team.md"] = f.files["Work/Team.md"]
        out = f.run(draw=lambda *_: "Graphviz (dot) is not installed")
        self.assertEqual(f.files, before, "line and file kept")
        self.assertIn("Graphviz (dot) is not installed", out["problems"][0])

    # proves: picture_outside_tools
    def test_a_picture_whose_block_is_gone_goes_line_and_file(self):
        f = Folder({"Work/Team.md": NOTE})
        f.run(add=True)
        f.files["Work/Team.md"] = f.files["Work/Team.md"].replace("// graph: team\n", "")
        f.run()
        self.assertNotIn(PICTURE, f.files)
        self.assertNotIn("thoughtknot.svg", f.files["Work/Team.md"])


if __name__ == "__main__":
    unittest.main()
