"""Both readers give the same answer to statements made from one grammar (spec §51, spec_grammar;
risk ARCH-5).

The JavaScript reader and this library's are kept by hand, each to its own code. The listed cases
catch a drift only where a case was written for it. Here statements are made at random from one
small grammar, packages/graph-spec/test/statement-grammar.json, and some are mutated: a character
dropped, doubled or swapped, or the end cut off. Each block is read by both readers. Both must
refuse it with the same code on the same line, or read it to the same canonical graph.

A pull request reads a few hundred blocks from a fixed seed, so a failure there is the same on
every run. The nightly readers-agree workflow reads many more, from a seed it takes from the date,
and a failure names the seed and the block, so it can be read again by hand.

Usage:
  cd python/graph_spec && uv run --locked python -m unittest tests.test_readers_agree
  GRAPH_SPEC_FUZZ_SEED=20261029 GRAPH_SPEC_FUZZ_COUNT=5000 uv run --locked python -m unittest \
    tests.test_readers_agree
"""

import json
import os
import random
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GRAMMAR = os.path.join(ROOT, "packages", "graph-spec", "test", "statement-grammar.json")
CHECK = os.path.join(ROOT, "packages", "graph-spec", "src", "graph-spec-check.js")
sys.path.insert(0, os.path.join(HERE, "..", "src"))

import gql_profile as gp  # noqa: E402
import graph_rules as gr  # noqa: E402

SEED = int(os.environ.get("GRAPH_SPEC_FUZZ_SEED", "1"))
COUNT = int(os.environ.get("GRAPH_SPEC_FUZZ_COUNT", "300"))
DEPTH = 6


def make(grammar, rng, part="", depth=0):
    """One text from the grammar, from the rule `part` (its start when none). Past DEPTH, each
    rule takes its first choice, the shortest, so every text ends."""
    rules, pools = grammar["rules"], grammar["pools"]
    part = part or grammar["start"]
    if part in pools:
        return rng.choice(pools[part])
    if part not in rules:
        return part
    choices = rules[part]
    choice = choices[0] if depth >= DEPTH else rng.choice(choices)
    return "".join(make(grammar, rng, p, depth + 1) for p in choice)


def mutate(text, rng):
    """The text with one small fault: a character dropped, doubled or swapped, or the end cut."""
    i = rng.randrange(len(text))
    kind = rng.randrange(4)
    if kind == 0:
        return text[:i] + text[i + 1 :]
    if kind == 1:
        return text[:i] + text[i] + text[i:]
    if kind == 2 and i + 1 < len(text):
        return text[:i] + text[i + 1] + text[i] + text[i + 2 :]
    return text[: max(i, 1)]


def blocks(grammar, seed, count):
    """`count` blocks from the seed, every third one mutated."""
    rng = random.Random(seed)
    out = []
    for n in range(count):
        text = make(grammar, rng)
        out.append(mutate(text, rng) if n % 3 == 2 else text)
    return out


def python_reads(block):
    """This library's answer: the refusal's code and line, or each graph's canonical form."""
    try:
        st = gp.Store()
        st.apply(block)
        world = gr.World.from_store(st)
        return {"graphs": {g: gr.canon(world[g]) for g in sorted(st.graphs)}}
    except gp.ProfileError as e:
        return {"refused": [e.code, e.line]}
    except Exception as e:  # noqa: BLE001 - a crash is an answer the other reader must give too
        return {"crashed": True, "why": f"{type(e).__name__}: {e}"}


JS = """
const C = require(process.argv[1]);
const out = JSON.parse(require('fs').readFileSync(0, 'utf8')).map((block) => {
  try {
    const store = C.read([block]);
    const world = C.worldFromStore(store);
    const graphs = {};
    for (const g of Object.keys(store.graphs).sort()) graphs[g] = C.canon(world[g]);
    return { graphs };
  } catch (e) {
    if (e instanceof C.ProfileError) return { refused: [e.code ?? null, e.line] };
    return { crashed: true, why: String((e && e.stack) || e) };
  }
});
process.stdout.write(JSON.stringify(out));
"""


def javascript_reads(texts):
    """The JavaScript reader's answers to every block, by one run of Node."""
    out = subprocess.run(
        ["node", "-e", JS, CHECK],
        input=json.dumps(texts),
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)


def compared(answer):
    """An answer as both readers can give it: a crash's own words differ by language."""
    return {"crashed": True} if answer.get("crashed") else answer


class ReadersAgree(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(GRAMMAR, encoding="utf-8") as f:
            cls.grammar = json.load(f)

    def test_the_grammar_makes_blocks_both_read_and_both_refuse(self):
        texts = blocks(self.grammar, 7, 60)
        answers = [python_reads(t) for t in texts]
        self.assertTrue(any("graphs" in a for a in answers), "the control: some blocks are read")
        self.assertTrue(any("refused" in a for a in answers), "and some refused")
        self.assertEqual(blocks(self.grammar, 7, 60), texts, "one seed, the same blocks")

    def test_every_block_is_read_alike_by_both_readers(self):
        # a plain loop, never subTest: the tests-first replay counts a test by its own result
        texts = blocks(self.grammar, SEED, COUNT)
        for n, (text, js) in enumerate(zip(texts, javascript_reads(texts), strict=True)):
            py = python_reads(text)
            self.assertEqual(
                compared(js),
                compared(py),
                f"seed {SEED}, block {n}: the readers differ on\n{text}\nJavaScript: {js}\n"
                f"Python: {py}",
            )

    def test_the_nightly_reads_many_more_from_the_date(self):
        with open(
            os.path.join(ROOT, ".github", "workflows", "readers-agree.yml"), encoding="utf-8"
        ) as f:
            workflow = f.read()
        self.assertIn("schedule:", workflow)
        self.assertIn('GRAPH_SPEC_FUZZ_SEED="${SEED:-$(date -u +%Y%m%d)}"', workflow)
        self.assertIn("GRAPH_SPEC_FUZZ_COUNT=20000", workflow)
        self.assertIn("python -m unittest tests.test_readers_agree", workflow)

    def test_a_divergence_is_named_by_its_seed_and_block(self):
        texts = blocks(self.grammar, SEED, 3)
        self.assertEqual(blocks(self.grammar, SEED, 3), texts)
        self.assertEqual(mutate("abc", random.Random(0)), mutate("abc", random.Random(0)))


if __name__ == "__main__":
    unittest.main()
