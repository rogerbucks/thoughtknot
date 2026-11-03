# The calculated-value language

A kind's schema can say that a property is worked out, not typed. The way to work it out is an expression. It is read
as data and never run as code (editor spec §57, calc_in_schema). The library that works it out is
`packages/graph-spec/src/calculated/calculated.js`, with a Python twin.

## How a schema declares one

Two kinds of thing, in the same graph as the things they describe:

- `Calculated {of: 'Task', name: 'cost', is: 'hours * rate', unit: 'USD'}` — every `Task` now has a `cost`.
- `Quantity {of: 'Task', name: 'hours', unit: 'h'}` — a number you type, with the unit it is in.

`unit` is optional. A calculated value declared in `USD` must work out in `USD`, or it is refused. A plain number
takes the declared unit.

## What an expression may hold

- **Names** of the thing's own properties, such as `hours`. A name may be a calculated property of the same thing.
- **Numbers** such as `2` or `0.5`.
- **Sums:** `+`, `-`, `*`, `/`, and round brackets. `-` also goes in front of a value.
- **Roll-ups over links:** `sum`, `avg`, `min` and `max` work on a property of the things at the other end of links.
  `sum(HAS.cost)` follows `HAS` links going out. `sum(<HAS.cost)` follows links coming in. `count(HAS)` counts links.
  A roll-up may reach a calculated property of the other things.

Anything else is refused with the reason: another call such as `now()`, text, a second statement. An expression holds
at most 1,000 characters and its brackets go at most 64 deep.

## What it gives

Each value is a number or nothing, with its unit and three more facts:

- **A gap.** A value that lacks an input is nothing, and `missing` counts how many inputs it lacked. A total is of the
  values that are there, with the count of those that are not. A gap is never counted as zero (calc_gaps_said).
- **A refusal.** Adding or taking away values of different units is refused, naming both. So is dividing by zero.
  `*` and `/` combine units: `h * USD/h` is `USD`.
- **A loop.** A value that depends on itself is nothing and names the things in the loop. Things outside the loop
  still work out (calc_loops_flagged).

## What it never does

It never writes a value into the note text, and no AI types one (editor spec §24, rule 4). A reader may keep a copy
as a cache. Each value has a `basis`: a hash of the expression and everything it read. A kept copy is known to be
stale the moment an input changes.

## Where it is held

`packages/graph-spec/test/calculated-cases.json` holds the cases. `packages/graph-spec/test/calculated.test.mjs` and
`python/graph_spec/tests/test_calculated.py` hold both libraries to them (calc_engines_agree).
