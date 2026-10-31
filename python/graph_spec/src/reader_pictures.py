#!/usr/bin/env python3
"""The Python reader's pictures for readers (editor spec §62, picture_outside_tools,
picture_same_everywhere): it brings every picture in a folder or a repository up to date, or with
--check only says which are not, and fails. It draws with graph_svg, the Python reader's own
Graphviz. So its pictures look as the vault's drawings look, not byte for byte as the apps' do
(Roger, 30 Oct 2026: same identity, not bytes). What they share is the identity: the file name,
the image line and the fingerprint of the text drawn from. A picture is redrawn only when that
fingerprint changes. So the apps, the Node command line and this one never take turns rewriting
it. Its colours are the light theme's, fixed, on a white page, as the apps draw a picture. A graph
of more than 300 things is left as it is: the apps draw it as its overview.

Usage:
  python3 python/graph_spec/src/reader_pictures.py <folder> [--add] [--check]

Writes: the pictures and the notes' image lines in <folder>, unless --check.
"""

from __future__ import annotations

import datetime
import html
import math
import os
import re
import sys
from collections.abc import Callable

import graph_svg
from graphspec.reader.reader_picture import gql_spans, picture_alt, picture_mark
from graphspec.reader.reader_picture_folder import Drawn, FolderRun, folder_pictures

# Obsidian's default light theme, as the core's THEME_COLOURS.light holds it (palette.ts). The
# shared table packages/core/test/reader-picture-cases.json holds both to the same values.
LIGHT = {
    "page": "#ffffff",
    "text": "#222222",
    "muted": "#5c5c5c",
    "red": "#e93147",
    "orange": "#ec7500",
    "yellow": "#e0ac00",
    "green": "#08b94e",
    "cyan": "#00bfbc",
    "blue": "#086ddd",
    "purple": "#7852ee",
    "pink": "#d53984",
}
# The most things a picture draws one by one (reader-picture.ts, PICTURE_MOST_THINGS).
MOST_THINGS = 300
# The months as a picture's foot names them (export-frame.ts, saidDate).
MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
# The height of the foot, in the drawing's points, and the size of its words.
FOOT, FOOT_SIZE = 20, 9
_SKIPPED = {"node_modules"}


def mixed(a: str, b: str, p: float) -> str:
    """color-mix(in srgb, a p, b): each channel mixed as stored, rounded to a byte, as palette.ts
    mixes it (half rounds up, as JavaScript's Math.round does)."""

    def channels(c):
        return [int(c[i : i + 2], 16) for i in (1, 3, 5)]

    out = (math.floor(x * p + y * (1 - p) + 0.5) for x, y in zip(channels(a), channels(b)))
    return "#" + "".join(f"{v:02x}" for v in out)


def fixed_light(svg: str) -> str:
    """`svg` with each of Obsidian's theme variables graph_svg writes swapped for the light
    theme's fixed colour, so the picture reads the same on any page and in any viewer."""
    t = LIGHT
    svg = re.sub(
        r"rgba\(var\(--color-(\w+)-rgb\), ([\d.]+)\)",
        lambda m: mixed(t[m.group(1)], t["page"], float(m.group(2))),
        svg,
    )
    svg = re.sub(
        r"color-mix\(in srgb, var\(--color-(\w+)\) (\d+)%, var\(--text-normal\)\)",
        lambda m: mixed(t[m.group(1)], t["text"], int(m.group(2)) / 100),
        svg,
    )
    return svg.replace("var(--text-normal)", t["text"]).replace("var(--text-muted)", t["muted"])


def said_date(iso: str) -> str:
    """A day as a picture's foot says it: `30 Oct 2026` for `2026-10-30`."""
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", iso)
    if not m or not 1 <= int(m.group(2)) <= 12 or not 1 <= int(m.group(3)) <= 31:
        return iso
    return f"{int(m.group(3))} {MONTHS[int(m.group(2)) - 1]} {m.group(1)}"


def framed(svg: str, fingerprint: str, title: str, alt: str, foot: str) -> str:
    """The drawing as a picture: named as ThoughtKnot's, with its title and description, the page
    painted white behind it, and a foot saying who drew it, from which note and when."""
    t = LIGHT
    box = re.search(r'viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"', svg)
    x, y, w, h = (float(v) for v in box.groups()) if box else (0.0, 0.0, 0.0, 0.0)
    if box:
        svg = svg.replace(box.group(0), f'viewBox="{x:.2f} {y:.2f} {w:.2f} {h + FOOT:.2f}"', 1)
    opened = svg.index(">") + 1
    inside = (
        f"\n{picture_mark(fingerprint)}\n<title>{html.escape(title, False)}</title>\n"
        f"<desc>{html.escape(alt, False)}</desc>\n"
        f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h + FOOT:.2f}" '
        f'fill="{t["page"]}"/>'
    )
    end = svg.rindex("</svg>")
    foot_text = (
        f'<text x="{x + 4:.2f}" y="{y + h + FOOT - 6:.2f}" font-family="Helvetica" '
        f'font-size="{FOOT_SIZE}" fill="{t["muted"]}">{html.escape(foot, False)}</text>\n'
    )
    return f"{svg[:opened]}{inside}{svg[opened:end]}{foot_text}</svg>\n"


