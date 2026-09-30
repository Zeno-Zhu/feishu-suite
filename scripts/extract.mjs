// extract.mjs — 从飞书文档 SSR 页面提取 window.DATA，还原块树并导出 HTML 区块
//
// 用法: node extract.mjs <feishu_doc.html> [outdir=out]
//
// 为什么不用 JSON.parse：window.DATA 是 JS 对象字面量（键名不带引号），
// 不是合法 JSON，必须用 vm 求值。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import vm from "node:vm";

const src = process.argv[2];
const outdir = process.argv[3] || "out";

if (!src) {
  console.error("用法: node extract.mjs <feishu_doc.html> [outdir]");
  process.exit(2);
}

const html = readFileSync(src, "utf8");

/** 从 window.<varName> = <object literal> 里扫出花括号配对的对象字面量文本 */
function grabObjectLiteral(haystack, varName) {
  const at = haystack.indexOf("window." + varName);
  if (at < 0) throw new Error(`未找到 window.${varName}（页面可能不是文档 SSR，或需要登录）`);
  const eq = haystack.indexOf("=", at);
  const start = haystack.indexOf("{", eq);
  if (start < 0 || start - eq > 60) throw new Error(`window.${varName} 不是对象字面量`);

  let depth = 0;
  let i = start;
  let inStr = false;
  let esc = false;
  let quote = "";
  for (; i < haystack.length; i++) {
    const c = haystack[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === quote) inStr = false;
    } else if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
    } else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return haystack.slice(start, i + 1);
}

// ---- 1. 求值 window.DATA ----------------------------------------------------
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext("window.DATA = " + grabObjectLiteral(html, "DATA") + ";", ctx, { timeout: 30000 });
const DATA = ctx.window.DATA;

// ---- 2. 定位块表 -----------------------------------------------------------
const d = DATA?.clientVars?.data;
if (!d?.block_map) throw new Error("结构异常：缺少 clientVars.data.block_map");
const blocks = d.block_map;

console.log("文档标题 :", DATA.meta?.title ?? "(未知)");
console.log("token    :", DATA.meta?.token ?? "(未知)");
console.log("顶层块数 :", d.block_sequence.length);
console.log("块总数   :", Object.keys(blocks).length);
console.log("");

// ---- 3. 遍历块树（必须去重！）---------------------------------------------
// 坑：block_sequence 里既有 page 本身，也有它的 children，
//     不做 seen 去重会把同一批块走两遍（13 个 ISV 会变成 26 个）。
// 坑：block.data.type 是字符串（"isv"），不是开放平台的数字枚举（28）。
const seen = new Set();
const treeLines = [];
const stats = {};
const isv = [];
const images = [];
const leftovers = [];

function plainText(dd) {
  return (dd.text?.elements || [])
    .map((e) => {
      if (e.text_run) return e.text_run.content ?? "";
      if (e.mention_page) return `@${e.mention_page.title ?? "page"}`;
      if (e.mention_user) return `@user`;
      if (e.equation) return `$${e.equation.content ?? ""}$`;
      return "";
    })
    .join("");
}

function walk(id, indent = 0) {
  if (seen.has(id)) return;
  seen.add(id);

  const b = blocks[id];
  if (!b) {
    treeLines.push(`${"  ".repeat(indent)}?? 缺失块 ${id}`);
    return;
  }
  const dd = b.data || {};
  const t = dd.type ?? "unknown";
  stats[t] = (stats[t] || 0) + 1;

  if (t === "isv") isv.push({ id, dd });
  else if (t === "image") images.push({ id, dd });
  else if (!["page", "revision_container"].includes(t)) leftovers.push({ id, t, dd });

  const txt = plainText(dd);
  const extra = txt ? ` "${txt.slice(0, 60)}${txt.length > 60 ? "…" : ""}"` : "";
  treeLines.push(`${"  ".repeat(indent)}[${t}] ${id}${extra}`);

  for (const c of dd.children || []) walk(c, indent + 1);
}

for (const id of d.block_sequence) walk(id, 0);

writeFileSync("block_tree.txt", treeLines.join("\n"), "utf8");

// ---- 4. 导出 HTML 区块 -----------------------------------------------------
mkdirSync(outdir, { recursive: true });
const written = [];
let n = 0;

for (const { id, dd } of isv) {
  n++;
  const h = dd.data?.html || "";
  const title =
    (h.match(/<title>(.*?)<\/title>/is) || [, ""])[1].trim() ||
    (h.match(/<meta\s+name="description"\s+content="(.*?)"/is) || [, ""])[1].trim() ||
    `isv_${n}`;

  // ASCII 文件名：避免 file:// iframe 对中文路径的兼容问题
  const slug = (title.match(/[A-Za-z0-9]+/g) || []).join("-").toLowerCase() || `block-${n}`;
  const file = `${outdir}/${String(n).padStart(2, "0")}_${slug}.html`;
  writeFileSync(file, h, "utf8");
  written.push({ file, title, bytes: h.length, viewType: dd.manifest?.view_type, blockTypeId: dd.block_type_id });
  console.log(
    `  导出 ${file}  ${h.length}B  view_type=${dd.manifest?.view_type ?? "-"}  title="${title}"`,
  );
}

// ---- 5. 汇总 ---------------------------------------------------------------
console.log("");
console.log("===== 块类型统计 =====");
for (const [k, v] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}

console.log("");
console.log(`HTML 区块(isv) : ${isv.length} 个 -> ${outdir}/`);
console.log(`图片块         : ${images.length} 个（token 需走浏览器会话取，见 clone-and-migrate.md）`);
console.log(`其他内容块     : ${leftovers.length} 个`);
console.log(`块树已写入     : block_tree.txt`);

if (images.length) {
  const toks = images.map((x) => x.dd.token).filter(Boolean);
  writeFileSync("image_tokens.txt", toks.join("\n"), "utf8");
  console.log(`图片 token 列表: image_tokens.txt（${toks.length} 个）`);
}

// 供下游脚本消费
writeFileSync(
  "extract_report.json",
  JSON.stringify({ title: DATA.meta?.title, token: DATA.meta?.token, stats, isv: written, imageTokens: images.map((x) => x.dd.token).filter(Boolean) }, null, 2),
  "utf8",
);
console.log("结构化报告     : extract_report.json");
