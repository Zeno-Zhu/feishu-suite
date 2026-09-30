# feishu-suite · 飞书能力整合包

一个入口，四条路径。把「读飞书文档 / 写飞书文档 / 克隆飞书文档 / 让飞书文档变好看」收敛成一个 skill。

> 面向 AI Agent（Claude Code / Codex / WorkBuddy / 任意支持 `SKILL.md` 的宿主）。

---

## 它解决什么问题

飞书生态里的 skill 已经很多了，但都有同一个断层：

| 你想干的事 | 常见 skill 的做法 | 断层 |
|---|---|---|
| 读一份**只有分享链接**的文档 | 走官方 API | ❌ 无授权时 401/403，直接卡死 |
| 把文档里**好看的视觉模块**扒出来 | 无解 | ❌ 官方 API 对 HTML 区块**只返回空壳** |
| 自己做一个「好看的模块」 | 无解 | ❌ 不知道该用 docs-addon，还是不知道飞书富文本会剥掉 HTML |
| 往文档里写东西 | 直接 append Markdown | ❌ 表格变碎片、`$` 变公式、代码块多空行 |

**这个包把上面四条全部补上**，并且明确区分「有授权」和「只有链接」两条完全不同的技术路线。

---

## 核心贡献：两条独有技法

### 1️⃣ 匿名链接技法（`references/anonymous-extract.md`）

官方 API **拿不到** HTML 区块内部的 HTML——它只返回一个空壳 block。
本包通过解析 SSR 页面里的 `window.DATA`，能拿到 **13/13 个区块的完整原始 HTML**。

```
桌面 UA  → 302 到登录页（假象）
iPhone UA → 200，拿到真 SSR 页面
window.DATA → JS 对象字面量，不是 JSON，必须用 node:vm 求值
block_map → 递归 children 还原块树（必须去重）
type === "isv" → data.html 就是一整份完整 HTML
```

三个实测踩过的坑，都写进文档了：**类型字段是字符串不是数字**、**`block_sequence` 会重复遍历（13 数成 26）**、**`json.load` 会崩**。

### 2️⃣ HTML 区块逆向 + 设计令牌（`references/html-block-authoring.md`）

