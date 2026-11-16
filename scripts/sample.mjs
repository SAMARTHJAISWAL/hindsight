// Generate test/fixtures/sample_year: a made-up but realistic year of zsh
// history (no real person's commands), used by the tests and the README.
import { writeFileSync } from "node:fs";

let seed = 20261116;
const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const pick = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
};

const commands = [
  ["git status", 60], ["git add .", 28], ['git commit -m "wip"', 24], ["git push", 18], ["git pull", 14],
  ["git checkout -b feature", 6], ["git log --oneline", 8], ["git diff", 12], ["gti status", 3], ["git stash", 4],
  ["ls", 40], ["ls -la", 14], ["cd ..", 20], ["cd ~/code/app", 16], ["clear", 18],
  ["npm run dev", 22], ["npm test", 14], ["npm install", 8], ["npx prettier --write .", 3],
  ["docker compose up -d", 9], ["docker ps", 7], ["kubectl get pods", 6], ["kubectl logs api-7d9f", 3],
  ["vim src/app.ts", 12], ["code .", 9], ["python3 scripts/report.py", 7], ["pyhton3 scripts/report.py", 1],
  ["cat app.log | grep ERROR | sort | uniq -c | sort -rn | head", 2], ["sudo !!", 2], ["rm -rf node_modules", 2],
  ["ssh deploy@staging", 4], ["curl -s localhost:3000/health", 5], ["brew upgrade", 2], ["man tar", 1],
];
const hours = Array.from({ length: 24 }, (_, h) => [h, h < 2 ? 3 : h < 8 ? 0.3 : h < 10 ? 2 : h < 13 ? 5 : h < 18 ? 6 : h < 22 ? 7 : 5]);

const lines = [];
for (let day = 0; day < 315; day++) {
  const date = new Date(Date.UTC(2026, 0, 1 + day));
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  if (rand() < (weekend ? 0.55 : 0.08)) continue; // days off
  const count = Math.floor((weekend ? 8 : 25) + rand() * 40);
  for (let i = 0; i < count; i++) {
    const t = Math.floor(date.getTime() / 1000) + pick(hours) * 3600 + Math.floor(rand() * 3600);
    lines.push([t, pick(commands)]);
  }
}
lines.sort((a, b) => a[0] - b[0]);
writeFileSync(new URL("../test/fixtures/sample_year", import.meta.url), lines.map(([t, c]) => `: ${t}:0;${c}`).join("\n") + "\n");
console.log(`${lines.length} commands`);
