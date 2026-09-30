#!/usr/bin/env bash
# 抓取飞书文档 SSR 页面（移动端 UA 绕过服务端登录跳转）
#
# 用法: bash fetch.sh <feishu-doc-url> [输出文件=feishu_doc.html]
#
# 为什么需要它：桌面端 UA 会被 302 到 accounts.feishu.cn 的登录页，
# 即使文档本身对匿名开放。移动端 UA 才能直接拿到 SSR 页面。
set -uo pipefail

URL="${1:-}"
OUT="${2:-feishu_doc.html}"

if [ -z "$URL" ]; then
  echo "用法: bash fetch.sh <feishu-doc-url> [out.html]" >&2
  exit 2
fi

# 部分环境下代理会拦 GitHub/飞书，按需绕开；如你依赖代理请删掉 --noproxy
CURL_FLAGS=(-sL --noproxy '*')

UA_DESKTOP="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
UA_MOBILE="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"

echo "== 1/3 桌面 UA 探测（预期 302 到登录页，这是正常的）"
curl "${CURL_FLAGS[@]}" -o /dev/null -w "   HTTP:%{http_code}\n   FINAL:%{url_effective}\n" \
  -A "$UA_DESKTOP" "$URL"

echo "== 2/3 移动端 UA 抓取"
CODE=$(curl "${CURL_FLAGS[@]}" -o "$OUT" -w "%{http_code}" -A "$UA_MOBILE" "$URL")
SIZE=$(wc -c < "$OUT" | tr -d ' ')
echo "   HTTP:$CODE  SIZE:${SIZE}B  -> $OUT"

if [ "$SIZE" -lt 10000 ]; then
  echo "!! 内容过小，很可能不是文档页。检查链接是否有效。" >&2
fi

echo "== 3/3 内容体检"

PY_BIN=""
for cand in python python3 py; do
  if command -v "$cand" >/dev/null 2>&1; then PY_BIN="$cand"; break; fi
done

if [ -z "$PY_BIN" ]; then
  echo "   (未找到 python，跳过体检。可自行 grep: isAnonymousAccess / docx-isv-block)"
else
  "$PY_BIN" - "$OUT" <<'PY'
import re, sys
h = open(sys.argv[1], encoding="utf-8", errors="ignore").read()
t = re.findall(r"<title>(.*?)</title>", h, re.S)
print("   title           :", (t[0].strip() if t else "(未找到)"))
m = re.search(r'isAnonymousAccess["\']?\s*:\s*["\'](\w+)["\']', h)
anon = m.group(1) if m else "(未找到)"
print("   anonymousAccess :", anon)
print("   window.DATA     :", "存在，可解析" if "window.DATA" in h else "缺失 -> 可能是登录页/无权限")
print("   docx-isv-block  :", h.count("docx-isv-block"), "个（HTML 区块数）")
print("   block_h5        :", h.count("block_h5"))
if anon == "False":
    print()
    print("   !! 该文档未对匿名开放。停止抓取：请改用 lark-cli（有授权）")
    print("      或让文档所有者把分享权限改为「互联网上获得链接的人可阅读」。")
PY
fi

echo
echo "下一步: node extract.mjs $OUT out/"
