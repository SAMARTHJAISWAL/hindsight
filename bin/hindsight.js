#!/usr/bin/env node
// hindsight: your year in the terminal.

import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { decode, parse } from "../src/parse.js";
import { recap } from "../src/stats.js";
import { render } from "../src/terminal.js";
import { pack } from "../src/share.js";

const VERSION = "0.1.0";
const SITE = "https://samarthjaiswal.github.io/hindsight/";

const USAGE = `hindsight: your year in the terminal

Usage:
  hindsight              recap this year's shell history
  hindsight --card       open a shareable card in your browser
  hindsight --all        use your whole history, not just this year

Options:
  --year YEAR            recap a different year
  --file PATH            read this history file (repeatable)
  --shell NAME           its format: zsh, bash, fish or powershell
  --json                 print the numbers as JSON
  --no-color             plain text
  -h, --help             show this help
  -v, --version          show the version

Everything is computed on your machine. Nothing is uploaded: the card link
carries only totals and scrubbed snippets, after the "#", which browsers
never send to the server.
`;

function args(argv) {
  const o = { files: [], year: new Date().getFullYear(), color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "-v" || a === "--version") o.version = true;
    else if (a === "--card") o.card = true;
    else if (a === "--json") o.json = true;
    else if (a === "--all") o.year = null;
    else if (a === "--no-color") o.color = false;
    else if (a === "--year") {
      o.year = Number(value());
      if (!Number.isInteger(o.year)) throw new Error("--year needs a year, like 2026");
    } else if (a === "--file") o.files.push({ path: value() });
    else if (a === "--shell") o.shell = value();
    else if (a === "--site") o.site = value();
    else throw new Error(`unknown option ${a}`);
  }
  if (o.shell && !["zsh", "bash", "fish", "powershell"].includes(o.shell)) throw new Error(`unknown shell ${o.shell}`);
  return o;
}

/** History files that exist on this machine, with their format. */
export function findHistories(env = process.env, home = homedir()) {
  const data = env.XDG_DATA_HOME || join(home, ".local", "share");
  const candidates = [
    { path: env.HISTFILE, shell: (env.SHELL || "").endsWith("bash") ? "bash" : "zsh" },
    { path: join(home, ".zsh_history"), shell: "zsh" },
    { path: join(home, ".zhistory"), shell: "zsh" },
    { path: join(home, ".bash_history"), shell: "bash" },
    { path: join(data, "fish", "fish_history"), shell: "fish" },
    { path: join(data, "powershell", "PSReadLine", "ConsoleHost_history.txt"), shell: "powershell" },
    env.APPDATA && { path: join(env.APPDATA, "Microsoft", "Windows", "PowerShell", "PSReadLine", "ConsoleHost_history.txt"), shell: "powershell" },
  ].filter((c) => c && c.path && existsSync(c.path));
  const seen = new Set();
  return candidates.filter((c) => !seen.has(c.path) && seen.add(c.path));
}

function openInBrowser(url) {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const argv = platform() === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, argv, { stdio: "ignore", detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}

function main() {
  let o;
  try {
    o = args(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`hindsight: ${e.message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (o.help) return void process.stdout.write(USAGE);
  if (o.version) return void process.stdout.write(`hindsight ${VERSION}\n`);

  const sources = o.files.length ? o.files.map((f) => ({ ...f, shell: o.shell })) : findHistories();
  if (!sources.length) {
    process.stderr.write("hindsight: no shell history found. Point me at one with --file PATH.\n");
    process.exit(1);
  }
  const entries = [];
  for (const s of sources) {
    try {
      const text = decode(readFileSync(s.path), s.shell);
      entries.push(...parse(text, s.shell));
    } catch (e) {
      process.stderr.write(`hindsight: cannot read ${s.path}: ${e.message}\n`);
      process.exit(1);
    }
  }

  let stats = recap(entries, { year: o.year });
  const note = [];
  if (!stats.hasTime && o.year) note.push("Your shell doesn't save timestamps, so this covers your whole history.");
  if (stats.hasTime && o.year && stats.commands === 0) {
    note.push(`Nothing from ${o.year} yet; showing your whole history instead.`);
    stats = recap(entries, { year: null });
  }

  if (o.json) return void process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);

  process.stdout.write(render(stats, { color: o.color, width: Math.min(process.stdout.columns || 80, 90) - 6 }));
  process.stdout.write("\n");
  for (const line of note) process.stdout.write(`  ${line}\n`);
  if (!stats.hasTime) {
    process.stdout.write("  Tip: zsh users can add `setopt EXTENDED_HISTORY` to ~/.zshrc for time-of-day stats next year.\n");
  }
  const url = `${o.site || SITE}#${pack(stats)}`;
  if (o.card) {
    process.stdout.write(openInBrowser(url) ? "\n  Opened your card in the browser.\n" : `\n  Open your card: ${url}\n`);
  } else {
    process.stdout.write("\n  Share it: hindsight --card\n");
  }
  process.stdout.write("\n");
}

main();
