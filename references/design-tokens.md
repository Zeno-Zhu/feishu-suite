# 设计令牌 · 让 HTML 区块看起来"专业"的一套可复用规范

这套令牌是从一份**真实的高完成度飞书文档**（13 个 HTML 区块）逆向出来的。
它的价值在于：13 个模块共用同一套语言，所以整份文档看起来像一个整体，而不是 13 个拼贴。

**核心心法**：好看的 HTML 区块不是靠单个模块炫，而是**一整套令牌 + 换字批量产出**。
那 13 个文件每个只有 1.3–5 KB，明显是模板套壳。

---

## 1. 深色底（默认基调）

```css
body{
  background:
    radial-gradient(ellipse at center, rgba(244,114,182,.05) 0%, transparent 60%),
    linear-gradient(135deg, #050810, #0d1421);
  border-radius: 12px;
  padding: 24px;
  color: rgba(255,255,255,.9);
}
```

- 底不是纯黑：`#050810 → #0d1421` 的 135° 渐变，近黑带一点蓝。
- 叠一层**极淡的粉紫径向光斑**（alpha 仅 .05）——这是"有质感"与"死黑"的分界。
- **`border-radius: 12px` 必须写**：区块在文档里是浮起的卡片，圆角让 iframe 边缘不突兀。

## 2. 品牌渐变（标题/强调）

```css
--grad-brand: linear-gradient(90deg, #f472b6, #a78bfa);   /* 粉 → 紫 */
```

渐变文字（**必须四个属性一起写**，否则 Chrome/Safari 一边失效）：

```css
.section-title{
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 4px;
  text-transform: uppercase;
  background: var(--grad-brand);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 10px rgba(244,114,182,.4));  /* 发光 */
}
```

`filter: drop-shadow` 是渐变文字能"发光"的关键——`text-shadow` 对透明填充的文字无效。

## 3. 玻璃拟态卡片

```css
.item{
  background: rgba(255,255,255,.02);           /* 极低透明度，别用 .1 */
  border: 1px solid rgba(244,114,182,.2);      /* 用品牌色描边，不用灰 */
  border-radius: 12px;
  padding: 20px;
}
```

「半透明白 .02 + 品牌色低透明描边」是深色底上做卡片最稳的组合。
用它替代实心卡片，层次感和"高级感"立刻出来。

## 4. 字体

```css
font-family: 'Orbitron', 'PingFang SC', 'Microsoft YaHei', sans-serif;
```

- `Orbitron`（Google Fonts，400/700/900）提供拉丁与数字的科技感；中文回落到系统字体。
- **中英混排时把西文字体放前面**，中文自然继承系统字体，观感最好。
- 字号阶梯：标题 22 / 小标题 16 / 正文 14 / 辅助 12.5。
- 标题 `letter-spacing: 4px`，正文 `1px`——**大字要大间距，小字要小间距**。

## 5. 动效（只用 CSS，不写 JS）

实测有效的 keyframes 名与用途：

| keyframes | 用途 | 典型值 |
|---|---|---|
| `flow` | 边框流光横向流动 | `4s linear infinite` |
| `borderFlow` | 沿边框跑光 | `3s ease infinite` |
| `shine` | 高光扫过（按钮/卡片） | `4s linear infinite` |
| `glow` | 呼吸发光 | `2s ease-in-out infinite alternate` |
| `pulse` / `btnPulse` | 脉冲（按钮召唤点击） | `2s ease-in-out infinite` |
| `float` | 上下悬浮 | `4s ease-in-out infinite` |
| `bounce` | 提示性弹跳 | `1.5s ease-in-out infinite` |
| `tipWiggle` / `wiggles` | 轻微抖动（提示条） | `0.8s–2s ease-in-out infinite` |

**规矩**：
- 全部 `infinite`，但**周期不要短于 0.8s**——再快就变成噪音。
- 一个模块**最多 2–3 个动效**。那 13 个模块里，最花哨的 banner 用了 6 个，其余多数只有 0–1 个。
- 用 `alternate` 做往返（`glow`），用 `reverse` 做反向（`flow ... reverse`）。
- **不写 `<script>`**：13 个模块零 JS。纯 CSS 就够，且更安全（iframe + 无脚本 = 无风险）。

## 6. 外部资源（能少则少）

- 那份文档**唯一**的外部依赖是 Google Fonts 的 Orbitron。
- **图片全部外链**（`media.doubao.com` / `internal-api-drive-stream`）。这是它最大的脆弱点：
  离线、导出、迁移时图就没了。
- **要交付/迁移就内联**：字体转 woff2 base64、图片转 data URI，或至少落本地文件。

## 7. 命名与结构约定

```
01_banner.html          区块在文档里的顺序 = 文件序号
02_video-pricing.html
...
```

每个文件结构固定三段：`<head>`（meta + 一个 `<style>`）→ 语义化标签 → 闭包。
**一个文件一个 `<style>`**，不引入外部 CSS。

必备 meta：

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="use-iframe" content="true">
<meta name="html-box-height-mode" content="auto">
<meta name="description" content="一句话说明这个模块干什么">
```

后两个是**飞书 HTML 区块渲染器的约定**：`use-iframe` 声明以 iframe 加载，
`html-box-height-mode: auto` 让高度自适应内容（不写就会固定高度出现滚动条）。

## 8. 自查清单

- [ ] `border-radius: 12px` 在 body 上
- [ ] 深色渐变底 + 一层 alpha ≤ .05 的光斑
- [ ] 渐变文字四个属性齐全（含 `filter: drop-shadow`）
- [ ] 卡片用 `rgba(255,255,255,.02)` + 品牌色描边
- [ ] 中英混排时西文字体在前
- [ ] 动效 ≤ 3 个，周期 ≥ 0.8s
- [ ] **零 `<script>`**
- [ ] 两个飞书约定 meta 都在
- [ ] 外部资源清单已知（字体/图片）——或者已内联

`node scripts/audit-html.mjs <dir>` 会按这份清单打分。
