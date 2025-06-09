# Gemini Image Generation MCP Server

これは、GoogleのGemini APIを使用して画像を生成し、指定されたディレクトリに保存するMCP (Model Context Protocol) サーバーです。
テキストプロンプトに加え、オプションで入力画像を指定して、それらを参考に新しい画像を生成することができます。
生成された画像は、ファイルサイズを削減するために圧縮処理が施されます。

## 機能

*   テキストプロンプトからの画像生成
*   （オプション）入力画像を指定し、それを参考にした画像生成
*   生成画像の自動圧縮 (JPEG, PNG)
*   ユニークなファイル名での保存（ファイル名の衝突を回避）
*   MCPサーバーとして動作し、標準入出力を介してツール呼び出しを受け付け

## 前提条件

*   Node.js (v18以上推奨)
*   Google Cloud Project と Gemini API の有効化
*   Gemini API キー

## セットアップ

1.  **リポジトリのクローン:**
    ```bash
    git clone <リポジトリのURL>
    cd gemini-image-generation-mcp
    ```

2.  **依存関係のインストール:**
    ```bash
    npm install
    ```

3.  **環境変数の設定:**
    プロジェクトのルートディレクトリに `.env` ファイルを作成し、Gemini APIキーを設定します。
    ```
    GEMINI_API_KEY=YOUR_GEMINI_API_KEY
    ```
    `YOUR_GEMINI_API_KEY` を実際のAPIキーに置き換えてください。

## ビルド

TypeScriptコードをJavaScriptにコンパイルします。
```bash
npm run build
```
これにより `dist` ディレクトリにコンパイル済みのファイルが生成されます。

## 実行

### 開発モード (ts-nodeを使用)
```bash
npm run dev
```

### 本番モード (ビルド後)
```bash
npm run start
```
サーバーが起動し、標準入出力を介してMCPクライアントからのリクエストを待ち受けます。

## ツール: `generate_image`

このMCPサーバーは `generate_image` という名前のツールを提供します。

### 入力パラメータ

| パラメータ名        | 型                | 説明                                                                                                | デフォルト値        | 必須 |
| ------------------- | ----------------- | --------------------------------------------------------------------------------------------------- | ------------------- | ---- |
| `prompt`            | `string`          | 画像を生成するためのテキストプロンプト。入力画像がある場合は、それらをどのように利用して新しい画像を生成してほしいか指示に含めてください。プロンプトは英語推奨。 | なし                | はい |
| `output_directory`  | `string`          | 画像を保存するディレクトリのパス。                                                                      | `output/images`     | いいえ |
| `file_name`         | `string`          | 保存する画像ファイルの名前（拡張子なし）。                                                                | `generated_image`   | いいえ |
| `input_image_paths` | `string[]`        | (任意) 画像生成の参考にする入力画像のファイルパスのリスト。                                                       | `[]` (空の配列)     | いいえ |

### 出力

成功した場合、生成され圧縮された画像の保存パスと、元のサイズおよび圧縮後のサイズ情報を含むテキストメッセージを返します。
例:
```json
{
  "content": [
    {
      "type": "text",
      "text": "画像が output/images/generated_image.jpg に生成され、圧縮されました。\n元のサイズ: XXX.XXKB, 圧縮後のサイズ: YYY.YYKB"
    }
  ]
}
```
エラーが発生した場合は、エラーメッセージを返します。

## MCPクライアントからの呼び出し例

MCPクライアント (例: `@modelcontextprotocol/sdk` を使用したクライアント) から以下のようなリクエストを送信することでツールを呼び出せます。

```json
{
  "tool_name": "generate_image",
  "tool_input": {
    "prompt": "A futuristic cityscape at sunset, with flying cars and neon lights.",
    "output_directory": "my_generated_images",
    "file_name": "city_of_future"
  }
}
```

入力画像を指定する場合:
```json
{
  "tool_name": "generate_image",
  "tool_input": {
    "prompt": "Make this cat wear a party hat.",
    "input_image_paths": ["/path/to/my/cat_image.jpg"]
  }
}
```

## デバッグ方法

以下を実行

```
npx @modelcontextprotocol/inspector
```

http://127.0.0.1:6274/ にアクセスしてデバッグを行う

## 注意事項

*   入力画像のファイルパスは、このサーバーが実行されている環境からアクセス可能な絶対パスである必要があります。
*   生成される画像のMIMEタイプやアスペクト比は、現在Gemini APIのデフォルトに依存します。
*   APIキーの取り扱いには十分注意してください。

## ライセンス

MIT