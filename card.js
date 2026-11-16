// Drawing the shareable card (1080 × 1350, a portrait social image).
import { hourName, WEEKDAYS } from "./stats.js";

const n = (x) => x.toLocaleString("en-US");

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export function drawCard(c, card) {
  const g = c.getContext("2d");
  const W = c.width;
  const H = c.height;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#2a1650");
  bg.addColorStop(0.55, "#120c22");
  bg.addColorStop(1, "#0b1d2e");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.textBaseline = "alphabetic";

  const text = (s, x, y, font, color, align = "left") => {
    g.font = font;
    g.fillStyle = color;
    g.textAlign = align;
    g.fillText(s, x, y);
  };
  const fit = (s, max, font) => {
    g.font = font;
    let t = s;
    while (g.measureText(t).width > max && t.length > 1) t = t.slice(0, -2) + "…";
    return t;
  };

  const M = 80;
  text(">_ hindsight", M, 120, `700 34px ${MONO}`, "#ff5fa2");
  text(card.y ? `my ${card.y} in the terminal` : "my life in the terminal", M, 190, `800 58px ${SANS}`, "#efeaf8");

  text(n(card.c), M, 330, `800 120px ${SANS}`, "#ffc857");
  text(`commands · ${n(card.u)} different programs`, M, 380, `500 34px ${SANS}`, "#a39bb8");

  // top commands with bars
  text("TOP COMMANDS", M, 470, `700 26px ${SANS}`, "#a39bb8");
  const max = card.top[0]?.[1] || 1;
  card.top.slice(0, 5).forEach(([name, count], i) => {
    const y = 520 + i * 62;
    text(String(i + 1), M, y + 10, `700 30px ${MONO}`, "#6f6688");
    text(fit(name, 230, `700 34px ${MONO}`), M + 50, y + 10, `700 34px ${MONO}`, "#5ce1e6");
    const bw = Math.max(8, (count / max) * 470);
    g.fillStyle = i === 0 ? "#ff5fa2" : "#4b3d73";
    g.beginPath();
    g.roundRect(M + 300, y - 16, bw, 34, 8);
    g.fill();
    text(n(count), M + 310 + bw + 4, y + 10, `600 28px ${SANS}`, "#efeaf8");
  });

  // typo + time facts
  let y = 870;
  if (card.ty?.length) {
    const t = card.ty[0];
    text("FAVOURITE TYPO", M, y, `700 26px ${SANS}`, "#a39bb8");
    text(`${t.typo}`, M, y + 56, `800 50px ${MONO}`, "#ff5fa2");
    g.font = `800 50px ${MONO}`;
    const w = g.measureText(t.typo).width;
    text(`→ ${t.meant}  ·  ${n(t.n)}×`, M + w + 24, y + 54, `600 34px ${SANS}`, "#efeaf8");
    y += 120;
  }
  if (card.t) {
    text("PEAK HOUR", M, y, `700 26px ${SANS}`, "#a39bb8");
    text(hourName(card.t.h), M, y + 54, `800 46px ${SANS}`, "#efeaf8");
    text("LONGEST STREAK", M + 330, y, `700 26px ${SANS}`, "#a39bb8");
    text(`${card.t.s} days`, M + 330, y + 54, `800 46px ${SANS}`, "#efeaf8");
    text("BUSIEST DAY", M + 660, y, `700 26px ${SANS}`, "#a39bb8");
    text(WEEKDAYS[card.t.w].slice(0, 3), M + 660, y + 54, `800 46px ${SANS}`, "#efeaf8");
    y += 110;
  } else if (card.git?.length) {
    text("GIT", M, y, `700 26px ${SANS}`, "#a39bb8");
    text(card.git.map(([s, k]) => `${s} ${n(k)}`).join("   "), M, y + 52, `700 38px ${MONO}`, "#efeaf8");
    y += 110;
  }

  // persona
  g.fillStyle = "rgba(255,95,162,0.12)";
  g.beginPath();
  g.roundRect(M - 20, H - 260, W - 2 * M + 40, 170, 22);
  g.fill();
  text("MY TERMINAL PERSONALITY", M + 10, H - 214, `700 24px ${SANS}`, "#ff5fa2");
  text(fit(card.p.name, W - 2 * M - 20, `800 54px ${SANS}`), M + 10, H - 152, `800 54px ${SANS}`, "#efeaf8");
  text(fit(card.p.tagline, W - 2 * M - 20, `500 26px ${SANS}`), M + 10, H - 112, `500 26px ${SANS}`, "#a39bb8");

  text("npx github:SAMARTHJAISWAL/hindsight", W / 2, H - 40, `500 26px ${MONO}`, "#6f6688", "center");
}

