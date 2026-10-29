"""The Python library builds as a wheel that installs and reads a note (lib_github_release; API-6).

`uv build` makes the wheel from pyproject.toml. Installed in a fresh environment, with nothing of
the repository on its path, it imports each entry point and reads a block. The release workflow
builds it and attaches it beside the JavaScript packages, so pip installs the library from the
release.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_wheel
"""

import os
import shutil
import subprocess
import tempfile
import tomllib
import unittest
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.abspath(os.path.join(HERE, ".."))
ROOT = os.path.abspath(os.path.join(PROJECT, "..", ".."))
ENTRY_POINTS = ["gql_profile", "graph_bidi", "graph_rules", "graph_spec", "graph_svg"]
READ = (
    "import gql_profile as gp, graph_rules as gr\n"
    "st = gp.Store(); st.apply(\"// graph: g\\n(a:T {name: 'A'})\")\n"
    "print(len(gr.World.from_store(st)['g'].nodes))\n"
)

with open(os.path.join(PROJECT, "pyproject.toml"), "rb") as f:
    PYPROJECT = tomllib.load(f)
VERSION = PYPROJECT["project"]["version"]
WHEEL = f"graph_spec-{VERSION}-py3-none-any.whl"


@unittest.skipUnless(shutil.which("uv"), "uv builds the wheel")
class Wheel(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp()
        subprocess.run(
            ["uv", "build", "--wheel", "--out-dir", cls.dir],
            cwd=PROJECT,
            check=True,
            capture_output=True,
        )
        cls.wheel = os.path.join(cls.dir, WHEEL)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir, ignore_errors=True)

    def test_it_holds_each_entry_point_the_package_and_its_type_marker(self):
        names = set(zipfile.ZipFile(self.wheel).namelist())
        for m in ENTRY_POINTS:
            self.assertIn(f"{m}.py", names)
        self.assertIn("graph_svg.style.json", names)
        self.assertIn("graphspec/py.typed", names)
        self.assertFalse([n for n in names if "__pycache__" in n or n.startswith("tests/")])

    def test_installed_alone_it_reads_a_note(self):
        venv = os.path.join(self.dir, "venv")
        subprocess.run(["uv", "venv", "--quiet", venv], check=True, capture_output=True)
        python = os.path.join(venv, "bin", "python")
        subprocess.run(
            ["uv", "pip", "install", "--quiet", "--python", python, self.wheel],
            check=True,
            capture_output=True,
        )
        out = subprocess.run(
            [python, "-I", "-c", READ], cwd=self.dir, check=True, capture_output=True, text=True
        )
        self.assertEqual(out.stdout.strip(), "1")


class Release(unittest.TestCase):
    def test_the_release_builds_the_wheel_checksums_it_and_attaches_it(self):
        with open(
            os.path.join(ROOT, ".github", "workflows", "release.yml"), encoding="utf-8"
        ) as f:
            lines = f.read().split("\n")
        built = next(i for i, line in enumerate(lines) if "uv build --wheel" in line)
        sums = next(line for line in lines if "> SHA256SUMS" in line)
        create = next(i for i, line in enumerate(lines) if "gh release create" in line)
        wheel = '"graph_spec-$GITHUB_REF_NAME-py3-none-any.whl"'
        self.assertIn(wheel, sums)
        self.assertIn(wheel, lines[create])
        self.assertLess(built, create)

    def test_the_project_names_its_build(self):
        self.assertEqual(PYPROJECT["build-system"]["build-backend"], "hatchling.build")
        self.assertTrue(all("==" in r for r in PYPROJECT["build-system"]["requires"]), "pinned")


if __name__ == "__main__":
    unittest.main()
