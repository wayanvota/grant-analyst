import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const fixtureUrl = new URL("./fixtures/", import.meta.url);

test("the trust fixture set is synthetic, complete, and free of direct contact data", async () => {
  const manifest = JSON.parse(await readFile(new URL("fixture-manifest.json", fixtureUrl), "utf8"));
  assert.equal(manifest.synthetic, true);
  assert.equal(manifest.contains_real_applicant_data, false);
  assert.ok(manifest.fixtures.length >= 9);
  const contents = await Promise.all(manifest.fixtures.map(async (fixture) => ({
    fixture,
    content: await readFile(new URL(fixture.file, fixtureUrl), "utf8"),
  })));
  for (const { fixture, content } of contents) {
    assert.ok(fixture.expected.length > 0, `${fixture.file} needs expected findings.`);
    assert.ok(content.trim().length > 40, `${fixture.file} should contain a usable fixture.`);
    assert.doesNotMatch(content, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/, `${fixture.file} contains an email.`);
    assert.doesNotMatch(content, /\+?\d[\d ()-]{8,}\d/, `${fixture.file} contains a phone-like value.`);
  }
});
