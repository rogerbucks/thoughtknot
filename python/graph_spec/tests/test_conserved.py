"""spec_conserved — "A graph must be able to say which quantities must balance, so the checker can
test any domain" (editor spec §51): a declared quantity that does not balance is reported in any
domain.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_conserved
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.engine.conserved import conserved_problems  # noqa: E402
from graphspec.rules.plain_graph import Graph  # noqa: E402


def graph(rule, things):
    """A graph with one Conserved thing and the things it adds up. Generic data."""
    nodes = {"rule": (frozenset(["Conserved"]), {"id": "rule", **rule})}
    for i, label, props in things:
        nodes[i] = (frozenset([label]), {"id": i, **props})
    return Graph(nodes, [])


LEDGER = {"over": "Posting", "amount": "amount", "by": "txn"}
BALANCED = [
    ("p1", "Posting", {"txn": "t1", "amount": 100}),
    ("p2", "Posting", {"txn": "t1", "amount": -100}),
    ("p3", "Posting", {"txn": "t2", "amount": 0.1}),
    ("p4", "Posting", {"txn": "t2", "amount": -0.1}),
]


class Conserved(unittest.TestCase):
    def test_a_balanced_quantity_reports_nothing(self):
        self.assertEqual(conserved_problems(graph(LEDGER, BALANCED)), [])

    def test_a_group_that_does_not_balance_is_reported_with_its_sum(self):
        things = BALANCED + [("p5", "Posting", {"txn": "t3", "amount": 5})]
        found = conserved_problems(graph(LEDGER, things))
        self.assertEqual([(p["group"], p["sum"]) for p in found], [("t3", 5.0)])
        self.assertIn("adds to 5, not 0", found[0]["why"])

    def test_sums_are_exact_so_a_cent_does_not_drift(self):
        things = [("a", "Posting", {"amount": 0.1}), ("b", "Posting", {"amount": 0.2})]
        things.append(("c", "Posting", {"amount": -0.3}))
        rule = {"over": "Posting", "amount": "amount"}
        self.assertEqual(conserved_problems(graph(rule, things)), [])

    def test_the_same_check_works_in_another_domain(self):
        rule = {"over": "Move", "amount": "units", "by": "item", "total": 0}
        things = [
            ("m1", "Move", {"item": "bolt", "units": 40}),
            ("m2", "Move", {"item": "bolt", "units": -38}),
            ("m3", "Move", {"item": "nut", "units": 7}),
            ("m4", "Move", {"item": "nut", "units": -7}),
        ]
        found = conserved_problems(graph(rule, things))
        self.assertEqual([(p["group"], p["sum"]) for p in found], [("bolt", 2.0)])

    def test_a_total_other_than_zero_can_be_declared(self):
        rule = {"over": "Part", "amount": "share", "total": 1}
        ok = [("a", "Part", {"share": 0.25}), ("b", "Part", {"share": 0.75})]
        self.assertEqual(conserved_problems(graph(rule, ok)), [])
        bad = [("a", "Part", {"share": 0.25}), ("b", "Part", {"share": 0.5})]
        self.assertEqual(conserved_problems(graph(rule, bad))[0]["expected"], 1.0)

    def test_a_thing_with_no_number_is_reported_never_skipped(self):
        things = [("a", "Posting", {"amount": 1}), ("b", "Posting", {})]
        found = conserved_problems(graph({"over": "Posting", "amount": "amount"}, things))
        self.assertIn(
            ("b", "has no number in `amount`"), [(p.get("thing"), p["why"]) for p in found]
        )

    def test_a_rule_that_names_nothing_to_add_up_is_reported(self):
        found = conserved_problems(graph({"over": "Posting"}, []))
        self.assertEqual(found[0]["rule"], "rule")


if __name__ == "__main__":
    unittest.main()
