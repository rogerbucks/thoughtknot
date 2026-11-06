"""Process versions (editor spec §51, spec_process_versions).

A running instance keeps the version of its process graph that it started on. A new version of the
graph changes no instance by itself. An instance moves to a new version only by a mapping the new
version gives, from each old state to a new one. A mapping that misses a state the instance is in
is refused, and the instance stays where it is.
"""

from __future__ import annotations

from dataclasses import dataclass

from graphspec.engine.process.machine import Machine
from graphspec.rules.plain_graph import Graph


@dataclass(frozen=True)
class Instance:
    """A running process: the version it started on and the states it is in now."""

    version: str
    conf: tuple


class Versions:
    """The versions of one process graph, and the mappings new versions give from older ones."""

    def __init__(self):
        self.graphs: dict[str, Graph] = {}
        self.mappings: dict[tuple[str, str], dict[str, str]] = {}

    def add(
        self, version: str, graph: Graph, mapping_from: dict[str, dict[str, str]] | None = None
    ):
        """Add a version. `mapping_from` maps old states to new, per older version."""
        if version in self.graphs:
            raise ValueError(f"refused: version {version} is already held")
        self.graphs[version] = graph
        for old, mapping in (mapping_from or {}).items():
            self.mappings[(old, version)] = dict(mapping)


def start(versions: Versions, version: str) -> Instance:
    """An instance starts on the version it is given and keeps it."""
    return Instance(version, Machine(versions.graphs[version]).start())


def step(versions: Versions, inst: Instance, event: str, ctx: dict) -> tuple[Instance, list]:
    """An event moves the instance by the rules of its own version, never the newest one."""
    conf, acts = Machine(versions.graphs[inst.version]).step(inst.conf, event, ctx)
    return Instance(inst.version, conf), acts


def migrate(versions: Versions, inst: Instance, to: str) -> Instance:
    """Move an instance to a newer version, only by the mapping that version gives."""
    mapping = versions.mappings.get((inst.version, to))
    if mapping is None:
        raise ValueError(
            f"refused: version {to} gives no mapping from {inst.version}, "
            "so the instance keeps its version (editor spec §51)"
        )
    missing = [s for s in inst.conf if s not in mapping]
    if missing:
        raise ValueError(
            f"refused: the mapping to {to} misses {', '.join(missing)}, "
            "so the instance keeps its version (editor spec §51)"
        )
    target = versions.graphs[to]
    new = tuple(mapping[s] for s in inst.conf)
    absent = [s for s in new if s not in target.nodes]
    if absent:
        raise ValueError(
            f"refused: the mapping names {', '.join(absent)}, which {to} does not hold"
        )
    return Instance(to, new)
