"""The pictures for readers of every note in a folder or a repository, brought up to date at once
(editor spec §62, picture_outside_tools). The core's reader-picture-folder.ts, step for step, so
the Python reader and the apps place, keep and remove pictures alike.
- A note gets pictures once it has a picture line, or when the tool is asked to add them all.
- A picture is changed only when the fingerprint of its text changed, as in the apps. So the
  tools and the apps never take turns rewriting one, though each draws with its own Graphviz.
- A new picture goes beside its note. Only a file that names itself as ThoughtKnot's is written
  over or removed. A picture whose block is gone goes, line and file.
Host-free: the caller reads the files, draws each picture and writes the changes it is given."""

from __future__ import annotations

import re

from collections.abc import Callable, Sequence
from typing import TypedDict

from graphspec.reader.reader_picture import (
    PICTURE_ENDING,
    made_by_thoughtknot,
    picture_blocks,
    picture_file_name,
    picture_fingerprint,
    picture_href,
    picture_line,
    picture_link_of,
    picture_lines,
    picture_state,
    picture_target,
    picture_texts,
    with_picture_line,
    without_picture_lines,
)


class Drawn(TypedDict):
    """A picture drawn: its whole SVG, marked with its fingerprint, and its alt text."""

    svg: str
    alt: str


class PictureChange(TypedDict):
    """A file to write, or to remove when its text is None. Paths are from the folder's top."""

    path: str
    text: str | None


class FolderRun(TypedDict):
    """What a folder's pictures need: the changes, each file out of date, and each problem."""

    changes: list[PictureChange]
    out_of_date: list[str]
    problems: list[str]


# What draws a picture: given the note's path and text, the graph and its fingerprint, the
# picture; None when there is nothing to draw; or a sentence saying why it cannot be drawn now.
Draw = Callable[[str, str, str, str], "Drawn | str | None"]


def _folder_of(path: str) -> str:
    return "/".join(path.split("/")[:-1])


def _is_picture_line(line: str) -> bool:
    return picture_link_of(line.removesuffix("\r")) is not None


def folder_pictures(
    notes: Sequence[str], read: Callable[[str], str | None], draw: Draw, add: bool = False
) -> FolderRun:
    """Brings the pictures of each note in `notes` up to date. A note with no picture line is
    left alone, unless `add` is set. Nothing is written here: the changes are handed back."""
    run: FolderRun = {"changes": [], "out_of_date": [], "problems": []}
    for note in notes:
        text = read(note)
        if text is None or (not add and not any(map(_is_picture_line, text.split("\n")))):
            continue
        placed = {p["block"]: p for p in picture_lines(text)}
        drawn: set[int] = set()
        nxt = text
        for at_block in picture_blocks(text):
            block, graph = at_block["block"], at_block["graph"]
            fingerprint = picture_fingerprint(note, picture_texts(text, graph))
            at = placed.get(block)
            folder = _folder_of(note)
            beside = f"{folder}/" if folder else ""
            beside += picture_file_name(note, graph)
            stem = beside[: -len(PICTURE_ENDING)]
            target = picture_target(note, at["href"]) if at else beside
            # past a file of someone else's, a number goes before the ending, as the apps do
            n = 1
            while not at and picture_state(read(target), fingerprint) == "not-ours":
                target = f"{stem} {n}{PICTURE_ENDING}"
                n += 1
            state = picture_state(read(target), fingerprint)
            if state == "not-ours":
                why = f"a file ThoughtKnot did not make is at {target}, and is kept"
                run["problems"].append(f"{note}: The picture of {graph} was not written: {why}")
                continue
            href = picture_href(note, target)
            if state == "current" and at and at["href"] == href:
                drawn.add(block)
                continue
            made = draw(note, text, graph, fingerprint)
            if made is None:
                continue
            drawn.add(block)
            if isinstance(made, str):
                # kept as it is, line and file, until it can be drawn
                run["problems"].append(f"{note}: The picture of {graph} was not written: {made}")
                continue
            if state != "current":
                run["changes"].append({"path": target, "text": made["svg"]})
                run["out_of_date"].append(target)
            if not at or at["href"] != href:
                nxt = with_picture_line(nxt, block, picture_line(made["alt"], href))
        nxt = without_picture_lines(nxt, _gone(drawn))
        nxt = _without_left_lines(note, text, nxt, drawn, run, read)
        if nxt != text:
            run["changes"].append({"path": note, "text": nxt})
            run["out_of_date"].append(note)
    return run


def _gone(drawn: set[int]) -> Callable[[dict], bool]:
    return lambda p: p["block"] not in drawn


def _without_left_lines(note, text, nxt, drawn, run, read):
    """`nxt` without a picture line left where its block was, or after one no longer drawn. Each
    file they linked goes too, when ThoughtKnot made it."""
    kept = {p["line"] for p in picture_lines(nxt)}
    stem = re.sub(r"\.md$", "", note.split("/")[-1], flags=re.IGNORECASE) + "."
    gone = [p["href"] for p in picture_lines(text) if p["block"] not in drawn]
    lines = []
    for i, line in enumerate(nxt.split("\n")):
        href = None if i in kept else picture_link_of(line.removesuffix("\r"))
        if href is not None and picture_target(note, href).split("/")[-1].startswith(stem):
            gone.append(href)
        else:
            lines.append(line)
    for target in dict.fromkeys(picture_target(note, h) for h in gone):
        if made_by_thoughtknot(read(target) or ""):
            run["changes"].append({"path": target, "text": None})
    return "\n".join(lines)
