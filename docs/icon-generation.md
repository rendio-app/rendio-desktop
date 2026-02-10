# アイコンファイルの生成方法

このドキュメントでは、`icon.png` から `icon.icns`（macOS 用）と `icon.ico`（Windows 用）を生成する手順を記載する。

## 前提

- ソース画像: `icon.png`（1024x1024, RGBA, sRGB）
- macOS 環境が必要（`sips`, `iconutil` を使用するため）

## icon.icns（macOS 用）

macOS 組み込みの `sips` と `iconutil` を使用する。

### 1. iconset フォルダを作成

```bash
mkdir icon.iconset
```

### 2. sips で各サイズにリサイズ

```bash
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
```

### 3. iconutil で icns に変換

```bash
iconutil -c icns icon.iconset -o icon.icns
```

### 4. 一時フォルダを削除

```bash
rm -rf icon.iconset
```

## icon.ico（Windows 用）

npm パッケージ [png2icons](https://github.com/idesis-gmbh/png2icons) を使用する。

### インストール

```bash
npm install -g png2icons
```

### 変換

```bash
png2icons icon.png icon -ico
```

以下の 9 サイズが ICO に含まれる:

| サイズ |
| --- |
| 16x16 |
| 24x24 |
| 32x32 |
| 48x48 |
| 64x64 |
| 72x72 |
| 96x96 |
| 128x128 |
| 256x256 |

## 一括生成スクリプト

```bash
#!/bin/bash
set -euo pipefail

SOURCE="icon.png"
ICONSET="icon.iconset"

# icns
mkdir -p "$ICONSET"
sips -z 16 16     "$SOURCE" --out "$ICONSET/icon_16x16.png"
sips -z 32 32     "$SOURCE" --out "$ICONSET/icon_16x16@2x.png"
sips -z 32 32     "$SOURCE" --out "$ICONSET/icon_32x32.png"
sips -z 64 64     "$SOURCE" --out "$ICONSET/icon_32x32@2x.png"
sips -z 128 128   "$SOURCE" --out "$ICONSET/icon_128x128.png"
sips -z 256 256   "$SOURCE" --out "$ICONSET/icon_128x128@2x.png"
sips -z 256 256   "$SOURCE" --out "$ICONSET/icon_256x256.png"
sips -z 512 512   "$SOURCE" --out "$ICONSET/icon_256x256@2x.png"
sips -z 512 512   "$SOURCE" --out "$ICONSET/icon_512x512.png"
sips -z 1024 1024 "$SOURCE" --out "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o icon.icns
rm -rf "$ICONSET"

# ico
png2icons "$SOURCE" icon -ico
```

## 生成されるファイル

| ファイル | 用途 | サイズ |
| --- | --- | --- |
| `icon.icns` | macOS (.app バンドル) | ~466 KB |
| `icon.ico` | Windows (.exe) | ~422 KB |

これらのファイルは `forge.config.ts` の `packagerConfig.icon` で参照される（拡張子なしで `'./icon'` と指定すると、プラットフォームに応じて自動選択される）。
