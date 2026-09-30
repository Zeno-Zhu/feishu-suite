---
name: feishu-suite
description: 飞书/Lark 能力整合包（单一入口）。覆盖读文档、写文档、克隆迁移、以及「让飞书文档变好看」的 HTML 区块/云文档小组件。核心决策：有授权走 lark-cli（27 个官方 lark-* skill），只有匿名分享链接走 SSR + window.DATA 解析技法（能拿到 lark-cli 拿不到的 ISV/HTML 区块源码）。触发词：飞书、Lark、飞书文档、飞书链接、飞书 skill、飞书 CLI、lark-cli、读飞书、写飞书文档、导出飞书、克隆飞书文档、飞书文档好看的模块、飞书 HTML 区块、飞书云文档小组件、docs-addon、飞书白板。
agent_created: true
metadata:
  version: "1.0.0"
  license: MIT
---

# 飞书能力整合包

一个入口，四条路径。**先判断走哪条，再动手**——选错路径是这个领域最大的时间浪费。

## 第 0 步：三条判定（必做）

| 判定 | 问什么 | 为什么重要 |
|---|---|---|
| **① 有没有授权** | 这份文档/资源是**我（用户）有权限的**，还是**只有一条分享链接**？ | 有授权用 `lark-cli`（能力全、可读写）；只有链接用匿名技法（`lark-cli` 会 401/403） |
| **② 目标是什么** | **读** / **写** / **克隆** / **变好看**？ | 决定读哪个 reference |
| **③ 是不是 wiki** | URL 里是 `/wiki/` 还是 `/docx/`？ | `/wiki/` 的 token **不是**文档 token，必须先解析成 `obj_token` |

判定完按下表路由：

| 场景 | 路径 | 必读 |
|---|---|---|
| 读**有权限**的文档 / 表格 / Base / 消息 / 日历 / 邮件 | **A · lark-cli** | [capability-map.md](references/capability-map.md) |
| 读**只有分享链接**的文档（尤其匿名可读） | **B · 匿名技法** | [anonymous-extract.md](references/anonymous-extract.md) |
| **写/改**飞书文档（新建、追加、插表格、传图） | **C · 写入** | [write-pitfalls.md](references/write-pitfalls.md) |
| **克隆/迁移**一份不是我的文档（无复制权限） | **D · 克隆** | [clone-and-migrate.md](references/clone-and-migrate.md) |
| 让文档**变好看**（HTML 区块 / 云文档小组件） | **E · 视觉** | [html-block-authoring.md](references/html-block-authoring.md) |

---

## 路径 A · lark-cli（有授权时的首选）

飞书官方 CLI，本机已有：`lark-cli`（connector 提供，v1.0.97）。

```bash
lark-cli auth status                    # 先看身份：user 还是 bot
lark-cli <domain> --help                # 域清单（优先用 +shortcut，其次用裸 API）
lark-cli schema <service>.<res>.<method> # 调之前先查参数，别猜 flag
```

**三条铁律**（详见 [capability-map.md](references/capability-map.md)）：

1. **身份决定代表谁**：`--as user` 代表用户本人（能看个人云空间/日历）；`--as bot` 代表应用自己（查用户资源会**返回空成功而不是报错**——最阴的坑）。
2. **成功判定用 `ok == true`**，不要用 `code == 0`。成功信封没有顶层 `code`，照着 OpenAPI 老格式判会把所有成功调用误判为失败。
3. **退出码 10 是高风险确认门禁，不是错误**。停下来向用户确认，取得显式同意后再把 `hint` 指的 flag 追加到 argv 末尾重试。**绝不静默加确认 flag**。

`lark-cli` 已覆盖：docs / drive / sheets / base / im / mail / calendar / task / approval / attendance / contact / wiki / slides / whiteboard / minutes / note / okr / event / apps / markdown / mindnotes。

---

## 路径 B · 匿名技法（只有链接时的唯一解）

**为什么不能只靠 lark-cli**：官方 API 对「HTML 区块（云文档小组件）」只返回一个空壳 block，**拿不到里面的 HTML**。而 SSR 页面里的 `window.DATA` 里有完整原文。

四步：

1. **桌面 UA 会被 302 到登录页 —— 换 iPhone UA**（这不是绕过鉴权，匿名可读的文档本来就该能读）。
2. 解析 `window.DATA`：它是 **JS 对象字面量（键名无引号），不是合法 JSON**，必须用 `node:vm` 求值。
3. 遍历 `clientVars.data.block_map` 还原块树。两个必踩的坑：`block.data.type` 是**字符串**；`block_sequence` 含 page 及其 children，**不去重会把 13 个块数成 26 个**。
4. 导出 `data.type === "isv"` 的块 → 每块 `data.html` 就是一整份完整 HTML。

