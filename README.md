# DABAI.ECO

砂拉越黑橄欖（Dabai, *Canarium odontophyllum*）永續商業生態系網站 — 純靜態，可直接部署到 GitHub Pages。

## 頁面

| 檔案 | 內容 |
|---|---|
| `index.html` | 首頁：品牌主張、Dabai 簡介、SDG 雙核心策略 |
| `dabai.html` | **認識 Dabai**：由來、怎麼吃、可以怎麼用、零廢棄 |
| `products.html` | 產品線與全值化利用對照表、4P 策略 |
| `sustainability.html` | 八階段藍圖、SDG 11/12/17、以物換物、ESG KPI |
| `team.html` | 團隊成員與分工表 |
| `contact.html` | 預購登記表單、合作洽談、FAQ |
| `404.html` | GitHub Pages 找不到頁面時顯示 |
| `assets/style.css` | 全站共用樣式 |
| `assets/site.js` | 進場動畫、手機選單、表單處理 |

沒有建置流程、沒有相依套件，全部相對路徑，放進任何靜態主機都能跑。

## 部署到 GitHub Pages

**第一次**：登入 GitHub（只需做一次，會開瀏覽器讓你授權）

```bash
gh auth login
```

**接著**：跑一鍵部署腳本，它會自動建立 repo、推送、開啟 Pages 並印出網址

```bash
./deploy.sh
```

之後每次改完內容，再跑一次 `./deploy.sh` 就會自動 commit + push 更新線上網站。
想換 repo 名稱就加參數：`./deploy.sh 我的repo名稱`

<details>
<summary>手動部署（不想用腳本的話）</summary>

1. 在 GitHub 建立新的 repository（例如 `dabai-eco`）。
2. 推上去：

```bash
git remote add origin https://github.com/<你的帳號>/dabai-eco.git
git branch -M main
git push -u origin main
```

3. 到 repo 的 **Settings → Pages**，`Source` 選 **Deploy from a branch**，branch 選 `main`、資料夾選 `/ (root)`，按 Save。
4. 等一兩分鐘，網站會出現在 `https://<你的帳號>.github.io/dabai-eco/`。

</details>

本地預覽（不需要伺服器也能開，但用伺服器比較接近線上環境）：

```bash
python3 -m http.server 8000
```

## 預購表單

GitHub Pages 是靜態託管，沒有後端，所以目前表單只做前端驗證並顯示成功訊息，**資料不會被送到任何地方**。

要真的收到報名資料，最簡單的做法是接一個表單服務（Formspree、Google Forms、Netlify Forms 等）。以 Formspree 為例，改 `contact.html` 裡的這一行：

```html
<form data-mvp="#preorder-ok">
```

改成：

```html
<form action="https://formspree.io/f/你的表單ID" method="POST">
```

移除 `data-mvp` 屬性後，`assets/site.js` 就不會攔截送出，表單會正常提交。

## 待補內容

- 真實的 Dabai 產品照片（目前用 emoji 與 SVG 插畫佔位）
- 正式聯絡信箱與電話（`contact.html` 目前標示為待公布）
- 產季確切日期與定價
- 團隊成員照片
