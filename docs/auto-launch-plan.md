# PC 起動時バックグラウンド起動 — 実装計画

## 概要

Rendio を macOS のログイン項目に登録し、PC 起動時にバックグラウンド（ウィンドウ非表示・グローバルショートカットのみ有効）で自動起動する機能を追加する。

## 技術的根拠

- **Electron `app.setLoginItemSettings({ openAtLogin })`**: macOS 13+ では内部的に Apple の `SMAppService` API を使用。外部パッケージ不要。
- **`openAsHidden` は非推奨**: macOS 13 (Ventura) 以降、Apple が OS レベルで削除。代わりに `app.getLoginItemSettings().wasOpenedAtLogin` でログイン起動を検知し、`BrowserWindow({ show: false })` で自前制御する。
- **Tray**: ウィンドウ非表示時の操作手段として macOS メニューバーアイコンが必要。
- **`app.isPackaged` ガード**: 開発モード (`electron-forge start`) ではバンドル ID・署名がないため `SMAppService` が動作しない。パッケージ済みビルドのみ有効にする。

参照:

- <https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings>
- <https://github.com/electron/electron/issues/37228> (`openAsHidden` 廃止の経緯)
- <https://github.com/electron/electron/pull/42411> (`wasOpenedAtLogin` 復帰、Electron 29+)

## 変更対象ファイル

| ファイル | 変更種別 | 変更内容 |
| --------- | --------- | --------- |
| `src/types.ts` | 修正 | `autoLaunch` フィールドをスキーマに追加 |
| `src/main.ts` | 修正 | ログイン起動検知・Tray 作成・ウィンドウ表示制御 |
| `src/main/store.ts` | 修正 | 設定保存時に `app.setLoginItemSettings()` を同期 |
| `src/components/SettingsView.tsx` | 修正 | Switch トグル UI 追加 |
| `src/components/ui/switch.tsx` | 新規 | shadcn/ui Switch コンポーネント |

**変更なし**: `preload.ts`（既存の `settingsGet`/`settingsSet` で十分）、`forge.config.ts`

## 変更詳細

### 1. `src/types.ts`

設定スキーマに `autoLaunch` を追加する。

```ts
export const settingsSchema = z.object({
  // ... 既存フィールド ...
  shortcutKey: z.string().default("CommandOrControl+J"),
  ttsSpeed: z.number().default(1),
  autoLaunch: z.boolean().default(false),  // 追加
});
```

- デフォルト `false`（明示的にユーザーが有効化するまで登録しない）
- IPC チャネルの追加は不要（既存の `SETTINGS_GET` / `SETTINGS_SET` で完結）

### 2. `src/main/store.ts`

設定保存時のコールバック `onSettingsSaved` 内で、`autoLaunch` 値を Electron のログイン項目に同期する。

```ts
// setupSettingsHandlers 内の SETTINGS_SET ハンドラ
ipcMain.handle(IpcChannels.SETTINGS_SET, (_event, settings: Settings) => {
  saveSettings(settings);

  // ログイン項目を同期（パッケージ済みビルドのみ）
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: settings.autoLaunch });
  }

  onSettingsSaved?.(settings);
});
```

**ポイント**:

- `app.isPackaged` でガードし、開発モードでは何もしない
- `setLoginItemSettings` の `type` はデフォルトの `'mainAppService'` をそのまま使用（標準的なデスクトップアプリのため）
- 設定保存のたびに呼ばれるが、冪等な API のため副作用なし

### 3. `src/main.ts`

3つの変更を行う: (a) ログイン起動の検知、(b) Tray の作成、(c) ウィンドウ表示制御。

#### 3a. ログイン起動の検知

```ts
import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";

// ...

let tray: Tray | null = null;

app.on("ready", () => {
  const { wasOpenedAtLogin } = app.getLoginItemSettings();
  createTray();
  createWindow(!wasOpenedAtLogin); // ログイン起動時は非表示
});
```

#### 3b. Tray の作成

```ts
function createTray(): void {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, "../../icon.png"),
  );
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Rendio");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Rendio",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(contextMenu);
}
```

**ポイント**:

- `tray` をモジュールスコープの変数で保持（GC 防止）
- macOS では Tray アイコンは 16x16 が標準。`nativeImage.resize()` で調整
- コンテキストメニューは最小限: "Show Rendio" と "Quit"

#### 3c. `createWindow` の表示制御

```ts
const createWindow = (showWindow = true) => {
  ensureAccessibility();

  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    minWidth: 400,
    minHeight: 350,
    show: false,  // 常に非表示で作成（フラッシュ防止）
    icon: path.join(__dirname, "../../icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (showWindow) {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  // URL/ファイルロード（既存のまま）
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  registerShortcut(mainWindow);
};
```

**変更点**:

- `show: false` を追加（白フラッシュ防止）
- `ready-to-show` イベントで `showWindow` フラグに基づき表示/非表示を決定
- `showWindow` 引数を追加（デフォルト `true` で既存の動作を維持）

