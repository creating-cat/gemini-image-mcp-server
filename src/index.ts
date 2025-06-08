import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { generateImageTool } from './tools/imageGenerationTool';
import dotenv from 'dotenv';

dotenv.config(); // .env ファイルから環境変数をロード

const server = new McpServer({
  name: 'gemini-image-generation-mcp',
  version: "1.0.0", // バージョンを追加
  description: 'Gemini API を使用して画像を生成し、指定したディレクトリに保存するMCPサーバー',
});

// ツールを登録
// server.tool(generateImageTool.name, generateImageTool.input_schema.shape, generateImageTool.execute);
server.tool(generateImageTool.name, generateImageTool.input_schema.shape,
async ({ prompt, output_directory, file_name, mime_type, aspect_ratio, input_image_paths }) => { // input_image_paths を追加
  let res = await generateImageTool.execute({ prompt, output_directory, file_name, mime_type, aspect_ratio, input_image_paths }) // input_image_paths を渡す
  return {
    content: [{ type: "text", text: res.content[0].text }]
  };
});

// 標準入出力でメッセージの受信と送信を開始
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  // console.log('MCP Server started.');
}).catch(error => {
  console.error('MCP Server failed to start:', error);
});