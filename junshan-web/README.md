# 鈞泩放樣營運試算（本資料夾即 Vite 前端專案）

薪水統計、放樣估價、公司帳的 **單一 Web 專案**；正式站由 **Netlify** 讀**本目錄**的 `netlify.toml` 建置。

## 本機開發

1. 本機在 **`junshan-web` 內**（你現在讀的這一層）。
2. 複製 `.env.example` 為 `.env`，依需填寫 `VITE_JSONBIN_*`（**選用**；不填仍可用本機與匯出／匯入備份）。
3. `npm install`（首次或依賴有變）
4. `npm run dev`（開發）／上線前 `npm run build` 必須通過

**建議**：用 Cursor／VSCode「開啟工作區」→ 選同資料夾內的 `鈞泩放樣工程行.code-workspace`，編輯 `src/`、`netlify.toml` 與本 `README` 不會亂飄路徑。

## Netlify（上線前必讀一次）

- 在 [Netlify](https://app.netlify.com) 該站 **Project configuration** → **Build** → **Build settings** 內，將 **Base directory** 設成 **`junshan-web`**，這樣才會用本目錄的 `netlify.toml` 與 `package.json` 建置。
- 若專案較舊是從「倉庫根有 netlify.toml」遷移過來，**改好 Base 後**再 **Trigger deploy** 一次測成功。

| 項目 | 說明 |
|------|------|
| 自動佈署 | 遠端 `git push` 觸發；產出 `dist`。 |
| 環境變數 | 在 Netlify 內與本機**同名**的 `VITE_`；改完變數後要重新佈署才進 bundle。 |
| JSONBin | `VITE_JSONBIN_BIN_ID`、`VITE_JSONBIN_X_MASTER_KEY_B64` 等，見 `.env.example`。金鑰勿提交到 Git。 |

**客戶看的網址**是 `https://你的站.netlify.app`（或自訂網域），**不是** `app.netlify.com` 後台。

## 不要提交進版控

- `.env`
- `node_modules/`、`dist/`、`.vite/`
- 上層倉庫根目錄若散放業務用 Excel、截圖、匯出檔，通常由**倉庫根**的 `.gitignore` 處理；專有資料仍請勿隨意 `git add -A`。

本專案不內建後端；資料在瀏覽器與**選用** JSONBin 或**匯出／匯入備份**之間；推送到遠端才會佈署新版至 Netlify。
