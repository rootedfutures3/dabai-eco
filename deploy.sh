#!/usr/bin/env bash
# DABAI.ECO — 一鍵部署到 GitHub Pages
#
# 前置條件（只需做一次）：
#   gh auth login
#
# 用法：
#   ./deploy.sh                 # 建立 dabai-eco（public）並部署
#   ./deploy.sh 我的repo名稱     # 自訂 repo 名稱
#
# 之後只要改完內容再跑一次 ./deploy.sh，就會自動 commit + push 更新網站。

set -euo pipefail

export PATH="/opt/homebrew/bin:$PATH"
REPO_NAME="${1:-dabai-eco}"

command -v gh >/dev/null || { echo "❌ 找不到 gh，請先執行：brew install gh"; exit 1; }

if ! gh auth status >/dev/null 2>&1; then
  echo "❌ 尚未登入 GitHub。請先執行：gh auth login"
  exit 1
fi

# 部署前擋一次全域名稱撞車。
# 這種錯不會在任何一個檔案裡看起來有問題，要兩個檔案同時載入才會炸，
# 而且炸的是「整支檔案」—— 症狀是整頁按鈕沒反應。踩過三次了。
if command -v node >/dev/null; then
  node "$(dirname "$0")/tools/check-globals.js" || {
    echo "❌ 先把上面的名稱衝突解決，不然那一頁會整個壞掉。"; exit 1; }
fi

# 這個網站只住在一個地方。
# 原本是拿「目前登入的 gh 帳號」去組 remote 網址 —— 但 gh 會自己切帳號，
# 切掉之後 deploy.sh 會安靜地把 remote 改指到別人的 repo，推上去、顯示成功，
# 而線上網站完全沒有更新。實際發生過，查了很久才發現。
OWNER="rootedfutures3"
USER_NAME=$(gh api user --jq .login)
echo "👤 GitHub 帳號：$USER_NAME"

if [ "$USER_NAME" != "$OWNER" ]; then
  echo "⚠️  目前登入的是 $USER_NAME，但這個網站屬於 $OWNER。正在切換…"
  gh auth switch --user "$OWNER" >/dev/null 2>&1 || {
    echo "❌ 切不過去。請先執行：gh auth switch --user $OWNER"; exit 1; }
  USER_NAME=$(gh api user --jq .login)
  [ "$USER_NAME" = "$OWNER" ] || { echo "❌ 還是 $USER_NAME，停止。"; exit 1; }
  echo "✅ 已切換為 $USER_NAME"
fi

# git 身分（若尚未設定）
git config user.name  >/dev/null 2>&1 || git config user.name  "$USER_NAME"
git config user.email >/dev/null 2>&1 || git config user.email "$USER_NAME@users.noreply.github.com"

# 建立 repo（若尚未存在）
if gh repo view "$USER_NAME/$REPO_NAME" >/dev/null 2>&1; then
  echo "📦 Repo 已存在：$USER_NAME/$REPO_NAME"
else
  echo "📦 建立 public repo：$USER_NAME/$REPO_NAME"
  gh repo create "$REPO_NAME" --public \
    --description "DABAI.ECO — 砂拉越黑橄欖永續商業生態系網站"
fi

# 設定 remote
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://github.com/$USER_NAME/$REPO_NAME.git"
else
  git remote add origin "https://github.com/$USER_NAME/$REPO_NAME.git"
fi

# 提交尚未存檔的改動
git add -A
if ! git diff --cached --quiet; then
  git commit -m "Update site content"
  echo "✅ 已提交新的改動"
fi

git branch -M main
git push -u origin main
echo "✅ 已推送到 GitHub"

# 確認推上去的真的是這個網站的 repo，不是同名的別人的
REMOTE_NOW=$(git remote get-url origin)
case "$REMOTE_NOW" in
  *"$OWNER/$REPO_NAME"*) ;;
  *) echo "❌ remote 指向 $REMOTE_NOW，不是 $OWNER/$REPO_NAME。網站不會更新。"; exit 1;;
esac

# 開啟 GitHub Pages（從 main 分支根目錄）
echo "🌐 設定 GitHub Pages…"
gh api -X POST "repos/$USER_NAME/$REPO_NAME/pages" \
  -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
  || gh api -X PUT "repos/$USER_NAME/$REPO_NAME/pages" \
       -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 \
  || echo "ℹ️  Pages 可能已經啟用過了，略過。"

echo ""
echo "🎉 完成！網址（首次部署約需 1–2 分鐘才會生效）："
echo "   https://$USER_NAME.github.io/$REPO_NAME/"
echo ""
echo "   認識 Dabai：https://$USER_NAME.github.io/$REPO_NAME/dabai.html"
