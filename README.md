# LH sport

Vue 3 + Vite 的手機優先重訓紀錄網站。菜單和動作指引依據原始 Excel 建立。

## 在 Windows 執行

將整個 LHsport 資料夾解壓縮至 `D:\Project\LHsport`，安裝 Node.js 20.19+ 或 22.12+，在 PowerShell 執行：

```powershell
cd D:\Project\LHsport
npm install
npm run dev -- --host 0.0.0.0
```

開啟終端機顯示的本機網址（通常為 http://localhost:5173）。手機需在同一 Wi-Fi，並使用電腦的區域網路 IP 與埠號開啟；Windows 防火牆可能需要允許 Node.js。

## GitHub Pages

`vite.config.js` 使用相對路徑 `base: './'`，可部署到任意 repository 名稱。推送原始碼到 GitHub，於 Settings → Pages → Source 選 GitHub Actions，使用 `.github/workflows/deploy.yml` 自動部署。

## 資料與未來 Google Sheets 整合

目前紀錄保存在該瀏覽器的 localStorage (`lhsport.v1`)，無跨裝置同步。清除網站資料、無痕模式關閉或換手機會失去紀錄。正式同步前請保留原始裝置資料。

Apps Script 網址已設定在 `src/services/workoutApi.js`。網站第一次開啟會要求輸入個人使用碼，成功後下載 `Exercises`、`Programs` 與該使用者的 `WorkoutLogs`。完成訓練時先保存到 localStorage，再上傳試算表；失敗的項目會保留為等待同步。

`google-sheets/Exercises.csv` 與 `google-sheets/Programs.csv` 是目前菜單的初始資料。在 Google 試算表對應工作表選「檔案 → 匯入 → 上傳」，匯入位置選「取代目前工作表」。保留工作表名稱及第一列欄位名稱。之後可直接在試算表調整組數、次數、休息與啟用狀態。

使用者與程度固定對應：`user_1` 只顯示非新手菜單，`user_2` 只顯示新手菜單。兩位使用者都有「臀＋核心」訓練日。若 Apps Script 仍只允許原本三種訓練日，請把 `['Push', 'Pull', 'Legs']` 改成 `['Push', 'Pull', 'Legs', 'GlutesCore']`。也建議在 `appendWorkoutLog(user, log)` 的 `validateWorkoutLog(log);` 後加入以下檢查，再建立新版本並重新部署：

```javascript
const allowedLevel = user.userId === 'user_1' ? 'advanced' : 'beginner';
if (log.level !== allowedLevel) {
  throw new Error('此使用者不能寫入這個程度的訓練紀錄');
}
```

`google-sheets/LHsport_GoogleSheets.xlsx` 整合了最新版 Exercises 與 Programs，方便檢查資料；已經存在 WorkoutLogs 的正式試算表，仍建議分別用兩個 CSV 取代對應工作表，避免覆蓋訓練紀錄。

## 指令

`npm run build` 產生 `dist/`，`npm run preview` 預覽正式建置。
