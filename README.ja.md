[Read in English](./README.md)

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

### Roo Codeの場合のMCPサーバー設定例

```json
{
  "mcpServers": {
    "gemini-image-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@creating-cat/gemini-image-mcp-server"
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

| パラメータ名                      | 説明                                                                                                                                                             | デフォルト値      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `prompt`                          | (string, 必須) 画像を生成するためのテキストプロンプト。入力画像がある場合は、それらをどのように利用して新しい画像を生成してほしいか指示に含めてください。プロンプトは英語推奨。 | なし              |
| `output_directory`                | (string, 任意) 画像を保存するディレクトリのパス。                                                                                                                  | `output/images`   |
| `file_name`                       | (string, 任意) 保存する画像ファイルの名前（拡張子なし）。                                                                                                          | `generated_image` |
| `input_image_paths`               | (string[], 任意) 画像生成の参考にする入力画像のファイルパスのリスト。                                                                                                | `[]` (空の配列)   |
| `use_enhanced_prompt`             | (boolean, 任意) AIへの指示を補助する強化プロンプトを使用するかどうか。                                                                                             | `true`            |
| `target_image_max_size`           | (number, 任意) リサイズ後の画像の最大辺の長さ（ピクセル）。元のアスペクト比を維持します。                                                                            | `512`             |
| `force_conversion_type`           | (string, 任意) 特定のフォーマット（'jpeg', 'webp', 'png'）への変換を強制します。指定しない場合、元のフォーマットが処理されます（JPEG以外はPNGとして扱われます）。 | なし              |
| `skip_compression_and_resizing`   | (boolean, 任意) 生成された画像の圧縮とリサイズをスキップするかどうか。`true`の場合、`force_conversion_type`と`target_image_max_size`は無視されます。                   | `false`           |
| `jpeg_quality`                    | (number, 任意) JPEGの品質（0-100）。数値が低いほど圧縮率が高くなります。                                                                                             | `80`              |
| `webp_quality`                    | (number, 任意) WebPの品質（0-100）。数値が低いほど圧縮率が高くなります。                                                                                             | `80`              |
| `png_compression_level`           | (number, 任意) PNGの圧縮レベル（0-9）。数値が高いほど圧縮率が高くなります。                                                                                        | `9`               |
| `optipng_optimization_level`      | (number, 任意) OptiPNGの最適化レベル（0-7）。数値が高いほど圧縮率が高くなります。                                                                                    | `2`               |

### 出力

成功した場合、生成された画像の保存パスと、処理内容に応じたメッセージを返します。メッセージには元のサイズと処理後のサイズ情報が含まれます。
例:
```json
{
  "content": [
    {
      "type": "text",
      "text": "画像が output/images/my_cat.jpg に生成され、圧縮されました。\n元のサイズ: 1024.12KB, 処理後のサイズ: 150.45KB"
    }
  ]
}
```
エラーが発生した場合は、エラーメッセージを返します。

---

## 注意事項

* 生成される画像のMIMEタイプやアスペクト比は、Gemini APIのデフォルトに依存します。
* APIキーの取り扱いには十分注意してください。
* モデルに`gemini-2.0-flash-preview-image-generation`を使用しています。googleが公開をやめたりするなど、将来的に使えなくなる可能性があるかもしれません。

---
## ライセンス

MIT