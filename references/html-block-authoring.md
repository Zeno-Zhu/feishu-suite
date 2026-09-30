# 自己造 HTML 区块 · 两条路 + 完整流程

前提：**HTML 区块不是"排版能力"，是"应用能力"。** 它只能来自一个已在飞书开放平台
注册并发布的 `docs-addon` 应用。飞书富文本渲染器是白名单式的，你把 `<div style>` 粘进正文
只会看到文字。

---

## 先认清这个东西的官方名字

| 叫法 | 出现在哪 |
|---|---|
| **云文档小组件** | 飞书产品界面里的名字（"+"菜单 / `/` 命令里搜得到） |
| **docs-addon** | 开放平台的 appType |
| ISV 区块 | 文档数据里的 `block.type === "isv"` |
| `view_type: block_h5` | 渲染方式：iframe 加载 H5 |
| `blockTypeID: "blk_..."` | 应用注册时分配，出现在每个实例块里 |
| `docx-isv-block` | 文档 DOM 的 class |

`app.json` 长这样（真实结构）：

```json
{
  "manifestVersion": 1,
  "appID": "cli_xxxxxxxxxxxx",
  "appType": "docs-addon",
  "blockTypeID": "blk_xxxxxxxxxxxxxxxxxx",
  "projectName": "switchable-content-cards",
  "initialHeight": 620,
  "contributes": {
    "addPanel": {
      "view": "index.html",
      "initialHeight": 620,
      "useHostLoading": false,
      "align": "center",
      "resizeType": "horizontal"
    }
  }
}
```

`initialHeight` + `resizeType` 就是「高度自适应」的来源。

---

## 路线 1 · 官方脚手架（正式、可发布）

适合：你要一个**自己的、可复用、可分享**的区块。

```bash
# 官方建议 Node.js ≤ 18.20.8
npm run login            # 登录飞书正式环境
opdev create             # 建 docs-addon 项目 → 拿到 appID 与 blockTypeID
# 把它们填进 app.json
npm start                # 在开发者工具打开的测试文档里调试
npm run upload           # 上传 dist 程序包
```

然后在开放平台后台：

1. 选程序包，填小组件信息，**把小组件加进云文档工具列表**。
2. 权限管理 → API 权限 → 开通 `docx:document:write_only`（最小）/ `docx:document`（更大）。
   - 要往文档里存数据（Record）就必须有写权限。`docx:document:readonly` 不够。
3. 版本管理与发布 → 创建应用版本 → 提交发布。企业如需审核，要管理员通过。

**两个版本号是两套**，别混：
- `package.json` 的版本 = **代码程序包**（如 `0.3.1`）
- 开放平台的版本 = **正式应用发布**（如 `1.0.2`）

代码改了 → `npm run upload` → 后台选新程序包 → 建**新的应用版本** → 发布。
**只加 API 权限也要重新发版**，否则配置对正式应用不生效。

### 关键限制

- **飞书测试企业不支持创建和调试云文档小组件。** 必须用正式企业。
- 小组件默认不访问外部网络。要发外部请求必须在安全设置里加**服务器域名白名单**（CSP）。
- 用户在文档里的使用流程是：`+` 菜单插入 → 小组件内"导入/编辑" → 保存。
  **内容存在当前小组件实例的 Record 里**，复制小组件会连内容一起复制。
  → 所以"换一批内容"不需要重新发布应用，直接改 Record 即可。

## 路线 2 · 复用既有区块位（快，但有前提）

适合：我**已经有一个**能用的 HTML 区块（比如从别人的文档里导出来的），只想改内容。

做法：把区块的 `data.html` 换掉。

**必须先确认这个区块属于谁的应用**：

1. 从文档 SSR 里读该块的 `block_type_id`。
2. 判断这个 `blk_...` 是不是**你自己的**应用。
   - 如果 `app_id`/`app_name` 为空，且 `block_type_id` 是别人的 → **你换不了**，
     因为写文档时飞书会校验区块归属；而且往别人的应用实例里塞 HTML 属于越界。
   - 只有你自己注册的 `blockTypeID` 才能自由写。
3. 能写的情况下，用 `lark-cli` 更新该块（必要时 `--dry-run` 先预览）。

> **诚实提醒**：从公开文档扒下来的 `data.html` 是**可参考资料**，不是**可发布资产**。
> 想长期用，老实走路线 1，注册自己的应用。扒来的 HTML 拿来学设计和当模板，是对的用法。

---

## 写 HTML 区块的硬性规范

### 必备 meta

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="use-iframe" content="true">
<meta name="html-box-height-mode" content="auto">
<meta name="description" content="一句话用途（会显示成区块说明）">
<title>模块名</title>
```

### 结构骨架

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="use-iframe" content="true">
  <meta name="html-box-height-mode" content="auto">
  <meta name="description" content="…">
  <title>模块名</title>
  <style>
    /* 一个文件一个 style，不引外部 CSS */
    *{margin:0;padding:0;box-sizing:border-box}
    :root{ --grad-brand:linear-gradient(90deg,#f472b6,#a78bfa); }
    body{ /* 见 design-tokens.md */ }
  </style>
</head>
<body>
  <!-- 语义化结构，一个根容器 -->
</body>
</html>
```

### 五条硬约束

1. **零 `<script>`**。纯 HTML + CSS。既更安全，也避免被宿主 CSP 拦。
   （真需要交互，那是 docs-addon 应用形态的事，不是 HTML 区块形态。）
2. **不要用外层 `position: fixed`**。区块是嵌在文档流里的卡片，`fixed` 会跑飞。
3. **宽度自适应**：区块宽度由文档决定，用 `width:100%` + flex/grid，别写死 px 宽。
4. **高度交给 `html-box-height-mode: auto`**：内容多高就多高，别给 `body` 设 `height:100vh`。
5. **圆角 + 内边距**：`body{border-radius:12px; padding:24px}`，否则贴边很难看。

### 别做的事

- ❌ 承诺"把 HTML 或 JSON 粘到正文就能运行"——**普通文本粘贴只传文本**，
  不能安装或创建小组件。
- ❌ 把 HTML 区块当成"能参与搜索/目录/导出"的内容。它**不参与**：
  导出 PDF/Word 通常是空白或截图，手机端要额外加载。
- ❌ 用它承载**关键信息**（价格、联系方式、步骤）。放"锦上添花"的视觉层，
  关键内容仍用原生块承载，这样导出/搜索/无障碍都不塌。

---

## 决策速查

| 你的目标 | 走哪条 |
|---|---|
| 只想快速让文档好看一点 | 路线 1（一次性搭好应用，之后改 Record 就行） |
| 只是想**看看别人怎么做的** | 别造，用 `anonymous-extract.md` 扒下来 + `audit-html.mjs` 体检 |
| 有现成区块、只改文案 | 确认归属后换 `data.html`；否则走路线 1 |
| 要让区块**存数据/读用户输入** | 路线 1 + `docx:document:write_only`，用 Record API |
| 内容要能被搜索/导出/无障碍读屏 | **不要用 HTML 区块**，用原生块 |
