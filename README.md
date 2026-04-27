# 鈞泩放樣工程行

營運試算（薪水統計、放樣估價、公司帳）的 **單一前端專案** 在 `junshan-web/`，**正式站**與建置由 **Netlify** 讀倉庫根目錄的 `netlify.toml` 完成。

## 本機開發

1. `cd junshan-web`
2. 複製 `junshan-web/.env.example` 為 `.env`，依需填寫 `VITE_` 變數（Google/Firebase、JSONBin 皆為**選用**；不填仍可用本機與匯出／匯入備份）。
3. `npm install`（首次或依賴有變）
4. `npm run dev`（開發）／上線前 `npm run build` 必須通過

**建議**：在 Cursor 用「開啟工作區」→ 選倉庫內的 `鈞泩放樣工程行.code-workspace`，可同時看到 `netlify.toml` 與前端專案。

## 雲端與上架

| 方式 | 說明 |
|------|------|
| **Netlify 自動佈署** | 遠端（如 GitHub）`git push` 觸發建置；`base = junshan-web`、產出 `dist`。 |
| **正式站環境變數** | 在 Netlify 專案內新增與本機同名的 `VITE_` 變數；**改完**後需重新佈署（可 Clear cache and deploy）才進 bundle。 |
| **JSONBin** | 在 Netlify 設定 `VITE_JSONBIN_BIN_ID`、`VITE_JSONBIN_X_MASTER_KEY_B64` 等，見 `junshan-web/.env.example`。 |
| **Firebase** | 選用；見 `.env.example` 內欄位。金鑰勿提交到 Git。 |

**別把** [Netlify 專案後台](https://app.netlify.com)（`app.netlify.com/...`）當成給客戶的網址；對外是 **`https://你的站名.netlify.app` 或自訂網域**。

## 不要提交進版控

- `junshan-web/.env`（內有金鑰與帳戶專屬值）
- `node_modules/`、`dist/`、`.vite/`（已在 `.gitignore`）
- 倉庫根目錄的業務用 Excel、截圖、匯出檔等（多數以 `.gitignore` 檔名規則排除；專有資料請勿 `git add`）

此專案不內建後端，資料在瀏覽器端與**選用**的雲端（JSONBin／Firebase）或**備份檔**之間流動；程式碼變更後**推送遠端**才會讓 Netlify 佈署新版。
