"""Direct links in the Python library (editor spec §25, untangle_direct): drawn as the core draws
them, each link one curve from box to box and the boxes moved aside, by default; any other routing
is Graphviz's own. Both libraries write the same SVG for the cases in direct_cases.json and
marks_cases.json, byte for byte (packages/core/test/direct-links-parity.test.js). These prove the
parts here, on marks written out by hand, with no Graphviz needed."""

import json
import os
import sys
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import graph_svg  # noqa: E402
import fake_dot  # noqa: E402
from graphspec.style import drawn_svg  # noqa: E402
from graphspec.style.direct_bends import CLEARANCE, GENTLE, aside  # noqa: E402
from graphspec.style.direct_curve import Placed, curve_of, hypot  # noqa: E402
from graphspec.style.direct_links import direct_links  # noqa: E402
from graphspec.style.marks_svg import layout_svg, num, to_fixed  # noqa: E402


def box(key: str, x: float, y: float) -> dict:
    """A thing's box 60 by 30 at (`x`, `y`), its top left."""
    return {"kind": "box", "id": f"t:{key}", "of": key, "role": "thing", "x": x, "y": y}


def marks_in_a_row() -> dict:
    """Three boxes in a row, and a link from the first to the last that runs through the middle
    one, with an arrowhead and words: laid out as Graphviz's straight lines would lay it out."""
    boxes = [
        {**box(k, x, 100), "width": 60, "height": 30, "style": "kind.0"}
        for k, x in (("a", 0), ("m", 120), ("c", 240))
    ]
    of = '["a","c"]'
    link = {
        "kind": "link",
        "id": f"e:{of}#0",
        "of": of,
        "from": "a",
        "to": "c",
        "points": [[60, 115], [230, 115]],
        "style": "link",
    }
    head = {
        "kind": "arrowhead",
        "id": f"head:e:{of}#0",
        "of": of,
        "x": 240,
        "y": 115,
        "angle": 0,
        "size": 10,
        "style": "link",
    }
    words = {
        "kind": "label",
        "id": f"l:e:{of}#0",
        "of": of,
        "x": 150,
        "y": 110,
        "size": 12,
        "text": "NEEDS",
        "anchor": "middle",
        "style": "text",
    }
    marks = [*boxes, link, head, words]
    parts = [{"kind": "graph", "id": "", "className": "", "title": "G", "marks": []}]
    for i, k in enumerate("amc", start=1):
        parts.append(
            {
                "kind": "node",
                "id": f"node{i}",
                "className": "node",
                "title": k,
                "marks": [f"t:{k}"],
            }
        )
    parts.append(
        {
            "kind": "edge",
            "id": "edge1",
            "className": "edge",
            "title": "a->c",
            "marks": [link["id"], head["id"], words["id"]],
        }
    )
    layout = {"pad": 0, "origin": [0, 400 * 0.75], "parts": parts}
    return {"space": {"width": 300, "height": 400}, "marks": marks, "layout": layout}


class DirectLinks(unittest.TestCase):
    def setUp(self):
        self.laid = marks_in_a_row()
        self.drawn = direct_links(self.laid)
        self.by_id = {m["id"]: m for m in self.drawn["marks"]}

    def test_a_box_a_link_runs_through_moves_aside_and_the_others_stay(self):
        m = self.by_id["t:m"]
        self.assertTrue(m["y"] + 30 + 10 <= 115 or m["y"] - 10 >= 115, m["y"])
        self.assertEqual((self.by_id["t:a"]["y"], self.by_id["t:c"]["y"]), (100, 100))

    def test_the_link_is_one_curve_from_box_edge_to_the_arrowhead_on_the_other(self):
        link, head = self.by_id['e:["a","c"]#0'], self.by_id['head:e:["a","c"]#0']
        self.assertTrue(link["curve"])
        self.assertEqual(len(link["points"]), 4)
        # from a's right edge to c's left one, wherever the room given to the boxes put them
        a, c = self.by_id["t:a"], self.by_id["t:c"]
        self.assertAlmostEqual(link["points"][0][0], a["x"] + a["width"])
        self.assertAlmostEqual(head["x"], c["x"])
        end = link["points"][3]
        self.assertAlmostEqual(hypot(end[0] - head["x"], end[1] - head["y"]), 10)

    def test_the_words_cover_no_box(self):
        words = self.by_id['l:e:["a","c"]#0']
        for k in "amc":
            b = self.by_id[f"t:{k}"]
            inside = b["x"] < words["x"] < b["x"] + 60 and b["y"] < words["y"] < b["y"] + 30
            self.assertFalse(inside, k)

    def test_the_same_each_time_and_the_layout_given_is_left_as_it_was(self):
        self.assertEqual(direct_links(marks_in_a_row()), self.drawn)
        self.assertEqual(self.laid, marks_in_a_row())

    def test_the_svg_keeps_every_part_in_order(self):
        svg = layout_svg(self.drawn)
        at = [svg.index(f'<g id="{p}"') for p in ("node1", "node2", "node3", "edge1")]
        self.assertEqual(at, sorted(at))
        self.assertIn("<title>a&#45;&gt;c</title>", svg)


