# 克隆 / 迁移飞书文档

目标：在**用户自己的位置**造一份内容等价的副本。触发动因通常是：
「复制按钮是灰的」「没有复制权限」「这份文档是别人分享给我的，想搬到我自己的知识库」。

---

## 决策树（顺序不能变）

### 第 1 步 · 解析来源

`/wiki/<token>` 里的 token **不是文档 token**。先解析：

```bash
lark-cli wiki spaces get_node --as user --params '{"token":"<wiki_token>"}'
```

拿到 `space_id` / `node_token` / `obj_token` / `obj_type` / `title`。
只有 `obj_type` 是 `docx` / `doc` 才继续；是 sheets / bitable / slides / mindnote / file 就换对应域。

### 第 2 步 · 确定目标位置

- 用户给了文件夹 URL → 取 `folder_token`。
- 用户要进知识库 → 列 wiki space：
  ```bash
  lark-cli api GET /open-apis/wiki/v2/spaces --as user --page-all --page-size 50 --page-limit 0
  ```
- 都没说 → 放用户个人文档根目录（`docs +create` 不带 folder/wiki 参数）。

### 第 3 步 · 先试原生复制

```bash
# 云盘文件复制
lark-cli drive files copy --as user \
  --params '{"file_token":"<obj_token>"}' \
  --data '{"folder_token":"<target_folder_token>","name":"<title>","type":"docx"}'

# wiki 节点复制
lark-cli api POST /open-apis/wiki/v2/spaces/<src_space_id>/nodes/<src_node_token>/copy \
  --as user --data '{"target_space_id":"<dst_space_id>","title":"<title>"}'
```

**判定失败必须去目标位置实际列一遍确认**，不要只看命令输出。
以下任一情况都算失败 → 走第 4 步重建：
`forbidden` · `1061004` · 空 `exit=1` · 目标位置没有出现新节点。

> ⚠️ 最常见的错误：命令返回了看起来成功的东西就宣布"复制好了"。
> **一定要 fetch 或 list 新文档确认。**

### 第 4 步 · 从 Markdown 重建

```bash
lark-cli docs +fetch --as user --doc "<source_url_or_obj_token>" --format json > source.json
```

再处理图片（见下）。**不要靠反复 append 拼正文**——会在代码块里插空行。

### 第 5 步 · 验证（不能省）

```bash
lark-cli docs +fetch --as user --doc <new_doc> --format json > final.json
```

- 把两边图片标签都替换成 `<IMAGE>` 后比对文本。
- **代码块必须逐字相同**。少了/多了空行是 bug。
- 报告：文本差异、图片数差异、对齐变化。

---

## 图片：403 了怎么办

受限文档的 `docs +media-download` 常返回 403。**改用浏览器会话取图**：
带着登录态打 `internal-api-drive-stream` 的几种 URL 形态。

### URL 兜底序列（按顺序试）

```
1. 页面里 <img class="docx-image"> 的 currentSrc / src
2. https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/preview/<token>/?preview_type=16
3. https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/v2/cover/<token>/?fallback_source=1&height=1280&mount_point=docx_image&policy=equal&width=1280
4. https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/<token>/
```

判定成功：`res.ok` **且** `content-type` 以 `image/` 开头 **且** 字节数 > 1000。
（前两条都要查——飞书失败时可能返回 200 + HTML 错误页。）

请求必须带 `credentials: "include"`：

```js
const res = await fetch(url, { credentials: "include" });
```

### 飞书懒加载很激进

图片是滚动到才加载的，必须主动滚动触发。滚动容器是 `.bear-web-x-container`：

```js
const scroller = document.querySelector(".bear-web-x-container") || document.scrollingElement;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let y = 0; y <= scroller.scrollHeight - scroller.clientHeight + 400; y += 450) {
  scroller.scrollTop = y;
  await wait(800);   // 800ms 是实测够用的等待
}
```

取完再收集 `document.querySelectorAll("img.docx-image")`，按 token 匹配 `src`。

**如果取到的图比预期少**：直接滚到缺失图片所在的块附近，重新查一次 `img.docx-image`。
不要盲扫全页。

### 转存

base64 落盘（注意 `jpeg` → `jpg`），然后：

1. 建一个**只有占位内容**的临时文档。
2. `docs +media-insert` 把本地图灌进去，**只为拿新的 `file_token`**。
3. 用原始尺寸 + 新 token 组装最终 Markdown。
4. `docs +create` **一次性**导入成文。
5. 临时文档是**可抛弃的**；如果没法安全删除，**告诉用户你建了哪些中间文档**。

---

## 硬性护栏

- ❌ 不要把 `/wiki/` 的 token 当文档 token 用，先解析。
- ❌ 不要用 `docs +update replace_all` 去改图片标签来调对齐/尺寸——
  会触发**异步替换**，可能把大段内容复制一份。
- ❌ 不要用 `docs +update append` 或反复 `+create`/`+update` 导入正文文本（代码块会多空行）。
  反复 update **只**用于那个上传图片的占位临时文档。
- ❌ 不要依赖 `docs +media-download` 处理受限文档，403 就换浏览器会话。
- ✅ 保持源图片顺序稳定：解析产物的顺序必须与上传日志的顺序一致。
- ✅ 优先「组装好 Markdown → 一次 create」，而不是「建好文档 → 事后改几十个图片块」。

---

## 和匿名技法的配合

如果**连授权都没有**（只有公开分享链接），`lark-cli` 这条路走不通。此时：

1. 用 `anonymous-extract.md` 的技法把文档取下来（含 HTML 区块原文）。
2. 用 `scripts/fetch.sh` + `scripts/extract.mjs` 拿块树。
3. 想搬成自己的文档 → 先把内容转成 Markdown，再走本文件的「写入/验证」流程。
4. 想搬的是**视觉**（HTML 区块）→ 参见 `html-block-authoring.md`：
   扒下来的 HTML 是可参考资料，正式用要注册自己的 docs-addon 应用。
