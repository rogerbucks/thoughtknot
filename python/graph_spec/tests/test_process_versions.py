"""spec_process_versions — "A running process must keep the version of its process graph it started
on, unless the new version gives a mapping from old states to new" (editor spec §51): a running
instance keeps its old process after a change, and moves only by the stated mapping.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_process_versions
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.process import versions as pv  # noqa: E402
from graphspec.rules.plain_graph import Graph  # noqa: E402


def process(states, moves):
    """A flat process graph: the first state starts it. Generic test data."""
    nodes = {
        s: (frozenset(["State"]), {"id": s, "flow": "f", "initial": i == 0})
        for i, s in enumerate(states)
    }
    return Graph(nodes, [(a, "TRANSITION", b, {"event": e}) for a, e, b in moves])


V1 = process(["open", "done"], [("open", "go", "done")])
V2 = process(["open", "review", "done"], [("open", "go", "review"), ("review", "go", "done")])


def held(mapping=None):
    v = pv.Versions()
    v.add("1", V1)
    v.add("2", V2, {"1": mapping} if mapping is not None else None)
    return v


class ProcessVersions(unittest.TestCase):
    def test_a_new_version_changes_no_running_instance(self):
        v = held()
        inst = pv.start(v, "1")
        inst, _ = pv.step(v, inst, "go", {})
        self.assertEqual((inst.version, inst.conf), ("1", ("done",)))

    def test_an_instance_follows_the_rules_of_its_own_version(self):
        v = held({"open": "open", "done": "done"})
        old, new = pv.start(v, "1"), pv.start(v, "2")
        self.assertEqual(pv.step(v, old, "go", {})[0].conf, ("done",))
        self.assertEqual(pv.step(v, new, "go", {})[0].conf, ("review",))

    def test_it_moves_only_by_the_stated_mapping(self):
        v = held({"open": "open", "done": "done"})
        moved = pv.migrate(v, pv.start(v, "1"), "2")
        self.assertEqual((moved.version, moved.conf), ("2", ("open",)))

    def test_no_mapping_means_it_stays_and_the_reason_is_given(self):
        v = held()
        with self.assertRaisesRegex(ValueError, "gives no mapping from 1"):
            pv.migrate(v, pv.start(v, "1"), "2")

    def test_a_mapping_that_misses_a_state_is_refused(self):
        v = held({"done": "done"})
        with self.assertRaisesRegex(ValueError, "misses open"):
            pv.migrate(v, pv.start(v, "1"), "2")

    def test_a_mapping_to_a_state_the_new_version_lacks_is_refused(self):
        v = held({"open": "gone", "done": "done"})
        with self.assertRaisesRegex(ValueError, "does not hold"):
            pv.migrate(v, pv.start(v, "1"), "2")


if __name__ == "__main__":
    unittest.main()
