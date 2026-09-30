# 块类型对照表

**这张表要解决的核心问题**：飞书文档在**两个地方**用**两套**块类型标识，混用会导致静默失败。

| 来源 | 字段 | 类型 | 例 |
|---|---|---|---|
| SSR 页面（`window.DATA`） | `block.data.type` | **字符串** | `"isv"` |
| 开放平台 API | `block_type` | **数字** | `28` |

**最常见的错误**：拿数字枚举去比对 `window.DATA` 里的 `data.type`，结果全不匹配，
然后错误地得出"这个文档没有 HTML 区块"。实测踩过。

---

## 对照表

| 数字 | 字符串 | 含义 | 备注 |
|---|---|---|---|
| 1 | `page` | 文档根 / 页面 | `block_sequence` 第一个 |
| 2 | `text` | 文本段落 | `data.text.elements[]` |
| 3–11 | `heading1`–`heading9` | 一到九级标题 | 实际常用 1–4 |
| 12 | `bullet` | 无序列表 | |
| 13 | `ordered` | 有序列表 | |
| 14 | `code` | 代码块 | 有 `style.language` |
| 15 | `quote` | 引用 | |
| 17 | `todo` | 待办 | `style.done` |
| 18 | `bitable` | 多维表格 | 嵌 Base |
| **19** | `callout` | **高亮块** | 原生能力里最"好看"的：emoji + 背景色 |
| 20 | `chat_card` | 群名片 | |
| 21 | `diagram` | 画板 / mermaid | |
| 22 | `divider` | 分割线 | 无内容 |
| 23 | `file` | 附件 | |
| 24 | `grid` | **分栏容器** | 原生 2–5 列 |
| 25 | `grid_column` | 分栏的栏 | grid 的子块 |
| 26 | `iframe` | 网页嵌入 | |
| 27 | `image` | 图片 | `token` → 走 drive-stream 取 |
| **28** | **`isv`** | **ISV 区块 / 云文档小组件** | **`data.html` 在这** |
| 29 | `mindnote` | 思维笔记 | |
| 30 | `sheet` | 电子表格 | |
| 31 | `table` | 表格 | |
| 32 | `table_cell` | 单元格 | |
| 33 | `view` | 视图 | |
| 34 | `quote_container` | 引用容器 | |
| 35 | `task` | 任务 | |
| 36–39 | `okr*` | OKR 系列 | |
| 40 | `add_ons` | 附加组件 | |
| 42 | `wiki_catalog` | 知识库目录 | |
| 43 | `board` | 画板 | |
| 44 | `agenda` | 议程 | |
| 48 | `calendar_event` | 日程 | |
| 49 | `sync_block` | 同步块 | |
| 52 | `sub_page_list` | 子页面列表 | |
| 999 | `undefined` | 未定义 | |

> 数字侧的枚举以开放平台文档为准，会随版本增加。**本表用于建立"字符串 ↔ 数字"的对应直觉，
> 不要当权威清单用**——真正要调 API 时用 `lark-cli schema` 查。

---

## 块树的遍历要点

每个块都长这样：

```jsonc
{
  "id": "doxcn...",
  "version": "123",
  "data": {
    "type": "isv",              // ← 字符串
    "parent_id": "...",
    "children": ["id1", "id2"], // ← 子块 id 列表，递归这层
    // ...类型特有的字段
  }
}
```

遍历的三个必须：

1. **从 `clientVars.data.block_sequence` 起**（顶层顺序）
2. **递归 `data.children`**（子块）
3. **带 `seen` 集合去重** —— `block_sequence` 同时含 page 和它的 children，
   不去重会走两遍（13 个变 26 个）

## 文本块的结构

```jsonc
{
  "type": "text",
  "text": {
    "elements": [
      {
        "text_run": {
          "content": "文字内容",
          "text_element_style": {
            "bold": true,
            "link": { "url": "https://..." },
            "text_color": 1,          // 取色枚举
            "background_color": 2
          }
        }
      },
      { "mention_page": { "title": "被@的文档" } },   // @提及
      { "equation": { "content": "E=mc^2" } }         // 行内公式
    ]
  }
}
```

`elements` 是**混合数组**，每项可能是 `text_run` / `mention_page` / `mention_user` / `equation`。
提纯文本时要 **fallback 处理每一种**，否则会静默丢内容。

样式与链接挂在 `text_element_style` 上——想提取"哪些字有链接、哪些加粗"，
要遍历 `elements` 而不是只看拼接后的字符串。

## HTML 区块（`isv`）的字段

```jsonc
{
  "type": "isv",
  "app_block_id": "",
  "block_type_id": "blk_...",        // docs-addon 的 blockTypeID
  "manifest": {
    "app_id": "",                    // 常为空，空≠不是小组件
    "app_name": "",
    "app_version": "",
    "view_type": "block_h5"          // ← 真正的判据
  },
  "data": { "html": "<!doctype html>..." },   // ← 正文
  "size": { "width": 0, "height": 0 },        // 常为 0，高度由前端自适应
  "comment_details": {}
}
```

**判据优先级**：`view_type === "block_h5"` > `block_type_id` 以 `blk_` 开头 > `data.html` 存在。
`app_id`/`app_name` 为空是常态，**不能**作为否定依据。

## 原生 vs HTML 区块：能力对照

| 能力 | 原生块（callout / grid / table） | HTML 区块（isv） |
|---|---|---|
| 渐变文字、玻璃拟态、`@keyframes` | ❌ 白名单渲染器挡掉 | ✅ |
| 自定义字体 | ❌ | ✅（可外链） |
| 参与文档搜索 | ✅ | ❌ |
| 参与目录 / 大纲 | ✅ | ❌ |
| 导出 PDF / Word | ✅ | ⚠️ 常空白或截图 |
| 无障碍 / 读屏 | ✅ | ❌ |
| 手机端加载 | 快 | 慢一拍 |
| 承载关键信息 | 合适 | **不合适** |

**结论**：关键信息用原生块，视觉层用 HTML 区块。别把 HTML 区块当内容载体。
