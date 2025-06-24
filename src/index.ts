import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { generateImageTool } from './tools/imageGenerationTool';
import dotenv from 'dotenv';

dotenv.config(); // .env ファイルから環境変数をロード

const server = new McpServer({
  name: 'gemini-image-generation-mcp',
  version: "0.0.1", // バージョンを追加
  description: 'Gemini API を使用して画像を生成し、指定したディレクトリに保存するMCPサーバー',
});

// ツールを登録
// server.tool(generateImageTool.name, generateImageTool.input_schema.shape, generateImageTool.execute);
server.tool(generateImageTool.name, generateImageTool.description, generateImageTool.input_schema.shape, async (args) => {
  // ツール実行時に渡される引数オブジェクト(args)をそのままexecute関数に渡すことで、
  // 今後ツールに新しい引数を追加した際にこのファイルを変更する必要がなくなります。
  const res = await generateImageTool.execute(args);

  // executeからの戻り値がエラーメッセージの場合も考慮し、安全にtextプロパティにアクセスします。
  if (res && res.content && res.content.length > 0 && res.content[0].text) {
    return {
      content: [{ type: "text", text: res.content[0].text }]
    };
  }
  // 予期しないレスポンスの場合のフォールバック
  return { content: [{ type: "text", text: "処理が完了しましたが、予期しない応答がありました。" }] };
});

// 標準入出力でメッセージの受信と送信を開始
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  // console.log('MCP Server started.');
}).catch(error => {
  console.error('MCP Server failed to start:', error);
});