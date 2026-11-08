// An engine is certified against a versioned catalogue published with the spec (editor spec §51, spec_engine_catalogue).
// requirements/graph-spec-engine-catalogue.json is the catalogue. This holds three things together. The catalogue names
// the spec's current version. Its known answers are the ones the conformance suite holds. The reference engine's
// version is the one pinned in the Python project and its lock file.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const CATALOGUE = JSON.parse(read('../requirements/graph-spec-engine-catalogue.json'));
const SPEC = JSON.parse(read('../requirements/graph-spec-version.json'));
const PYPROJECT = read('../python/graph_spec/pyproject.toml');
const LOCK = read('../python/graph_spec/uv.lock');

describe('spec_engine_catalogue', () => {
  test('the catalogue names the version of the spec it is published with', () => {
    assert.equal(CATALOGUE.catalogue.spec, SPEC.version);
    assert.match(CATALOGUE.catalogue.version, /^\d+$/);
  });

  test('each known answer in the catalogue is held, with its digest, by the conformance suite', () => {
    assert.ok(CATALOGUE.catalogue.knownAnswers.length > 0);
    for (const answer of CATALOGUE.catalogue.knownAnswers) {
      const source = read(`../${answer.source}`);
      assert.ok(
        source.includes(`id: '${answer.id}', digest: '${answer.digest}'`),
        `${answer.id} is in ${answer.source}`,
      );
    }
  });

  test('the reference engine is pinned to the catalogue version in the project and its lock file', () => {
    const { name, version } = CATALOGUE.referenceEngine;
    const pins = [...PYPROJECT.matchAll(new RegExp(`"${name}==([\\d.]+)"`, 'g'))].map((m) => m[1]);
    assert.ok(pins.length > 0, `${name} is pinned in pyproject.toml`);
    for (const pin of pins) assert.equal(pin, version, 'every pin is the catalogue version');
    const locked = new RegExp(`name = "${name}"\\nversion = "([\\d.]+)"`).exec(LOCK);
    assert.equal(locked && locked[1], version, 'the lock file holds the same version');
  });

  test('a certificate names the spec and the catalogue it holds for, and the example is one', () => {
    const { fields } = CATALOGUE.certificate;
    assert.ok(fields.includes('spec') && fields.includes('catalogue'));
    assert.deepEqual(Object.keys(CATALOGUE.example), fields);
    assert.equal(CATALOGUE.example.spec, CATALOGUE.catalogue.spec);
    assert.equal(CATALOGUE.example.catalogue, CATALOGUE.catalogue.version);
    assert.equal(CATALOGUE.example.engineVersion, CATALOGUE.referenceEngine.version);
    for (const id of CATALOGUE.example.knownAnswers)
      assert.ok(
        CATALOGUE.catalogue.knownAnswers.some((a) => a.id === id),
        `${id} is in the catalogue`,
      );
  });
});
