---
## Gemini Image MCP Server: 開発者向け実装ノート

このドキュメントは、Gemini API を利用して画像を生成し、指定されたディレクトリに保存する MCP (Model Context Protocol) サーバーの実装に関する開発者向け情報を提供します。

---
### デバッグ方法

以下を実行し、Web インターフェースでデバッグを行います。

```bash
npx @modelcontextprotocol/inspector
```

ブラウザで `http://127.0.0.1:6274/` にアクセスしてください。

各種設定を入力することで動作確認できます。