「为什么他们的飞书文档那么好看？」——因为那些模块**不是飞书原生排版**，
是飞书官方的 [云文档小组件（docs-addon）](https://open.feishu.cn/document/client-docs/docs-addon/)。

本包给出了判定特征表、内嵌 HTML 的约定 meta、以及**从真实文档逆向出的设计令牌**
（深色渐变底、粉紫渐变文字、玻璃拟态卡片、8 种动效用法、`border-radius:12px` 等），
还有一份 `scripts/audit-html.mjs` 把你的 HTML 按这套令牌打分。

**顺带把代价说清楚**：HTML 区块不参与搜索/目录/导出，不适合承载关键信息。
关键内容用原生块，视觉层用 HTML 区块。

---

## 快速开始

```bash
# ① 读一份「只有分享链接」的文档，并导出全部 HTML 区块
bash scripts/fetch.sh "https://xxx.feishu.cn/docx/<token>" doc.html
node scripts/extract.mjs doc.html out/
node scripts/audit-html.mjs out/          # 体检：外部依赖 / 动效 / 色板 / 规范得分

# ② 有授权时，走官方 CLI（能力最全）
lark-cli auth status
lark-cli docs +fetch  --as user --doc "<url>" --format json
lark-cli docs +create --as user --title "标题" --markdown "# 内容"

# ③ 对照自查：自己写的 HTML 区块够不够规范
node scripts/audit-html.mjs examples/     # → 100%，零外部依赖
```

`examples/` 里有两个符合全部规范的模块（科技风 Banner、价格表），可直接套用改字。

---

## 目录结构

```
feishu-suite/
├── SKILL.md                              # 主入口：三条判定 + 五条路径路由
├── references/
│   ├── capability-map.md                 # 能力地图、lark-cli 域清单、身份模型、退出码
│   ├── anonymous-extract.md              # 【独有】匿名链接技法全解
│   ├── html-block-authoring.md           # 【独有】自己造 HTML 区块的两条路
│   ├── design-tokens.md                  # 【独有】逆向出的设计令牌 + 自查清单
│   ├── write-pitfalls.md                 # 写入飞书文档的坑清单
│   ├── clone-and-migrate.md              # 克隆/迁移，含图片 403 兜底序列
│   └── block-types.md                    # 块类型对照（字符串 ↔ 数字，两套标识）
├── scripts/
│   ├── fetch.sh                          # 移动端 UA 抓 SSR + 体检
│   ├── extract.mjs                       # 解析 window.DATA，还原块树，导出 HTML 区块
│   └── audit-html.mjs                    # HTML 区块规范体检 + 打分
└── examples/
    ├── 01_banner.html                    # 科技风头图 Banner（100%）
    └── 02_pricing.html                   # 价格表（100%）
```

---

## 设计原则

1. **不重复官方文档。** `lark-cli` 的命令清单会变，`--help` 才是权威。
   本包只固化「官方文档里没有、且踩过的坑」。
2. **渐进披露。** 主 `SKILL.md` 只做路由，细节在命中的 reference 里。避免一上来灌满上下文。
3. **合法边界写在最前面。** 匿名技法只在 `isAnonymousAccess: "True"` 时使用；
   扒来的 HTML 是**参考资料**，正式用要注册自己的 docs-addon 应用。
4. **代价要说清楚。** 不吹 HTML 区块。它的搜索/导出/无障碍缺陷都写在文档里。

---

## 依赖

| 依赖 | 用途 | 必需 |
|---|---|---|
| `node` ≥ 18 | 运行 `extract.mjs` / `audit-html.mjs` | 路径 B、E 需要 |
| `python`（可选） | `fetch.sh` 的内容体检 | 可选，缺失会自动跳过 |
| [`lark-cli`](https://open.feishu.cn/) | 路径 A/C/D 的全部读写能力 | 有授权场景需要 |
| `curl` | `fetch.sh` | 路径 B 需要 |

---

## 鸣谢 / 参考

本包在编写时研读了以下开源项目，吸收了它们的经验（**均为独立重写，未复制代码**）：

| 项目 | 吸收了什么 |
|---|---|
| [cso1z/Feishu-MCP](https://github.com/cso1z/Feishu-MCP) | MCP / CLI / Skill 三形态的取舍思路 |
| [leemysw/feishu-docx](https://github.com/leemysw/feishu-docx) | 文档 ↔ Markdown 的导出/写入边界，`export-browser` 的定位 |
| [wetlink/lark-doc-clone-skill](https://github.com/wetlink/lark-doc-clone-skill) (MIT) | 克隆决策树、图片 403 的浏览器会话取图、`internal-api-drive-stream` URL 兜底序列、代码块逐字校验 |
| [mollyhan-ai/switchable-content-cards-for-feishu](https://github.com/mollyhan-ai/switchable-content-cards-for-feishu) (MIT) | **关键**：docs-addon 的 `app.json` 结构、`blockTypeID` 与 `contributes.addPanel` 的对应关系、opdev 发布流程 |
| [ASauler/skill-feishu-docx-powerwrite](https://github.com/ASauler/skill-feishu-docx-powerwrite) | 写入坑：分块大小、表格碎片化、`$` 转义、子 agent 截断 |
| [zarazhangrui/beautiful-feishu-whiteboard](https://github.com/zarazhangrui/beautiful-feishu-whiteboard) | 「成套设计令牌 > 单点炫技」的设计思路、调色板目录化组织 |
| [liangdabiao/lark-workflow-feishu-cli](https://github.com/liangdabiao/lark-workflow-feishu-cli) | lark-cli 工作流分层（域 skill + workflow skill）的组织方式 |

飞书开放平台官方文档：[云文档小组件](https://open.feishu.cn/document/client-docs/docs-addon/)、
[文档块 API](https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/document-docx/docx-v1/document/convert)。

---

## License

MIT
