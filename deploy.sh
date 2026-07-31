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

USER_NAME=$(gh api user --jq .login)
echo "👤 GitHub 帳號：$USER_NAME"

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
