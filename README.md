---
# Gemini Image MCP Server

これは、GoogleのGemini APIを使用して画像を生成し、指定されたディレクトリに保存するMCP (Model Context Protocol) サーバーです。
テキストプロンプトに加え、オプションで入力画像を指定して、それらを参考に新しい画像を生成することができます。
生成された画像は、ファイルサイズを削減するために圧縮処理が施されます。

---
## 機能

* テキストプロンプトからの画像生成
* （オプション）入力画像を指定し、それを参考にした画像生成
* 生成画像の自動圧縮 (JPEG, PNG)
* ユニークなファイル名での保存（ファイル名の衝突を回避）
* MCPサーバーとして動作し、標準入出力を介してツール呼び出しを受け付け

---
## 前提条件

* Node.js (v18以上推奨)
* Google Cloud Project と Gemini API の有効化
* Gemini API キー

---
## セットアップ

1.  **リポジトリのクローン:**
    ```bash
    git clone https://github.com/creating-cat/gemini-image-mcp-server.git
    cd gemini-image-mcp-server
    ```

2.  **依存関係のインストール:**
    ```bash
    npm install
    ```

3. **コードのビルド**
    ```bash
    npm run build
    ```

### Roo Codeの場合のMCPサーバー設定例

```json
{
  "mcpServers": {
    "gemini-image-mcp-server": {
      "command": "node",
      "args": [
        "/path/to/gemini-image-mcp-server/dist/index.js"
      ],
      "env": {
        "GEMINI_API_KEY": "YOUR_GEMINI_API_KEY"
      },
      "disabled": false,
      "timeout": 300
    }
  }
}
```

* `YOUR_GEMINI_API_KEY`にはあなたのGemini API KEYを設定してください。
  * `YOUR_GEMINI_API_KEY`を`${env:GEMINI_API_KEY}`とすることで環境変数から取得させることも可能です。(Roo Codeの機能)

---
## ツール: `generate_image`

このMCPサーバーは `generate_image` という名前のツールを提供します。

### 入力パラメータ

| パラメータ名            | 型                | 説明                                                                                                | デフォルト値        | 必須 |
| ----------------------- | ----------------- | --------------------------------------------------------------------------------------------------- | ------------------- | ---- |
| `prompt`                | `string`          | 画像を生成するためのテキストプロンプト。入力画像がある場合は、それらをどのように利用して新しい画像を生成してほしいか指示に含めてください。プロンプトは英語推奨。 | なし                | はい |
| `output_directory`      | `string`          | 画像を保存するディレクトリのパス。                                                                      | `output/images`     | いいえ |
| `file_name`             | `string`          | 保存する画像ファイルの名前（拡張子なし）。                                                                | `generated_image`   | いいえ |
| `input_image_paths`     | `string[]`        | (任意) 画像生成の参考にする入力画像のファイルパスのリスト。                                                       | `[]` (空の配列)     | いいえ |
| `use_enhanced_prompt` | `boolean`         | (任意) AIへの指示を補助する強化プロンプトを使用するかどうか。                                                   | `true`              | いいえ |

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

---

## 注意事項

* 入力画像のファイルパスは、このサーバーが実行されている環境からアクセス可能な絶対パスである必要があります。
* 生成される画像のMIMEタイプやアスペクト比は、Gemini APIのデフォルトに依存します。
* APIキーの取り扱いには十分注意してください。
* モデルに`gemini-2.0-flash-preview-image-generation`を使用しています。googleが公開をやめたりするなど、将来的に使えなくなる可能性があるかもしれません。

---
## ライセンス

MIT