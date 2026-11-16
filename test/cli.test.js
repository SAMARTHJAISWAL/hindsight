import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pack, unpack } from "../src/share.js";
import { recap } from "../src/stats.js";
import { parse } from "../src/parse.js";
import { readFileSync } from "node:fs";

const bin = fileURLToPath(new URL("../bin/hindsight.js", import.meta.url));
const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));

function run(args, env = {}) {
  return execFileSync(process.execPath, [bin, ...args], { env: { ...process.env, NO_COLOR: "1", ...env }, encoding: "utf8" });
}

test("a card survives being packed into a link", () => {
  const stats = recap(parse(readFileSync(join(fixtures, "zsh_extended"), "utf8")), { year: 2026 });
  const link = pack(stats);
  assert.match(link, /^[A-Za-z0-9_-]+$/); // URL-safe, no padding
  const card = unpack(link);
  assert.equal(card.c, stats.commands);
  assert.deepEqual(card.top[0], stats.top[0]);
  assert.equal(card.p.name, stats.persona.name);
  assert.ok(!JSON.stringify(card).includes("sk-abcdef")); // the secret in the history
  assert.ok(link.length < 2000);
});

test("the command reads histories it finds in your home folder", () => {
  const home = mkdtempSync(join(tmpdir(), "hindsight-"));
  copyFileSync(join(fixtures, "zsh_extended"), join(home, ".zsh_history"));
  mkdirSync(join(home, ".local", "share", "fish"), { recursive: true });
  copyFileSync(join(fixtures, "fish_history"), join(home, ".local", "share", "fish", "fish_history"));
  const out = run(["--json", "--year", "2026"], { HOME: home, USERPROFILE: home, HISTFILE: "", XDG_DATA_HOME: "" });
  const stats = JSON.parse(out);
  assert.equal(stats.commands, 12); // 9 zsh commands from 2026 + 3 fish
  assert.equal(stats.top[0][0], "git");
});

test("the command prints a recap and the share hint", () => {
  const out = run(["--file", join(fixtures, "zsh_extended"), "--year", "2026"]);
  assert.match(out, /your 2026 in the terminal/);
  assert.match(out, /You typed gti 1 time when you meant git/);
  assert.match(out, /Share it: hindsight --card/);
  assert.ok(!out.includes("sk-abcdef"));
  assert.ok(!out.includes("\x1b[")); // NO_COLOR is respected
});

test("history without timestamps covers everything, and says so", () => {
  const dir = mkdtempSync(join(tmpdir(), "hindsight-"));
  writeFileSync(join(dir, "h"), "git status\ngit push\nls\n");
  const out = run(["--file", join(dir, "h")]);
  assert.match(out, /3 commands/);
  assert.match(out, /doesn't save timestamps/);
});

test("bad options exit with a usage error", () => {
  assert.throws(() => run(["--nope"]), (e) => e.status === 2);
  assert.throws(() => run(["--file", "/does/not/exist"]), (e) => e.status === 1);
  assert.match(run(["--version"]), /hindsight \d+\.\d+\.\d+/);
});