#### 3d. ライフサイクルイベントの調整

```ts
// ウィンドウが全て閉じてもアプリを終了しない（Tray で待機）
// 既存コードがまさにこの動作（darwin では quit しない）なので変更不要

app.on("activate", () => {
  // Dock アイコンクリック時
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(true);
  } else {
    mainWindow?.show();
    mainWindow?.focus();
  }
});
```

`activate` ハンドラに `mainWindow?.show()` / `focus()` を追加する。現在はウィンドウが 0 の場合のみ再作成しているが、ウィンドウが存在するが非表示の場合にも対応する必要がある。

### 4. `src/components/ui/switch.tsx` (新規)

shadcn/ui の Switch コンポーネントを追加する。

```bash
npx shadcn@latest add switch
```

これにより `@radix-ui/react-switch` ベースの Switch コンポーネントが生成される。既に `radix-ui` パッケージは依存関係に含まれているため、追加のインストールは不要。

### 5. `src/components/SettingsView.tsx`

Shortcut Key セクションの下に Auto Launch トグルを追加する。

```tsx
import { Switch } from "@/components/ui/switch";

// ... Dialog 内、Shortcut Key の後に追加 ...

<div className="flex items-center justify-between">
  <div className="grid gap-1">
    <Label htmlFor="autoLaunch">Launch at Login</Label>
    <p className="text-muted-foreground text-xs">
      Start Rendio when you log in to your Mac
    </p>
  </div>
  <Switch
    id="autoLaunch"
    checked={settings.autoLaunch}
    onCheckedChange={(checked) =>
      setSettings((prev) => ({ ...prev, autoLaunch: checked }))
    }
  />
</div>
```

**ポイント**:

- `Switch` は boolean のトグルに最適な UI（Select や Checkbox より直感的）
- 説明テキストを付けて機能を明確にする
- 設定保存時に `store.ts` 側で `app.setLoginItemSettings()` が呼ばれるため、ここでは state の更新のみ

## データフロー

```txt
[SettingsView]
  Switch ON/OFF
    ↓ setSettings({ autoLaunch: true/false })
    ↓ handleSave()
    ↓ window.electronAPI.settingsSet(settings)
    ↓ IPC
[store.ts]
  saveSettings() → settings.json に永続化
  app.setLoginItemSettings({ openAtLogin: settings.autoLaunch })
    ↓ Electron → macOS SMAppService
[macOS]
  ログイン項目に登録/解除

--- 次回 PC 起動時 ---

[macOS]
  ログイン項目から Rendio を起動
    ↓
[main.ts]
  app.getLoginItemSettings().wasOpenedAtLogin === true
    ↓
  createWindow(false) → show: false → ウィンドウ非表示
  createTray() → メニューバーにアイコン表示
  registerShortcut() → グローバルショートカット有効
    ↓
[ユーザー操作]
  Tray クリック → "Show Rendio" → mainWindow.show()
  or グローバルショートカット → win.show() + テキスト送信
```

## 制約・注意事項

| 項目 | 詳細 |
| ------ | ------ |
| 開発モードでは動作しない | `app.isPackaged` が `false` のため `setLoginItemSettings` は呼ばれない。Settings UI の Switch 自体は操作可能だが、OS への登録は行われない |
| コード署名 | 現在の `forge.config.ts` に ad-hoc 署名 (`codesign --force --deep --sign -`) が設定済み。ローカルテストにはこれで十分だが、配布時は Apple Developer 証明書が必要 |
| `requires-approval` 状態 | macOS 13+ で初回登録時に「システム設定 > 一般 > ログイン項目」での承認が必要になる場合がある。`getLoginItemSettings().status` で検知可能だが、初期実装では対応しない（承認 UI の複雑さに対してユーザー影響が小さいため） |
| Tray アイコン | `icon.png` をそのまま使用。macOS の Template Image 対応（ダークモード自動反転）が必要な場合は `icon_Template.png` または `icon_Template@2x.png` を別途用意し `nativeImage.createFromNamedImage` を使用する |
| ウィンドウ閉じるボタン | 現在「×」ボタンでウィンドウを閉じると `window-all-closed` が発火するが、darwin では `app.quit()` しない既存動作のため問題なし。ただし Tray が表示されている間、ユーザーがウィンドウを閉じた後に Dock アイコンクリックで再表示するには `activate` ハンドラの修正（3d）が必要 |

## テスト方法

1. `npm run package` でパッケージ済みビルドを作成
2. 生成された `.app` を起動
3. Settings > "Launch at Login" を ON にして Save
4. macOS の「システム設定 > 一般 > ログイン項目」に Rendio が表示されることを確認
5. PC を再起動（またはログアウト→ログイン）
6. Rendio のウィンドウが表示されず、メニューバーに Tray アイコンが表示されることを確認
7. Tray の "Show Rendio" でウィンドウが表示されることを確認
8. グローバルショートカットが非表示状態でも動作することを確認
9. Settings > "Launch at Login" を OFF にして Save → ログイン項目から削除されることを確認
