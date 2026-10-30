"""The Python library says which of its names are public, and which name does each JavaScript
export's work (spec §41, lib_public_api; risk API-7).

- Each entry point declares __all__: every public name it has, and no other.
- A name with a leading underscore stays importable for the vault (entry_points.json), but no
  test or conformance script uses one.
- js_parity.json maps each export of packages/graph-spec/src/graph-spec-check.js to the Python
  name that does its work, or says why Python has none.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_public_names
"""

import importlib
import json
import os
import re
import subprocess
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SRC = os.path.join(HERE, "..", "src")
sys.path.insert(0, SRC)

ENTRY_POINTS = ("gql_profile", "graph_rules", "graph_spec", "graph_svg", "graph_bidi")
CHECK = os.path.join(ROOT, "packages", "graph-spec", "src", "graph-spec-check.js")

with open(os.path.join(HERE, "js_parity.json"), encoding="utf-8") as f:
    TABLE = json.load(f)


def public(name):
    """The names an entry point offers: no underscore, no module, nothing from outside."""
    module = importlib.import_module(name)
    out = set()
    for n, v in vars(module).items():
        if n.startswith("_") or isinstance(v, types.ModuleType):
            continue
        if type(v).__name__ == "_Lazy":  # an optional package, imported when first used
            continue
        home = getattr(v, "__module__", None) if callable(v) else None
        if home is None or home == name or home.startswith("graphspec"):
            out.add(n)
    return out


def resolve(dotted):
    """The object a dotted name points at: the longest importable module, then attributes."""
    parts = dotted.split(".")
    for cut in range(len(parts) - 1, 0, -1):
        try:
            value = importlib.import_module(".".join(parts[:cut]))
        except ImportError:
            continue
        for attr in parts[cut:]:
            value = getattr(value, attr)
        return value
    raise ImportError(dotted)


def js_exports():
    script = "process.stdout.write(JSON.stringify(Object.keys(require(process.argv[1]))))"
    out = subprocess.run(
        ["node", "-e", script, CHECK], capture_output=True, text=True, check=True
    ).stdout
    return json.loads(out)


class EachEntryPointDeclaresItsNames(unittest.TestCase):
    def test_all_is_every_public_name_and_no_other(self):
        for name in ENTRY_POINTS:
            with self.subTest(name):
                declared = importlib.import_module(name).__all__
                self.assertEqual(len(declared), len(set(declared)), "each name once")
                self.assertEqual(sorted(set(declared) ^ public(name)), [])

    def test_no_declared_name_is_private_or_a_module(self):
        for name in ENTRY_POINTS:
            module = importlib.import_module(name)
            for n in module.__all__:
                self.assertFalse(n.startswith("_"), f"{name}.{n}")
                self.assertNotIsInstance(getattr(module, n), types.ModuleType, f"{name}.{n}")

    def test_the_names_the_vault_used_privately_have_public_twins(self):
        import graph_rules as gr
        import graph_svg

        self.assertIs(gr._word, gr.word)
        self.assertIs(gr._iso, gr.iso)
        self.assertIs(graph_svg._themed, graph_svg.themed)

    def test_no_test_or_conformance_script_uses_a_private_name(self):
        alias = r"\b(?:gp|gr|gs|svg|gql_profile|graph_rules|graph_spec|graph_svg|graph_bidi)"
        private = re.compile(alias + r"\._(?!_)\w+")
        found = []
        for folder in ("tests", os.path.join("conformance", "scripts")):
            path = os.path.join(HERE, "..", folder)
            for f in sorted(os.listdir(path)):
                if f.endswith(".py") and f != os.path.basename(__file__):
                    with open(os.path.join(path, f), encoding="utf-8") as text:
                        found += [f"{f}: {m}" for m in private.findall(text.read())]
        self.assertEqual(found, [])


class EachJavaScriptExportHasItsPythonName(unittest.TestCase):
    def test_the_table_names_every_export_and_no_other(self):
        self.assertEqual(sorted(TABLE), sorted(js_exports()))

    def test_each_python_name_is_there(self):
        for js, py in TABLE.items():
            with self.subTest(js):
                if isinstance(py, dict):
                    self.assertGreater(len(py["none"]), 20, "why Python has none")
                else:
                    self.assertIsNotNone(resolve(py))

    def test_a_name_in_an_entry_point_is_one_it_declares(self):
        for js, py in TABLE.items():
            if isinstance(py, str) and py.split(".")[0] in ENTRY_POINTS:
                module, name = py.split(".")[:2]
                self.assertIn(name, importlib.import_module(module).__all__, js)


if __name__ == "__main__":
    unittest.main()
