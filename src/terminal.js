// The recap as text for the terminal.

import { hourName, WEEKDAYS } from "./stats.js";

const ESC = "\x1b[";
const paint = (on) => (code) => (text) => (on ? `${ESC}${code}m${text}${ESC}0m` : String(text));

const n = (x) => x.toLocaleString("en-US");
const pct = (x) => `${Math.round(x * 100)}%`;
const SPARK = "▁▂▃▄▅▆▇█";

function spark(values) {
  const max = Math.max(...values, 1);
  return values.map((v) => SPARK[Math.min(7, Math.round((v / max) * 7))]).join("");
}

export function render(stats, { color = true, width = 72 } = {}) {
  const c = paint(color);
  const bold = c("1");
  const dim = c("2");
  const gold = c("38;5;214");
  const pink = c("38;5;205");
  const cyan = c("38;5;80");
  const green = c("38;5;78");
  const lines = [];
  const say = (text = "") => lines.push(`  ${text}`);
  const head = (text) => {
    say();
    say(gold(bold(text.toUpperCase())));
  };

  const period = stats.year ? `your ${stats.year} in the terminal` : "your terminal history";
  say();
  say(`${pink(bold("hindsight"))} ${dim("·")} ${bold(period)}`);
  const extra = stats.time ? ` ${dim("·")} ${n(stats.time.activeDays)} active days` : "";
  say(`${bold(n(stats.commands))} commands ${dim("·")} ${bold(n(stats.unique))} different programs${extra}`);

  if (stats.top.length) {
    head("Your top commands");
    const max = stats.top[0][1];
    const nameWidth = Math.min(14, Math.max(...stats.top.map(([p]) => p.length)));
    const barWidth = Math.max(10, width - nameWidth - 24);
    stats.top.forEach(([p, count], i) => {
      const bar = "█".repeat(Math.max(1, Math.round((count / max) * barWidth)));
      const share = i === 0 ? dim(` (${pct(count / stats.programsRun)})`) : "";
      say(`${dim(String(i + 1).padStart(2))}  ${cyan(p.slice(0, nameWidth).padEnd(nameWidth))}  ${cyan(bar)} ${n(count)}${share}`);
    });
  }

  if (stats.git.length) {
    head("Git");
    say(stats.git.map(([sub, count]) => `${bold(sub)} ${n(count)}`).join(dim(" · ")));
  }

  head("Typos");
  if (stats.typos.length) {
    const [t] = stats.typos;
    say(`You typed ${pink(bold(t.typo))} ${n(t.n)} time${t.n === 1 ? "" : "s"} when you meant ${bold(t.meant)}.`);
    const rest = stats.typos.slice(1).map((x) => `${x.typo}→${x.meant} ${x.n}`);
    if (rest.length) say(dim(`Also: ${rest.join(", ")}`));
    if (stats.typoTotal > 1) say(dim(`${n(stats.typoTotal)} typos in total.`));
  } else {
    say("Not a single typo. Suspicious.");
  }

  if (stats.time) {
    const t = stats.time;
    head("When you work");
    say(`Busiest hour: ${bold(hourName(t.busiestHour))} ${dim("·")} busiest day of the week: ${bold(WEEKDAYS[t.busiestWeekday])}`);
    say(`${dim("midnight")} ${cyan(spark(t.hours))} ${dim("11 pm")}`);
    say(`Longest streak: ${bold(`${t.longestStreak} day${t.longestStreak === 1 ? "" : "s"}`)} in a row ${dim("·")} busiest day: ${bold(t.busiestDay)} (${n(t.busiestDayCount)} commands)`);
    if (t.nightShare >= 0.05) say(`${pct(t.nightShare)} of your commands ran between midnight and 5 am.`);
  }

  const lines2 = [];
  const facts = [];
  if (stats.sudoBang) facts.push(`sudo !! ${bold(n(stats.sudoBang))}×`);
  if (stats.rmrf) facts.push(`rm -rf ${bold(n(stats.rmrf))}×`);
  if (stats.clears) facts.push(`cleared the screen ${bold(n(stats.clears))}×`);
  if (stats.helps) facts.push(`asked for help ${bold(n(stats.helps))}×`);
  if (facts.length) lines2.push(facts.join(dim(" · ")));
  if (stats.editors.length) {
    const [name, count] = stats.editors[0];
    const rival = stats.editors[1] ? dim(` (vs ${stats.editors[1][0]} ${n(stats.editors[1][1])})`) : "";
    lines2.push(`Editor of choice: ${bold(name)} ${n(count)}${rival}`);
  }
  if (stats.packageManagers.length) lines2.push(`Favourite package manager: ${bold(stats.packageManagers[0][0])}`);
  if (stats.longestPipe && stats.longestPipe.pipes >= 2) {
    lines2.push(`Longest pipeline: ${bold(stats.longestPipe.pipes)} pipes`);
    lines2.push(dim(`  ${stats.longestPipe.cmd}`));
  }
  if (lines2.length) {
    head("Fun facts");
    for (const l of lines2) say(l);
  }

  head("Your terminal personality");
  say(`${green("★")} ${bold(stats.persona.name)}`);
  say(dim(stats.persona.tagline));
  say();
  return lines.join("\n");
}
