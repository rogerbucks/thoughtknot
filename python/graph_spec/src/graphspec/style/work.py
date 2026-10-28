"""The work each pass that draws links may do, counted as it is done (editor spec §68,
layout_work_counted). Each pass counts the looks it really takes, as it takes them, and stops
when the next would go past its budget, keeping what it has worked out. So no pass takes longer
as a graph grows past what its budget says. It is the core's layout-work.ts, step for step."""

from __future__ import annotations

# Each pass's budget, in steps: a look at a box, a pair of links or a spot for words.
WORK_MOST = {
    "crowded": 40_000_000,
    "settle": 4_000_000,
    "bends": 10_000_000,
    "crossings": 10_000_000,
    "words": 4_000_000,
}

# The most looks a drawing's links are planned to take to be compared for crossings. Past it they
# are scored by the boxes alone, as before the work was counted, so a drawing reads as it did.
CROSSINGS_PLANNED = 40_000_000


class Work:
    """A pass's budget of work and the steps it has taken against it."""

    def __init__(self, most: int):
        self.most = most
        self.done = 0

    def take(self, n: int) -> bool:
        """Takes `n` more steps if the budget holds them, and says so; past it, takes none."""
        if self.done + n > self.most:
            return False
        self.done += n
        return True
