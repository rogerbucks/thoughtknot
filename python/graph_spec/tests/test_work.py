"""Every pass that draws links counts its real work against its budget and stops at it (editor
spec §68, layout_work_counted), in the Python library as in the core (layout-work.test.js). Each
pass is given a small budget and a graph far past it, and never does more than it was given."""

import os
import random
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from graphspec.style.direct_bends import ToBend, bends, crowded  # noqa: E402
from graphspec.style.direct_curve import Placed  # noqa: E402
from graphspec.style.direct_links import _settle  # noqa: E402
from graphspec.style.work import WORK_MOST, Work  # noqa: E402


def graph(n: int, seed: int = 7):
    """`n` boxes in a loose grid and about twice as many links between them, the same each run."""
    rnd = random.Random(seed)
    side = int(n**0.5) + 1
    boxes = [
        Placed(f"n{i}", (i % side) * 160 + rnd.random() * 40, (i // side) * 90, 50, 18)
        for i in range(n)
    ]
    links = []
    for i in range(n * 2):
        a, b = rnd.choice(boxes), rnd.choice(boxes)
        if a is not b:
            links.append(ToBend(f"e{i}", a, b, 1 if rnd.random() < 0.5 else -1))
    return boxes, links


class WorkTest(unittest.TestCase):
    # proves: layout_work_counted
    def test_takes_steps_while_they_fit_and_never_past_its_most(self):
        w = Work(10)
        self.assertTrue(w.take(4))
        self.assertTrue(w.take(6))
        self.assertFalse(w.take(1))
        self.assertEqual(w.done, 10)

    # proves: layout_work_counted
    def test_bends_stops_at_its_budget_and_below_it_bends_as_it_did(self):
        boxes, links = graph(300)
        w = Work(50_000)
        bows = bends(links, boxes, w)
        self.assertLessEqual(w.done, w.most)
        self.assertGreater(w.done, w.most * 0.9)
        self.assertEqual(len(bows), len(links))
        few_boxes, few = graph(12)
        ample = Work(WORK_MOST["bends"])
        self.assertEqual(bends(few, few_boxes, ample), bends(few, few_boxes))
        self.assertLess(ample.done, ample.most)

    # proves: layout_work_counted
    def test_crowded_and_settle_stop_at_their_budgets(self):
        boxes, links = graph(300)
        w = Work(1000)
        self.assertTrue(crowded([(lk.a, lk.b) for lk in links], boxes, w))
        self.assertLessEqual(w.done, 1000)
        marks = [{"from": lk.a.key, "to": lk.b.key} for lk in links]
        s = Work(50_000)
        _settle(boxes, marks, s)
        self.assertLessEqual(s.done, s.most)
        self.assertGreater(s.done, s.most * 0.9)


if __name__ == "__main__":
    unittest.main()
