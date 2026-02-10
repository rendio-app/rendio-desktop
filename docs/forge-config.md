# forge.config.ts 設定解説

Electron Forge のビルド設定ファイル。`@electron/packager` へのオプション、ビルドフック、Maker（配布形式）、プラグインを定義している。

## packagerConfig

`@electron/packager` に渡されるオプション。

### asar

```ts
asar: true
```

アプリのソースコードとアセットを [ASAR アーカイブ](https://www.electronjs.org/docs/latest/tutorial/asar-archives)（`app.asar`）に単一ファイルとしてパッケージングする。

- Windows のパス長制限の回避
- `require` の高速化
- ソースコードの軽度な難読化（ただしセキュリティ境界ではない）

### icon

```ts
icon: './icon'
```

拡張子なしで指定する。プラットフォームに応じて自動的に `icon.icns`（macOS）/ `icon.ico`（Windows）/ `icon.png`（Linux）が選択される。

### appBundleId

```ts
appBundleId: 'pro.rendio.rendio'
```

macOS 専用オプション。`.app` バンドル内の `Info.plist` に `CFBundleIdentifier` として書き込まれる。macOS がアプリを一意に識別するための文字列で、逆引き DNS 記法（Reverse-DNS Notation）で記述する。

用途:

- OS によるアプリの一意識別
- 環境設定の保存先パス（`~/Library/Preferences/<bundleId>.plist`）
- コード署名との紐付け
- ファイル関連付け・URL スキームの登録

一度リリースしたら変更すべきではない。変更すると macOS は別アプリとして扱う。

### extendInfo

```ts
extendInfo: {
  NSAppleEventsUsageDescription:
    'This app needs to control System Events to capture selected text.',
}
```

macOS 専用オプション。`.app` バンドル内の `Info.plist` に追加のキーをマージする。

#### NSAppleEventsUsageDescription

macOS Mojave（10.14）以降、アプリが他のアプリに AppleEvent を送信するにはこの説明文が必須。未設定の場合、AppleEvent 送信時に `errAEEventNotPermitted (-1743)` エラーが発生する。

このアプリでは `src/main/selection.ts` で AppleScript 経由で System Events に `Cmd+C` キーストロークを送信し、ユーザーの選択テキストを取得している。この操作には AppleEvent の送信許可が必要であり、macOS が初回実行時に表示する許可ダイアログにこの文言が表示される。

## hooks

ビルドライフサイクルの各段階で実行されるカスタム処理。

### postPackage（Ad-hoc コード署名）

```ts
postPackage: async (_config, options) => {
  if (options.platform !== 'darwin') return;
  const outDir = options.outputPaths[0];
  const appBundle = readdirSync(outDir).find((f) => f.endsWith('.app'));
  if (!appBundle) return;
  const appPath = `${outDir}/${appBundle}`;
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath]);
}
```

`electron-forge package` 完了後に macOS でのみ実行される。

| フラグ | 意味 |
| --- | --- |
| `--sign -` | Ad-hoc 署名（証明書なし、ローカルマシン専用） |
| `--force` | 既存の署名を上書き |
| `--deep` | バンドル内のネストされたコード（helper, framework 等）を再帰的に署名 |

**Ad-hoc 署名の制限事項:**

- ローカルマシンでのみ有効。他のマシンにコピーすると Gatekeeper にブロックされる
- App Store への配布や公開配布には Apple Developer ID 証明書による署名が必要
- Fuses の改ざん防止には正式なコード署名が必要

## makers

プラットフォーム別の配布形式を定義する。

| Maker | 出力形式 | 対象 OS |
| --- | --- | --- |
| `MakerSquirrel` | `.exe` インストーラ | Windows |
| `MakerZIP` | `.zip` アーカイブ | macOS（`['darwin']` 指定） |
| `MakerRpm` | `.rpm` パッケージ | Linux（Red Hat 系） |
| `MakerDeb` | `.deb` パッケージ | Linux（Debian/Ubuntu 系） |

## plugins

### VitePlugin

Electron Forge のビルドパイプラインで Vite を使用するためのプラグイン。

```ts
build: [
  { entry: 'src/main.ts',    config: 'vite.main.config.ts',    target: 'main' },
  { entry: 'src/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
],
renderer: [
  { name: 'main_window', config: 'vite.renderer.config.mts' },
],
```

| ターゲット | 説明 | Vite 設定ファイル |
| --- | --- | --- |
| `main` | メインプロセス | `vite.main.config.ts` |
| `preload` | プリロードスクリプト | `vite.preload.config.ts` |
| `renderer` | レンダラープロセス（UI） | `vite.renderer.config.mts` |

### FusesPlugin

Electron バイナリ内のビットフラグを切り替え、パッケージ時点でセキュリティ機能を制御するプラグイン。コード署名後はフラグの改ざんが OS レベルで検出されるため、ユーザーが勝手に変更することはできない。

```ts
new FusesPlugin({
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
})
```

| Fuse | 設定値 | 意味 |
| --- | --- | --- |
| `RunAsNode` | `false` | 環境変数 `ELECTRON_RUN_AS_NODE` による Node.js モードでの起動を禁止。攻撃者がアプリを Node.js ランタイムとして悪用することを防ぐ |
| `EnableCookieEncryption` | `true` | Chromium の Cookie データベースを暗号化。一度有効にすると無効に戻せない（Cookie ストアが破損する） |
| `EnableNodeOptionsEnvironmentVariable` | `false` | `NODE_OPTIONS` / `NODE_EXTRA_CA_CERTS` 環境変数を無視。外部から Node.js ランタイムの動作を変更されることを防ぐ |
| `EnableNodeCliInspectArguments` | `false` | `--inspect`, `--inspect-brk` 等のデバッグフラグと `SIGUSR1` シグナルによるインスペクタ起動を無効化 |
| `EnableEmbeddedAsarIntegrityValidation` | `true` | `app.asar` の読み込み時にヘッダーハッシュを検証し、改ざんを検出する（macOS / Windows） |
| `OnlyLoadAppFromAsar` | `true` | アプリコードの読み込みを `app.asar` に限定。`EnableEmbeddedAsarIntegrityValidation` と組み合わせることで、検証されていないコードの実行を防ぐ |

## 参考リンク

- [Electron Forge Configuration](https://www.electronforge.io/config/configuration)
- [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [ASAR Archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives)
- [NSAppleEventsUsageDescription - Apple Developer](https://developer.apple.com/documentation/bundleresources/information-property-list/nsappleeventsusagedescription)
- [CFBundleIdentifier - Apple Developer](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleidentifier)
- [Code Signing - Electron](https://www.electronjs.org/docs/latest/tutorial/code-signing)
