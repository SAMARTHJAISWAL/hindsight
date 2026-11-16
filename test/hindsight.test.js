import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decode, detect, parse, parseBash, parseFish, parsePowerShell, parseZsh, unmetafy } from "../src/parse.js";
import { redact, safe } from "../src/redact.js";
import { distance, program, recap, segments, typoOf, KNOWN } from "../src/stats.js";

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("zsh extended history, with a continued line", async () => {
  const e = parseZsh(await fixture("zsh_extended"));
  assert.equal(e.length, 10);
  assert.equal(e[0].cmd, "git status");
  assert.equal(e[0].time.getTime(), 1767225600000);
  assert.equal(e[5].cmd, "echo one \\\ntwo");
  assert.equal(detect(await fixture("zsh_extended")), "zsh");
});

test("Windows line endings read the same", async () => {
  for (const name of ["zsh_extended", "bash_timestamps", "fish_history"]) {
    const text = await fixture(name);
    const crlf = text.replace(/\r?\n/g, "\r\n");
    assert.deepEqual(parse(crlf).map((e) => e.cmd), parse(text).map((e) => e.cmd), name);
  }
});

test("plain zsh history has no timestamps", () => {
  const e = parseZsh("pwd\nls -la\n\npython3 --version\n");
  assert.deepEqual(e.map((x) => x.cmd), ["pwd", "ls -la", "python3 --version"]);
  assert.ok(e.every((x) => x.time === null));
});

test("zsh metafied bytes decode to UTF-8", () => {
  // "é" is C3 A9; zsh stores A9 as 0x83 0x89 (0xA9 ^ 32)
  const bytes = new Uint8Array([0x65, 0x63, 0x68, 0x6f, 0x20, 0xc3, 0x83, 0x89]);
  assert.equal(decode(bytes, "zsh"), "echo é");
  assert.deepEqual([...unmetafy(new Uint8Array([0x41]))], [0x41]);
});

test("bash with and without timestamps", async () => {
  const text = await fixture("bash_timestamps");
  assert.equal(detect(text), "bash");
  const e = parseBash(text);
  assert.deepEqual(e.map((x) => x.cmd), ["git pull", "make test", "ls"]);
  assert.ok(e[0].time && e[1].time && e[2].time === null);
});

test("fish history", async () => {
  const text = await fixture("fish_history");
  assert.equal(detect(text), "fish");
  const e = parseFish(text);
  assert.deepEqual(e.map((x) => x.cmd), ["cargo build --release", 'echo "a\nb"', "git push"]);
  assert.equal(e[2].time.getTime(), 1767312000000);
});

test("PowerShell history with a continued line", async () => {
  const e = parsePowerShell(await fixture("ConsoleHost_history.txt"));
  assert.deepEqual(e.map((x) => x.cmd), ["Get-ChildItem", 'Write-Host `\n  "hi"', "git status"]);
  assert.equal(parse("ls\n", "powershell").length, 1);
});

test("splitting commands and finding the program", () => {
  assert.deepEqual(segments('git add . && git commit -m "a | b" || echo no; ls | wc -l'), [
    "git add .",
    'git commit -m "a | b"',
    "echo no",
    "ls",
    "wc -l",
  ]);
  assert.deepEqual(segments("ffmpeg -i in.mp4 \\\n  out.mp4"), ["ffmpeg -i in.mp4 out.mp4"]);
  assert.equal(program("sudo FOO=1 /usr/bin/git status"), "git");
  assert.equal(program("time npm test"), "npm");
  assert.equal(program("./run.sh --fast"), "./run.sh");
  assert.equal(program("--weird"), null);
  assert.equal(program("!!"), null);
  assert.equal(program("cd: no such file or directory: x"), null);
});

test("typos are near misses of commands you use", () => {
  assert.equal(distance("gti", "git"), 1);
  assert.equal(distance("pyhton3", "python3"), 1);
  assert.equal(typoOf("gti", []), "git");
  assert.equal(typoOf("sl", []), "ls");
  assert.equal(typoOf("pyhton3", []), "python3");
  assert.equal(typoOf("git", []), null); // a real command
  assert.equal(typoOf("kubectx", []), null); // a real tool, not a slip for kubectl
  assert.equal(typoOf("foobarbaz", []), null); // too far from anything
  assert.equal(typoOf("deplyo", ["deploy"]), "deploy");
  assert.ok(KNOWN.has("git"));
});