```bash
bash scripts/fetch.sh "<飞书链接>" feishu_doc.html
node scripts/extract.mjs feishu_doc.html out/
node scripts/audit-html.mjs out/          # 批量体检：外部资源/动效/色板/规范符合度
```

完整原理、字段表与坑清单 → [anonymous-extract.md](references/anonymous-extract.md)

---

## 路径 C · 写入

`lark-cli docs +create` / `+update` / `+media-insert`（短cut 已封装好编排与回滚）。

**最容易翻车的四条**（全量清单见 [write-pitfalls.md](references/write-pitfalls.md)）：

- **Markdown 表格会被打散成碎片文本** → 必须建**原生表格块**。
- **`$` 会被当 LaTeX 公式**：`$82.78` 渲染成公式 → 写 `82.78 美元` 或 `USD 82.78`。
- **追加内容单次别过长** → 分块追加；且尽量**一次性导入成文**，反复 append 会在代码块里插入空行（克隆场景属于 bug，不是"可接受的归一化差异"）。
- **相对路径**：`--file`/`--output` 只收 cwd 下的相对路径，传绝对路径报 `unsafe file path`。大数据走 stdin。

---

## 路径 D · 克隆 / 迁移

目标：在**我自己的位置**造一份内容等价的副本。决策树：

1. **先试原生复制**（`drive files copy` / `wiki nodes copy`）。别只看命令返回，要**去目标位置列一遍确认新节点真的在**。
2. 原生失败（`forbidden` / `1061004` / 空 `exit=1`）再**从 Markdown 重建**。
3. 图片被 403 拦时，**用浏览器会话取图**（带 `credentials: "include"` 打 `internal-api-drive-stream` 的几种 URL 形态 `preview` / `cover` / 直链），飞书是激进懒加载，要滚动触发。
4. **验证**：替换图片标签后比对源与产物文本，**代码块内容必须逐字相同**。

详见 [clone-and-migrate.md](references/clone-and-migrate.md)（含图片 URL 兜底序列与校验脚本用法）。

---

## 路径 E · 视觉（"为什么他们的飞书文档那么好看"）

短答案：**那不是飞书原生排版，是飞书官方的「云文档小组件」（docs-addon）**——本质是把你自己的 HTML 塞进文档里用 iframe 渲染。

判定特征（在任意飞书文档的 SSR HTML 里 grep 就能验）：

| 证据 | 含义 |
|---|---|
| `class="block docx-isv-block"` | 这是个 ISV 区块 |
| `block.data.type === "isv"` | 块类型（**字符串**） |
| `manifest.view_type === "block_h5"` | 以 iframe 加载 H5 |
| `block.data.html` | 内嵌的完整 HTML 文档 |
| `block_type_id: "blk_..."` | 对应 docs-addon 的 `blockTypeID` |

内嵌 HTML 的约定标记：

```html
<meta name="use-iframe" content="true">
<meta name="html-box-height-mode" content="auto">
```

**要自己造一个，有两条路**：官方 `opdev` docs-addon 脚手架（正式、可发布、需应用审核）／复用既有区块位（快，但要看清是哪个 app 的位）。两条路的完整流程、设计令牌与文案规范 → [html-block-authoring.md](references/html-block-authoring.md) + [design-tokens.md](references/design-tokens.md)。

> **别踩**：`feishu-docx` 那类「预置块拼装」的写法**造不出 HTML 区块**。HTML 区块只能来自已注册的 docs-addon 应用。
> 也别承诺"把 HTML 粘进正文就能渲染"——飞书富文本渲染器是白名单式的，`<script>`/`<div>` 会被剥掉或转义。

---

## 权威文件的位置

| 内容 | 在哪 |
|---|---|
| `lark-cli` 用法、身份、权限、退出码 | `lark-cli skills read lark-shared`；或已装的 `lark-shared` skill |
| 各域详细命令 | `lark-cli <domain> --help`，`lark-cli schema <method>` |
| 块类型枚举 | [block-types.md](references/block-types.md) |
| 本包独有技法 | `references/anonymous-extract.md`、`references/html-block-authoring.md` |

**别在本包里重复维护 lark-cli 的命令清单**——它会变，`--help` 才是权威。本包只固化「官方文档里没有、踩过的坑」。
