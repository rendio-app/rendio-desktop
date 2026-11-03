# Rendio

OpenAI API を使った日英翻訳デスクトップアプリ（macOS 向け）。テキスト読み上げ（TTS）機能付き。

## 技術スタック

- Electron + React + TypeScript
- Vite（ビルド）
- TailwindCSS + shadcn/ui（UI）
- OpenAI API（翻訳）
- [Kokoro TTS](https://github.com/hexgrad/kokoro)（音声合成）

## セットアップ

**前提条件**: Node.js および npm がインストール済みであること。

```bash
# 依存パッケージのインストール
npm install

# 開発モードで起動
npm start
```

起動後、設定画面から OpenAI API キーとモデル名を入力してください。

### その他のコマンド

| コマンド | 説明 |
| --- | --- |
| `npm run package` | アプリをパッケージング |
| `npm run make` | インストーラーを生成 |
| `npm run lint` | Biome によるコードチェック |
| `npm run lint:fix` | リントエラーの自動修正 |
| `npm run format` | コードのフォーマット |
| `npm run knip` | 未使用の依存・エクスポートの検出 |

### macOS アプリとしてインストール

```bash
# コード署名 ID を指定してパッケージング（未指定なら ad-hoc 署名）
RENDIO_SIGN_IDENTITY="Apple Development: <名前> (<ID>)" npm run package

# /Applications にコピー
ditto out/Rendio-darwin-arm64/Rendio.app /Applications/Rendio.app
```

証明書（Xcode の無料 Personal Team の「Apple Development」でも可）で署名すると、再ビルドしてもアクセシビリティ許可が維持されます。ad-hoc 署名の場合は、ビルドのたびに「システム設定 > プライバシーとセキュリティ > アクセシビリティ」で Rendio を削除して許可し直す必要があります。詳細は [docs/forge-config.md](docs/forge-config.md) を参照してください。

### 翻訳を速くする設定

設定画面の **Reasoning** を **Off** にすると、API に `reasoning_effort: "none"` を送り、モデルの思考（thinking）を無効にします。最初の文字が表示されるまでの時間が短くなります。対応していない API でエラーになる場合は Default に戻してください。

## 外部通信について

本アプリは以下の外部サービスと通信を行います。

### OpenAI API（翻訳）

翻訳実行時に、設定画面で指定された API エンドポイント（デフォルト: `https://api.openai.com/v1/chat/completions`）へリクエストを送信します。送信されるデータは以下の通りです。

- 翻訳対象のテキスト
- システムプロンプト（翻訳指示）
- モデル名

API キーは設定画面から入力し、`~/Library/Application Support/Rendio/settings.json` にローカル保存されます。API キーは OpenAI のサーバーへの認証にのみ使用され、それ以外の外部サービスには送信されません。

レスポンスはストリーミング形式（SSE）でリアルタイムに受信されます。

### Hugging Face Hub（TTS モデルのダウンロード）

テキスト読み上げ機能の初回使用時に、Hugging Face Hub から TTS モデル（`onnx-community/Kokoro-82M-v1.0-ONNX`）をダウンロードします。ダウンロードされたモデルはローカルにキャッシュされるため、2 回目以降の通信は発生しません。

## macOS の権限について

### キーチェーンアクセスのダイアログ

初回起動時やアプリ更新後に以下のようなダイアログが表示されることがあります。

> Rendio wants to use your confidential information stored in "Rendio Safe Storage" in your keychain.

これは Electron 内部の Chromium が Cookie やセッションデータを暗号化して保存するために macOS キーチェーンを使用する際に表示されるものです。本アプリの Electron Fuses 設定で `EnableCookieEncryption` が有効になっているため、暗号化キーが `Rendio Safe Storage` というキーチェーン項目に保存されます。

- **Allow / Always Allow**: アプリがキーチェーンにアクセスすることを許可します。「Always Allow」を選択すると、次回以降このダイアログは表示されません。
- **Deny**: アクセスを拒否します。アプリの基本的な翻訳機能には影響しませんが、暗号化されたストレージが利用できなくなります。

これは macOS の標準的なセキュリティ機構であり、Rendio 固有の問題ではありません。詳しくは [Electron safeStorage ドキュメント](https://www.electronjs.org/docs/latest/api/safe-storage) を参照してください。

### アクセシビリティ権限

Rendio はグローバルショートカットで選択中のテキストを取得するために、macOS のアクセシビリティ権限を必要とします。初回起動時にシステムダイアログが表示されるので、「システム設定 > プライバシーとセキュリティ > アクセシビリティ」から Rendio を許可してください。

## ライセンス

MIT
