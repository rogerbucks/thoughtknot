#!/usr/bin/env python3
"""Runs the graph spec's checks on a plain in-memory graph — no database — for any system that can
run Python: types (§5), the flat projection (§18), certainty (§20), paths (§22), completeness
(§25), judgements (§23) and servings (§24).

Usage (in Python, from the repository root):
  import sys; sys.path.insert(0, 'python/graph_spec/src')
  import gql_profile as p, graph_rules as r
  s = p.Store(); s.apply(open('b.gql').read()); w = r.World.from_store(s); print(r.check(w))

Writes: nothing (library).

The rules once, over a plain graph, so they run where Grafeo does not. Standard library only. The
conformance suite runs them on the profile reader's graph and requires the same verdicts as
graph_spec.py's Grafeo-query versions on every case; the plain-JavaScript twin
(packages/graph-spec) follows this file function for function. A lens rule is evaluated when it has
the simple shape every lens here uses — buckets by comparing a node's own fields — and is otherwise
reported as needing an engine, never passed.

The rules live in graphspec/rules/ (GUIDE.md); this module is their entry point and
re-exports every name it has always had, from where it lives now.
"""

# An entry point: it imports every name to re-export it, so none is unused.
# ruff: noqa: F401

import datetime as dt
import hashlib
import json
import math
import re

from graphspec.rules.plain_graph import (
    Graph,
    World,
)
from graphspec.rules.canonical_json import (
    UTC,
    _num,
    basis_hash,
    hash16,
    jcs,
    norm,
)
from graphspec.rules.named_hashes import (
    is_named,
    named,
)
from graphspec.rules.schema_types import (
    SPEC_EDGES,
    SPEC_MARKERS,
    SPEC_NODES,
    SPEC_SCHEMA,
    _lev,
    declared_in,
    drafted,
    is_draft,
    near_duplicates,
    typed,
    types,
    untyped,
)
from graphspec.rules.projection import (
    PROJECTION_TZ,
    _cnorm,
    _gql,
    _iso,
    iso,
    canon,
    project,
    projects_back,
    rebuild,
)
from graphspec.rules.likelihood import (
    CONFIDENCE,
    LIKELIHOOD,
    RANGE,
    _BANDS,
    _word_hi,
    _word_lo,
    band_rank,
    both,
    corroborate,
    span,
    verdict,
    wilson,
    words,
)
from graphspec.rules.certainty import (
    _sources,
    calibration,
    claim_status,
    confidence_from_evidence,
    corroboration,
    derived_ranges,
    latest_assessment,
    reliability,
    settled,
)
from graphspec.rules.certainty_checks import (
    section20,
)
from graphspec.rules.paths import (
    below,
    lift,
    path_steps,
    paths_rules,
    view_at,
)
from graphspec.rules.lens import (
    LENS,
    lens_buckets,
)
from graphspec.rules.judgements import (
    JUDGEMENT_EDGES,
    basis,
    current_decisions,
    judgement_hash,
    resolve,
    review,
    why_layer,
)
from graphspec.rules.judgement_checks import (
    is_judgement_graph,
    judgements_rules,
)
from graphspec.rules.proposers import (
    proposer_warnings,
)
from graphspec.rules.servings import (
    may_serve,
    served_rules,
)
from graphspec.rules.graph_check import (
    check,
)
from graphspec.rules.completeness import (
    CARD_NEEDS,
    COV_NEEDS,
    _day,
    _parked_state,
    completeness,
)
from graphspec.rules.changesets import (
    _state,
    changeset_header,
    check_changeset,
    refresh_section20,
)
from graphspec.rules.views import (
    SCHEMA_LABELS,
    _caption,
    _word,
    word,
    legend,
    mermaid_graph,
    mermaid_path,
    readings,
    tops,
    views,
)
from graphspec.rules.shown_text import (
    NAME_KEYS,
    SHOWN_LIMIT,
    WORDING_KEYS,
    clip_shown,
    shown_text,
)
from graphspec.rules.guessed_readings import (
    _ACTIVE,
    _IRREGULAR,
    _NAMED,
    _PREPOSITIONS,
    _participle,
    guess_readings,
    reverse_reading,
)


# The public names (risk API-7). A name with an underscore stays importable, for the vault only.
__all__ = """
band_rank basis basis_hash below both calibration canon CARD_NEEDS changeset_header check
check_changeset claim_status clip_shown completeness CONFIDENCE confidence_from_evidence
corroborate corroboration COV_NEEDS current_decisions declared_in derived_ranges drafted Graph
guess_readings hash16 is_draft is_judgement_graph is_named iso jcs JUDGEMENT_EDGES
judgement_hash judgements_rules latest_assessment legend LENS lens_buckets lift LIKELIHOOD
may_serve mermaid_graph mermaid_path NAME_KEYS named near_duplicates norm path_steps
paths_rules project PROJECTION_TZ projects_back proposer_warnings RANGE readings rebuild
refresh_section20 reliability resolve reverse_reading review SCHEMA_LABELS section20
served_rules settled SHOWN_LIMIT shown_text span SPEC_EDGES SPEC_MARKERS SPEC_NODES SPEC_SCHEMA
tops typed types untyped UTC verdict view_at views why_layer wilson word WORDING_KEYS words
World
""".split()