test("secrets never survive redaction", () => {
  const cases = [
    ["OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx python app.py", "sk-abcdef"],
    ["export GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789", "ghp_"],
    ["curl -H 'Authorization: Bearer abc.def.ghi123456' https://api.x.com", "abc.def"],
    ["curl https://admin:hunter2@example.com/db", "hunter2"],
    ["mysql -u root -pS3cretPass db", "S3cretPass"],
    ["psql --password=topsecret -h db", "topsecret"],
    ["aws configure set aws_access_key_id AKIAABCDEFGHIJKLMNOP", "AKIAABCDEFGHIJKLMNOP"],
    ["vercel --token 0123456789abcdefABCDEF0123456789abcd", "0123456789abcdef"],
    ["git clone https://x:ghp_abcdefghijklmnopqrstuvwxyz0123@github.com/a/b", "ghp_"],
    ["mail alex.smith@company.com < report", "alex.smith"],
    ["cd /Users/alexsmith/projects/app", "alexsmith"],
    ["cat C:\\Users\\Priya\\notes.txt", "Priya"],
    ["DB_PASSWORD='p@ss word' ./start", "p@ss"],
    ["echo eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJlc2lnbmF0dXJl", "eyJhbGci"],
    ["stripe listen --api-key sk_live_abcdefghij1234567890", "sk_live"],
    ["slack xoxb-1234567890-abcdefghij", "xoxb-1234567890"],
  ];
  for (const [cmd, secret] of cases) {
    const out = redact(cmd);
    assert.ok(!out.includes(secret), `leaked "${secret}" in: ${out}`);
    assert.ok(out.includes("•••") || out.includes("~"), `nothing hidden in: ${out}`);
  }
  // ordinary commands are left alone
  for (const cmd of ["git commit -m 'fix login bug'", "npm install react", "ls -la ~/code", "docker run -p 8080:80 nginx"]) {
    assert.equal(redact(cmd), cmd);
  }
  assert.equal(safe("a ".repeat(100), 20).length <= 20, true);
});

test("the recap of a small history", async () => {
  const entries = parse(await fixture("zsh_extended"));
  const all = recap(entries);
  assert.equal(all.commands, 10);
  assert.equal(all.hasTime, true);
  const y = recap(entries, { year: new Date(1767225600000).getFullYear() });
  assert.equal(y.commands, 9); // one command is from the year before
  assert.equal(y.top[0][0], "git");
  assert.deepEqual(y.typos, [{ typo: "gti", meant: "git", n: 1 }]);
  assert.equal(y.sudoBang, 1);
  assert.equal(y.rmrf, 1);
  assert.equal(y.longestPipe.pipes, 4);
  assert.ok(y.time.activeDays >= 2);
  // the secret in the history is not anywhere in the recap
  assert.ok(!JSON.stringify(y).includes("sk-abcdef"));
  assert.ok(y.persona.name);
});

test("a frequently used near miss is a tool, not a typo", () => {
  const many = (cmd, n) => Array.from({ length: n }, () => ({ cmd, time: null }));
  const r = recap([...many("deplyo prod", 10), ...many("deploy prod", 12), ...many("gti st", 1), ...many("git st", 40)]);
  assert.deepEqual(r.typos.map((t) => t.typo), ["gti"]);
});

test("a pasted token never shows up as a top command", () => {
  const entries = ["ghp_abcdefghijklmnopqrstuvwxyz0123456789", "git status", "git status"].map((cmd) => ({ cmd, time: null }));
  const r = recap(entries);
  assert.ok(!JSON.stringify(r).includes("ghp_"));
});

test("personas", () => {
  const many = (cmd, n) => Array.from({ length: n }, () => ({ cmd, time: null }));
  assert.equal(recap([...many("git status", 30), ...many("ls", 10)]).persona.name, "The Git Whisperer");
  assert.equal(recap([...many("docker ps", 30), ...many("ls", 10)]).persona.name, "The Container Captain");
  assert.equal(recap(many("echo hi", 5)).persona.name, "The Generalist");
  const nights = Array.from({ length: 20 }, (_, i) => ({ cmd: "make", time: new Date(2026, 0, 1 + i, 2, 0) }));
  assert.equal(recap(nights, { year: 2026 }).persona.name, "The Night Owl");
});

test("the README's example numbers", async () => {
  // the made-up year in test/fixtures/sample_year (timezone-independent figures)
  const r = recap(parse(await fixture("sample_year")), { year: 2026 });
  assert.equal(r.commands, 10351);
  assert.deepEqual(r.top.slice(0, 5), [["git", 4503], ["ls", 1374], ["npm", 1105], ["cd", 909], ["docker", 452]]);
  assert.deepEqual(r.git.slice(0, 2), [["status", 1537], ["add", 739]]);
  assert.deepEqual(r.typos.map((t) => [t.typo, t.meant, t.n]), [["gti", "git", 67], ["pyhton3", "python3", 24]]);
  assert.equal(r.typoTotal, 91);
  assert.equal(r.persona.name, "The Git Whisperer");
});