class Numbers(unittest.TestCase):
    def test_numbers_are_written_as_javascript_writes_them(self):
        # Math.round(x * 100) / 100, a half up; toFixed from the exact value; hypot to the last bit
        self.assertEqual(
            [num(2.0), num(-0.001), num(0.125), num(-0.125)], ["2", "0", "0.13", "-0.12"]
        )
        self.assertEqual([to_fixed(10.5), to_fixed(0.125)], ["10.50", "0.13"])
        self.assertEqual(hypot(3, 4), 5)
        self.assertEqual(hypot(0, 0), 0)


class Routing(unittest.TestCase):
    def test_direct_is_drawn_from_the_layout_and_any_other_routing_is_graphvizs_own(self):
        asked = []

        def run(args, input, **_kw):
            asked.append(args[1])
            return mock.Mock(returncode=0, stdout=fake_dot.answer(args))

        with mock.patch.object(drawn_svg.subprocess, "run", run):
            for routing in (None, "direct"):
                self.assertIn('<g id="graph0"', drawn_svg.drawn_svg("dot", "digraph {}", routing))
            self.assertEqual(asked, ["-Tjson", "-Tjson"])
            for routing in ("straight", "right-angled"):
                self.assertEqual(drawn_svg.drawn_svg("dot", "digraph {}", routing), fake_dot.SVG)
            self.assertEqual(asked[2:], ["-Tsvg"] * 2)
            # curved is routed by our own router; laid out in no rows, it is Graphviz's own
            self.assertEqual(drawn_svg.drawn_svg("dot", "digraph {}", "curved"), fake_dot.SVG)
        self.assertEqual(asked[4:], ["-Tjson", "-Tsvg"])

    def test_links_drawn_direct_are_laid_out_straight(self):
        # curves_not_routed: Graphviz routes no curve only to have it thrown away
        handed = []

        def run(args, input, **_kw):
            handed.append(input)
            return mock.Mock(returncode=0, stdout=fake_dot.answer(args))

        with mock.patch.object(drawn_svg.subprocess, "run", run):
            drawn_svg.drawn_svg("dot", "digraph {\n  a -> b;\n}")
        self.assertIn("splines=line", handed[0])

    def test_a_layout_the_marks_cannot_give_back_is_graphvizs_own(self):
        lost = json.dumps(
            {
                "bb": "0,0,10,10",
                "objects": [
                    {"name": "a", "pos": "5,5", "_draw_": [{"op": "C", "color": "lightgrey"}]}
                ],
                "_subgraph_cnt": 0,
            }
        )

        def run(args, input, **_kw):
            return mock.Mock(returncode=0, stdout=lost if "-Tjson" in args else fake_dot.SVG)

        with mock.patch.object(drawn_svg.subprocess, "run", run):
            self.assertEqual(drawn_svg.drawn_svg("dot", "digraph {}"), fake_dot.SVG)

    def test_links_are_direct_unless_the_style_graph_chooses_a_routing(self):
        note = "// graph: g\n(a:Box {name: 'A'}), (b:Box {name: 'B'}),\n(a)-[:HOLDS]->(b)"
        style = "// graph: g_style · STYLE g\n(r1:Links {routing: 'curved'})"
        self.assertIsNone(graph_svg.render_args([note], "g")["routing"])
        self.assertEqual(graph_svg.render_args([note, style], "g")["routing"], "curved")


class BowsRoundABox(unittest.TestCase):
    """A link bows round a box in its way just far enough, as the core does (direct-bends.ts)."""

    def clearance(self, off: float) -> tuple[float, float]:
        a, b = Placed("a", 0, 0, 20, 10), Placed("b", 200, 0, 20, 10)
        c = Placed("c", 100, off, 20, 10)
        bow = aside(a, b, [c])
        mid = curve_of(a, b, bow).at(0.5)
        sign = 1 if off >= 0 else -1
        return sign * (off - sign * c.hh - mid[1]), bow

    def test_the_curve_clears_the_near_edge_by_about_clearance_wherever_the_box_sits(self):
        for off in (0, 5, -5):
            clear, _ = self.clearance(off)
            self.assertTrue(
                CLEARANCE - 0.5 <= clear < CLEARANCE + 6, f"off {off}: clears by {clear}"
            )

    def test_a_box_only_just_in_the_way_still_gets_the_gentle_bow_and_one_clear_of_it_none(self):
        self.assertEqual(abs(self.clearance(15)[1]), GENTLE)
        self.assertEqual(self.clearance(40)[1], 0)


if __name__ == "__main__":
    unittest.main()