def alt_of(graph: str, nodes: list, edges: list) -> str:
    """The plain-language reading of a graph, cut to the alt text's length (help.ts,
    textVersion): how many things and links, each thing and its kind, then each link."""

    def count(n, one):
        return f"{n} {one}" if n == 1 else f"{n} {one}s"

    text = {key: shown for key, _, shown in nodes}
    sentences = [f"Graph {graph}: {count(len(nodes), 'thing')}, {count(len(edges), 'link')}."]
    for _, kind, shown in nodes:
        a = "an" if re.match(r"[aeiou]", kind or "", re.IGNORECASE) else "a"
        sentences.append(f"{shown} is {a} {kind}." if kind else f"{shown}.")
    sentences += [f"{text.get(s, s)} {r} {text.get(d, d)}." for s, r, d in edges]
    return picture_alt(sentences)


def drawer(date: str, check: bool = False) -> Callable[[str, str, str, str], Drawn | str | None]:
    """What draws a picture for folder_pictures, on day `date`. With `check`, nothing is laid
    out: whether a picture is out of date is known from its fingerprint alone."""

    def draw(note: str, text: str, graph: str, fingerprint: str) -> Drawn | str | None:
        texts = [s["text"] for s in gql_spans(text)]
        args = graph_svg.render_args(texts, graph)
        if not args["nodes"]:
            return None
        if len(args["nodes"]) > MOST_THINGS:
            return f"it has more than {MOST_THINGS} things, so the apps draw it as its overview"
        alt = alt_of(graph, args["nodes"], args["edges"])
        if check:
            return {"svg": "", "alt": alt}
        try:
            svg = graph_svg.render(**args)
        except RuntimeError as e:
            return str(e)
        foot = f"Drawn by ThoughtKnot from {note}, {said_date(date)}"
        return {"svg": framed(fixed_light(svg), fingerprint, graph, alt, foot), "alt": alt}

    return draw


def notes_under(root: str) -> list[str]:
    """Every note under `root`, by its path from there with `/` between parts. A hidden folder,
    such as .git or .obsidian, and a tool's own are never read."""
    out = []
    for at, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d not in _SKIPPED)
        for f in files:
            if f.lower().endswith(".md") and not f.startswith("."):
                out.append(os.path.relpath(os.path.join(at, f), root).replace(os.sep, "/"))
    return sorted(out)


def reader_pictures(
    root: str, add: bool = False, check: bool = False, say: Callable[[str], object] = print
) -> int:
    """Brings the pictures under `root` up to date, or with `check` only says which are not. It
    gives the exit code: 1 when a check finds one out of date."""

    def at(path):
        return os.path.join(root, *path.split("/"))

    def read(path):
        try:
            with open(at(path), encoding="utf-8", newline="") as f:
                return f.read()
        except OSError:
            return None

    today = datetime.date.today().isoformat()
    run: FolderRun = folder_pictures(notes_under(root), read, drawer(today, check), add)
    for p in run["problems"]:
        say(p)
    if check:
        for path in run["out_of_date"]:
            say(f"out of date: {path}")
        return 1 if run["out_of_date"] else 0
    for c in run["changes"]:
        if c["text"] is None:
            os.remove(at(c["path"]))
        else:
            os.makedirs(os.path.dirname(at(c["path"])), exist_ok=True)
            with open(at(c["path"]), "w", encoding="utf-8", newline="") as f:
                f.write(c["text"])
    say(f"{len(run['out_of_date'])} file(s) brought up to date")
    return 0


__all__ = """
alt_of drawer fixed_light framed LIGHT mixed MOST_THINGS notes_under reader_pictures said_date
""".split()

if __name__ == "__main__":
    args = sys.argv[1:]
    folder = next((a for a in args if not a.startswith("--")), None)
    if not folder:
        print("usage: python3 reader_pictures.py <folder> [--add] [--check]", file=sys.stderr)
        sys.exit(2)
    sys.exit(reader_pictures(folder, add="--add" in args, check="--check" in args))
