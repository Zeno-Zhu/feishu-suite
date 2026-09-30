# 能力地图 · 什么时候用哪条路

## 一句话判据

**「这份资源，我有没有授权？」**

- 有 → `lark-cli`。能读能写，能力最全，是默认选择。
- 没有，只有一条分享链接 → 匿名技法（`references/anonymous-extract.md`）。
- 不确定 → 先跑 `lark-cli auth status`，再拿目标 token 试一个只读接口；`403/forbidden` 就说明没授权。

**别做的事**：拿 `lark-cli` 硬撞需要登录的匿名链接（浪费时间）；或者拿匿名技法去读需要授权的私有文档（读不到，且不该试）。

## 为什么两者不能互相替代

| 维度 | `lark-cli`（有授权） | 匿名技法（只有链接） |
|---|---|---|
| 读正文 | ✅ |
| **读 HTML 区块内部源码** | ❌ 只返回空壳 block | ✅ `block.data.html` 是完整原文 |
| 读富文本块结构 | ✅ 结构化的块 API | ✅ 但字段名不同（`data.type` 字符串 vs 官方数字枚举） |
| 写 / 改 / 删 | ✅ |
| 表格 / Base / 消息 / 日历 / 邮件 | ✅ |
| 图片 | ✅ `docs +media-download` | ⚠️ 要浏览器会话（`internal-api-drive-stream` + credentials） |
| 需登录才可见的文档 | ✅ |

一句话：**要「改」就必须走 lark-cli；要「把别人文档里的 HTML 区块扒下来」就只能走匿名技法。**

## lark-cli 域速查

```
application  应用自助管理（slash commands）
approval     审批实例与任务
apps         开发/部署 HTML、网页与应用（Miaoda）
attendance   考勤打卡
base         多维表格：表/字段/记录/视图/仪表盘/工作流/表单/角色
calendar     日历、日程、参会人
contact      通讯录
docs         文档与内容（+create +fetch +update +search +media-* +script +whiteboard-update）
drive        文件、评论、权限、上传
event        实时事件消费
im           消息与群
mail         邮箱、草稿、文件夹、联系人
markdown     Drive 原生 Markdown 文件（create / fetch / overwrite）
mindnotes    思维笔记
minutes      妙记内容与元信息
note         会议纪要明细与统一转写
okr          OKR 目标 / KR / 对齐 / 指标 / 进展
sheets       电子表格
```

## 常用 shortcut（优先于裸 API）

```bash
# 读
lark-cli docs +fetch    --as user --doc "<url_or_token>" --format json
lark-cli docs +search   --as user --query "关键词"
lark-cli calendar +agenda
lark-cli drive files list --as user

# 写
lark-cli docs +create   --as user --title "标题" [--wiki-space <id>] --markdown "..."
lark-cli docs +update   --as user --doc <id> --mode append|replace_all ...
lark-cli docs +media-insert --as user --doc <id> --file ./a.png --align center
lark-cli docs +media-upload

# 查参数（别猜 flag）
lark-cli schema docs.document.create
```

## 身份模型（最阴的坑在这）

```bash
lark-cli auth status          # 看 identities.user / identities.bot 的 status
lark-cli auth login --scope "..."   # 缺 scope 时增量授权
lark-cli auth check --scope "..."   # 授权后确认
```

- `--as user`：代表**用户本人**。能访问其个人云空间、日历、邮件等个人资源。读个人文档**必须**用这个。
- `--as bot`：代表**应用自己**。只能碰 bot 自己的资源。
- ⚠️ **bot 读用户资源常常返回「空成功」而不是报错**。看到"成功但结果为空"，第一反应应该是**身份选错了**，而不是"这个文档没内容"。

`defaultAs: auto` 意味着 CLI 自己挑身份——**涉及个人资源的操作，显式写 `--as user`**，别赌。

## 授权 URL 的处理

命令输出里出现 `verification_url` / `verification_uri_complete` / `console_url` 时：

1. 用 `lark-cli auth qrcode` 生成二维码，**URL 在前，二维码在后**，一起给用户。
2. **URL 原样转发**：不编解码、不加标点、不重拼 query。
3. 优先 PNG（`--output`），只有用户明确要才用 ASCII（`--ascii`）。

## 输出契约

- `--format json`（默认）下判断成功用 **`ok == true`** 或退出码 0。
- **不要用 `code == 0`**。成功信封里没有顶层 `code`/`msg`；`code` 只出现在错误信封的 `error` 里。按 OpenAPI 老格式判会把**所有成功调用误判为失败**——封装写入命令时尤其致命。
- `--jq <expr>` 过滤，`--dry-run` 预览（不真正发请求）。

## 退出码

| 码 | 含义 | 该做什么 |
|---|---|---|
| 0 | 成功 | — |
| 10 | **高风险写确认门禁，不是错误** | 停下 → 向用户展示 `action`/`risk`/关键参数 → **取得显式同意** → 把 `hint` 指出的 flag **追加到原 argv 末尾**重试 |
| 其他 | 真错误 | 读 stderr / `error` 字段 |

**绝不静默追加确认 flag 绕过门禁。**

## 文件路径

`--file` / `--output` / `--output-dir` / `@file` **只接受 cwd 下的相对路径**，绝对路径报 `unsafe file path`。数据输入（`@file`、大 JSON）优先走 **stdin**，避开路径与转义问题。

## 安全

不许把 `appSecret` / token 打到终端明文。写/删前确认用户意图。有 `--dry-run` 就先 `--dry-run`。
