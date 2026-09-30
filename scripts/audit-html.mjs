// audit-html.mjs — 给导出的 HTML 区块做体检 + 规范符合度打分
//
// 用法: node audit-html.mjs <目录或单个 .html> [更多文件...]
//
// 做两件事：
//   1. 事实采集 —— 外部依赖、动效、色板、脚本/SVG、体积
//   2. 规范打分 —— 对照 design-tokens.md 的自查清单
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// ---- 规范：每条 = [检查函数, 分值, 说明] ------------------------------------
const RULES = [
  ["圆角", (h) => /border-radius\s*:\s*1[0-9]px|border-radius\s*:\s*0?[89]px/i.test(h), 10, "body 上应有 border-radius（推荐 12px）"],
  ["深色渐变底", (h) => /linear-gradient\([^)]*#0[0-9a-f]{5}/i.test(h), 15, "深色线性渐变底（如 #050810 → #0d1421）"],
  ["淡光斑", (h) => /radial-gradient\([^)]*rgba\([^)]*(?:0)?\.0[0-9]/i.test(h), 10, "一层极淡径向光斑（alpha ≤ .05）提升质感；注意 .05 和 0.05 两种写法都合法"],
  ["渐变文字完整", (h) => {
    const clip = /-webkit-background-clip\s*:\s*text|background-clip\s*:\s*text/i.test(h);
    if (!clip) return true; // 没用渐变文字，不扣分
    const fill = /-webkit-text-fill-color\s*:\s*transparent/i.test(h);
    const both = /-webkit-background-clip/i.test(h) && /(?<!-webkit-)background-clip/i.test(h);
    return fill && both;
  }, 10, "用渐变文字时，-webkit-background-clip / background-clip / -webkit-text-fill-color:transparent 三件套要齐"],
  ["飞书 meta", (h) => /name="use-iframe"/i.test(h) && /name="html-box-height-mode"/i.test(h), 15, "需 use-iframe + html-box-height-mode:auto 两个约定 meta"],
  ["零脚本", (h) => !/<script/i.test(h), 15, "HTML 区块不应含 <script>（安全 + 避免被 CSP 拦）"],
  ["动效克制", (h) => {
    const n = new Set([...h.matchAll(/animation:\s*([A-Za-z_][\w-]*)/g)].map((m) => m[1])).size;
    return n <= 3;
  }, 10, "同一模块动效种类 ≤ 3"],
  ["动效周期不过短", (h) => {
    const durs = [...h.matchAll(/animation:[^;]*?([\d.]+)s\b/g)].map((m) => parseFloat(m[1]));
    return durs.every((d) => d >= 0.8);
  }, 10, "动效周期应 ≥ 0.8s，再快就成噪音"],
  ["宽度自适应", (h) => !/width\s*:\s*\d{4,}px/i.test(h) && !/position\s*:\s*fixed/i.test(h), 5, "不要写死大宽度，也不要用 position:fixed"],
];

function audit(file) {
  const h = readFileSync(file, "utf8");

  const title = (h.match(/<title>(.*?)<\/title>/is) || [, ""])[1].trim();
  const desc = (h.match(/<meta\s+name="description"\s+content="(.*?)"/is) || [, ""])[1].trim();

  const extScripts = [...h.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  const extLinks = [
    ...h.matchAll(/<link[^>]*href="([^"]+)"/g),
    ...h.matchAll(/@import\s+url\(['"]?([^'")]+)/g),
  ].map((m) => m[1]);
  const extImgs = [...h.matchAll(/<img[^>]*src="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  const dataUris = (h.match(/data:image\//g) || []).length;

  const anims = [...new Set([...h.matchAll(/animation:\s*([A-Za-z_][\w-]*)/g)].map((m) => m[1]))];
  const kfs = [...new Set([...h.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]))];
  const hexes = [...new Set([...h.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()))];

  let score = 0;
  let max = 0;
  const rows = [];
  for (const [name, fn, pts, hint] of RULES) {
    max += pts;
    let ok = false;
    try { ok = !!fn(h); } catch { ok = false; }
    if (ok) score += pts;
    rows.push({ name, ok, pts, hint });
  }

  return {
    file, title, desc, bytes: h.length,
    extScripts, extLinks, extImgs, dataUris,
    anims, kfs, hexes,
    hasSvg: /<svg/i.test(h),
    score, max, rows,
  };
}

// ---- 主流程 ---------------------------------------------------------------
const args = process.argv.slice(2);
if (!args.length) {
  console.error("用法: node audit-html.mjs <目录或 .html 文件> [...]");
  process.exit(2);
}

const files = [];
for (const a of args) {
  const st = statSync(a);
  if (st.isDirectory()) {
    for (const f of readdirSync(a).sort()) {
      if (extname(f).toLowerCase() === ".html") files.push(join(a, f));
    }
  } else if (extname(a).toLowerCase() === ".html") {
    files.push(a);
  }
}

if (!files.length) {
  console.error("没有找到 .html 文件");
  process.exit(1);
}

let totalScore = 0;
const allExt = new Set();

for (const f of files) {
  const r = audit(f);
  totalScore += (r.score / r.max) * 100;
  [...r.extScripts, ...r.extLinks, ...r.extImgs].forEach((u) => allExt.add(u));

  const pct = Math.round((r.score / r.max) * 100);
  const bar = "█".repeat(Math.round(pct / 5)).padEnd(20, "·");
  console.log(`\n─── ${r.file}`);
  console.log(`    ${r.title || "(无 title)"}${r.desc ? "  ·  " + r.desc : ""}`);
  console.log(`    ${r.bytes}B   规范 ${bar} ${pct}%  (${r.score}/${r.max})`);
  console.log(`    动效: ${r.anims.length ? r.anims.join(", ") : "无"}${r.kfs.length ? `  [keyframes: ${r.kfs.join(", ")}]` : ""}`);
  console.log(`    色板: ${r.hexes.slice(0, 10).join(" ")}${r.hexes.length > 10 ? ` …共${r.hexes.length}` : ""}`);
  console.log(`    资源: 外链script ${r.extScripts.length} · 外链css ${r.extLinks.length} · 外链图 ${r.extImgs.length} · 内联dataURI ${r.dataUris} · SVG ${r.hasSvg ? "有" : "无"}`);

  const fails = r.rows.filter((x) => !x.ok);
  if (fails.length) {
    console.log(`    ⚠ 未达成:`);
    for (const x of fails) console.log(`       - ${x.name}(-${x.pts}) ${x.hint}`);
  } else {
    console.log(`    ✓ 全部规范达成`);
  }
}

console.log(`\n════════ 汇总 ════════`);
console.log(`文件数        : ${files.length}`);
console.log(`平均规范符合度: ${Math.round(totalScore / files.length)}%`);
console.log(`外部依赖      : ${allExt.size} 个${allExt.size ? "" : "（可完全离线复用）"}`);
if (allExt.size) {
  for (const u of [...allExt].slice(0, 15)) console.log(`   · ${u}`);
  if (allExt.size > 15) console.log(`   …还有 ${allExt.size - 15} 个`);
  console.log(`提示: 要离线/迁移就需内联这些资源（字体转 base64、图片转 data URI 或落本地）。`);
}
