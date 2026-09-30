# 匿名链接技法 · 从分享链接里把文档（含 HTML 区块）完整取出来

适用：只有一条分享链接、`lark-cli` 打不开（无授权）的飞书文档。

**合法边界**：只在文档**确实对匿名开放**时使用。判定依据是页面里的
`window.anonymousAccess = { isAnonymousAccess: "True" }`。**为 `False` 就停手**，
让用户自己改分享权限或导出——不要试图绕过鉴权。

---

## 第 1 步：换 UA（关键的 30 秒）

**桌面 UA 会被 302 到登录页**，哪怕文档其实是匿名可读的：

```bash
curl -sL -o /dev/null -w "%{http_code} %{url_effective}\n" \
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36" "$URL"
# → 302 accounts.feishu.cn/accounts/page/login?...
```

**换 iPhone UA 就直接 200**：

```bash
curl -sL -o feishu_doc.html -w "%{http_code} %{size_download}\n" \
  -A "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" \
  "$URL"
```

这一步是很多人卡住的地方——**看到登录跳转就下结论"读不了"是错的**，先换 UA 再说。
（`scripts/fetch.sh` 已经把两步都做了，并会体检输出。）

体检要看几个数：

| 信号 | 期望 | 说明 |
|---|---|---|
| `<title>` | 文档标题 | 有标题说明拿到真 SSR |
| `window.DATA` 存在 | ✅ | 能解析 |
| `isAnonymousAccess` | `"True"` | 匿名可读 |
| `docx-isv-block` 出现次数 | 任意 | 数字 = HTML 区块个数 |
| `block_h5` 出现次数 | 任意 | 同上（`view_type` 计数） |

## 第 2 步：解析 `window.DATA`

**它长得像 JSON，但不是 JSON**——键名不带引号，`json.load` 会报
`Expecting property name enclosed in double quotes`。

- ❌ `json.loads(snippet)`
- ✅ 丢进 `node:vm` 求值（`scripts/extract.mjs` 已实现，含花括号配对扫描，能正确处理字符串内的括号）

结构：

```
window.DATA
├── clientVars.data
│   ├── block_map       {blockId: {id, version, data}}   ← 全部块
│   ├── block_sequence  [blockId, ...]                   ← 顶层块顺序
│   └── has_more / cursor / ...
└── meta                {title, token, tenantId, isPermitted, iconInfo}
```

## 第 3 步：还原块树（两个必踩的坑）

**坑 1 —— `data.type` 是字符串，不是数字。**

```
block.data.type === "page" | "text" | "isv" | "divider" | "revision_container" | ...
```

用飞书开放平台的**数字**枚举（`1`=page、`2`=text、`28`=isv）去比对，会**全部匹配失败**，
然后你会得出"这个文档没有 HTML 区块"的错误结论。实测踩过。

**坑 2 —— `block_sequence` 会重复遍历，必须去重。**

`block_sequence` 里既有 page 本身，**又有它的 children**。逐个递归下钻会把同一批块走**两遍**——
13 个 ISV 区块会数成 26 个，导出的文件也会翻倍且重名。

```js
const seen = new Set();
function walk(id) {
  if (seen.has(id)) return;      // ← 这两行不能省
  seen.add(id);
  const b = blocks[id];
  for (const c of b.data?.children || []) walk(c);
}
```

## 第 4 步：识别并导出 HTML 区块

```js
if (block.data.type === "isv") { ... }
```

一个 ISV 块的完整形状：

```jsonc
{
  "id": "doxcn...",
  "data": {
    "type": "isv",
    "app_block_id": "",
    "block_type_id": "blk_6358a421bca0001c190a9805",   // ← docs-addon 的 blockTypeID
    "manifest": { "app_id": "", "app_name": "", "app_version": "", "view_type": "block_h5" },
    "data": { "html": "<!doctype html>...一整套 HTML..." },  // ← 正文在这
    "size": { "width": 0, "height": 0 },
    "comment_details": {}
  }
}
```

**关键**：`data.html` 是**一整份独立 HTML 文档**（从 `<!doctype html>` 到 `</html>`），
含自己的 `<head>`/`<style>`。直接落盘就是可独立打开、可直接复用的文件。

`view_type` 常见值：`block_h5`（iframe 渲染 H5）。`app_id` / `app_name` 常为空——
**空不代表不是小组件**，`view_type` + `block_type_id` 才是判据。

导出：

```bash
node scripts/extract.mjs feishu_doc.html out/
# out/01_标题.html ...
# 同时生成 block_tree.txt（块树）和块类型统计
```

## 第 5 步：体检导出的 HTML

```bash
node scripts/audit-html.mjs out/
```

输出每个文件的外部依赖、动效 keyframes、色板、脚本/SVG 有无，
并给出**是否符合本包设计规范**的评分（见 `design-tokens.md`）。用于：
- 判断一份 HTML 区块能不能离线复用（有没有外链图片/字体）
- 抄别人模板时，先看它用了哪些手法（极简 vs 花哨）

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 302 到登录页 | 桌面 UA | 换 iPhone UA |
| 换 UA 仍登录页 / `isAnonymousAccess: "False"` | 文档未对匿名开放 | 停手，走 `lark-cli` 或让用户改权限 |
| `json` 解析报 `Expecting property name` | 用了 `json.loads` | 改用 `node:vm` |
| 块类型全匹配不上 | 用了数字枚举 | 改成字符串比对 |
| 导出数量是预期的两倍 | `block_sequence` 未去重 | 加 `seen` 集合 |
| `data.html` 里有外链图片/字体 | 原作者用了外部资源 | 离线用需先下载替换；或接受联网依赖 |
| 想导出**图片**块 | 图片不在 `isv` 里 | `image` 块的 token 要走浏览器会话取（见 `clone-and-migrate.md`） |

## 反面教材：不要做的事

- 不要在 `isAnonymousAccess: "False"` 时继续尝试各种绕过（换 UA、找内部 API、伪造 cookie）。这不只是无效，是**越界**。
- 不要把「富文本里的 HTML 标签」当 HTML 区块。飞书富文本是白名单渲染器，你手打的 `<div style>` 会被剥掉或转义显示成文字。
- 不要用 `?theme=light` 之类参数期待改变 SSR 输出——实测无影响。
