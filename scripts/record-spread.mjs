#!/usr/bin/env node
// Puts the spread between runs into a run of the quality metrics, so the baseline committed from it carries it (OPS-10).
//   node scripts/record-spread.mjs quality/metrics.json quality/instruction-spread.json
// The second file is what `instruction-counts.mjs --runs 3` writes. Its `largest_spread` is how far a benchmark's count
// moved between runs, as a share of it. quality-check refuses a baseline whose instruction tolerance is under twice that.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The metrics with `largest_spread` set after `machine`, or the same ones when the spread file holds none. */
export function withSpread(metrics, spread) {
  const largest = spread?.details?.instructions?.largest_spread;
  if (typeof largest !== 'number') return metrics;
  const { machine, ...rest } = metrics;
  return { ...(machine && { machine }), largest_spread: largest, ...rest };
}

function main([metricsFile, spreadFile]) {
  if (!metricsFile || !spreadFile) {
    console.error('usage: node scripts/record-spread.mjs <metrics.json> <instruction-spread.json>');
    return 2;
  }
  const metrics = JSON.parse(readFileSync(metricsFile, 'utf8'));
  const made = withSpread(metrics, JSON.parse(readFileSync(spreadFile, 'utf8')));
  if (made === metrics) {
    console.error(`${spreadFile} holds no largest_spread: the baseline will carry none`);
    return 1;
  }
  writeFileSync(metricsFile, `${JSON.stringify(made, null, 2)}\n`);
  console.log(`largest_spread ${made.largest_spread} recorded in ${metricsFile}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
