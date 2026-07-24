import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { splitSqlStatements } from "../scripts/sql-statements.mjs";

test("SQL statements split on top-level semicolons only", () => {
  const sql = `
    SELECT 'a; b';
    DO $migration$
    BEGIN
      PERFORM 1;
      PERFORM 2;
    END;
    $migration$;
    SELECT 3;
  `;

  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 3);
  assert.match(statements[1], /PERFORM 1;/);
  assert.match(statements[1], /PERFORM 2;/);
});

test("the trust migration keeps each procedural block intact", async () => {
  const sql = await readFile(
    new URL("../migrations/003_trust_manifest.sql", import.meta.url),
    "utf8",
  );
  const statements = splitSqlStatements(sql);
  const constraintBlock = statements.find((statement) =>
    statement.includes("reviews_completion_state_valid"),
  );
  const functionStatement = statements.find((statement) =>
    statement.includes("CREATE OR REPLACE FUNCTION"),
  );

  assert.match(constraintBlock, /IF NOT EXISTS/);
  assert.match(constraintBlock, /reviews_manifest_matches_result/);
  assert.match(functionStatement, /RETURN NEW;/);
  assert.match(functionStatement, /\$\$ LANGUAGE plpgsql$/);
});
