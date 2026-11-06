"""The graph spec lists the library's operations and the shape of its problems (editor spec §51,
spec_library_api). requirements/graph-spec-library-api.json lists them. This holds the Python
library to it: each operation is there with the listed number of required arguments, and a problem
has the listed fields. The problem codes are held to a record that only grows. The JavaScript
library is held to the same file by test/public-api.test.js.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_library_api
"""

import importlib
import inspect
import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import gql_profile as gp  # noqa: E402


def load(*path):
    with open(os.path.join(ROOT, *path), encoding="utf-8") as f:
        return json.load(f)


API = load("requirements", "graph-spec-library-api.json")
TABLE = load("packages", "graph-spec", "src", "reader", "problem-codes.json")
RECORD = load("requirements", "graph-spec-problem-codes.json")


def resolve(path):
    """The function a dotted path names: a module, then names (a class and its method)."""
    names = path.split(".")
    obj = importlib.import_module(names[0])
    for name in names[1:]:
        obj = getattr(obj, name)
    return obj


def required(fn):
    """How many arguments a call must give: the parameters with no default, never self."""
    return sum(
        1
        for p in inspect.signature(fn).parameters.values()
        if p.default is inspect.Parameter.empty
        and p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)
        and p.name != "self"
    )


def parts(c):
    return sorted(set(re.findall(r"\{(\w+)\}", c["message"] + " " + c["fix"])))


class SpecLibraryApi(unittest.TestCase):
    def test_each_listed_operation_is_there_with_its_required_arguments(self):
        self.assertGreaterEqual(len(API["operations"]), 20)
        for op in API["operations"]:
            fn = resolve(op["py"])
            self.assertTrue(callable(fn), op["operation"])
            self.assertEqual(required(fn), op["required"], f"{op['operation']}: {op['py']}")

    def test_a_problem_has_the_listed_fields(self):
        with self.assertRaises(gp.ProfileError) as caught:
            gp.Store().apply("(a:T)")
        problem = caught.exception
        self.assertEqual(type(problem).__name__, API["problem"]["raised_as"])
        self.assertIsInstance(problem.line, int)
        self.assertIsInstance(problem.message, str)
        self.assertIsInstance(problem.fix, str)
        self.assertRegex(problem.code, r"^GN\d{3}$")
        self.assertEqual(list(API["problem"]["fields"]), ["line", "message", "fix", "at", "code"])

    def test_a_problem_code_is_never_reused(self):
        now = {c["code"]: c for c in TABLE["codes"]}
        for code, was in RECORD["codes"].items():
            if code in RECORD["retired"]:
                self.assertNotIn(code, now, f"{code} is retired and must not come back")
                continue
            self.assertIn(code, now, f"{code} is gone: list it under retired in the record")
            self.assertEqual(now[code]["section"], was["section"], code)
            self.assertEqual(parts(now[code]), was["parts"], code)
            self.assertEqual(now[code]["libraries"], was["libraries"], code)

    def test_a_code_added_to_the_table_is_added_to_the_record(self):
        for c in TABLE["codes"]:
            self.assertIn(c["code"], RECORD["codes"], c["code"])


if __name__ == "__main__":
    unittest.main()
