import { GoogleGenAI, GenerateImagesConfig, GenerateImagesResponse } from '@google/genai';
import { writeFile, mkdir } from 'fs/promises';
import * as path from 'path';
import { z } from "zod";
import dotenv from 'dotenv';

dotenv.config(); // .env ファイルから環境変数をロード

// 環境変数からAPIキーを取得
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is not set.');
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const IMAGE_GENERATION_MODEL = 'imagen-3.0-generate-002'; // サンプルコードからモデル名を取得

// ツールの入力スキーマをzodで定義
export const generateImageInputSchema = z.object({
  prompt: z.string().describe('画像を生成するためのテキストプロンプト。'),
  output_directory: z.string().default('output/images').describe("画像を保存するディレクトリのパス。デフォルトは 'output/images'。"),
  file_name: z.string().default('generated_image').describe("保存する画像ファイルの名前（拡張子なし）。デフォルトは 'generated_image'。"),
  mime_type: z.enum(['image/jpeg', 'image/png']).default('image/jpeg').describe("出力画像形式。'image/jpeg' または 'image/png'。"),
  aspect_ratio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1').describe("出力画像の縦横比。")
});

export const generateImageTool = {
  name: 'generate_image',
  description: 'プロンプトに基づいて画像を生成し、指定されたパスに保存します。',
  input_schema: generateImageInputSchema,
  execute: async (args: z.infer<typeof generateImageInputSchema>) => {
    try {
      const { prompt, output_directory, file_name, mime_type, aspect_ratio } = args;

      // ディレクトリが存在しない場合は作成
      await mkdir(output_directory, { recursive: true });

      const config: GenerateImagesConfig = {
        numberOfImages: 1,
        outputMimeType: mime_type,
        aspectRatio: aspect_ratio,
      };

      const response: GenerateImagesResponse = await ai.models.generateImages({
        model: IMAGE_GENERATION_MODEL,
        prompt: prompt,
        config: config,
      });

      if (response.generatedImages && response.generatedImages.length > 0) {
        const firstImage = response.generatedImages[0];
        if (firstImage.image && firstImage.image.imageBytes) {
          const imageBytes = firstImage.image.imageBytes;

          const outputPath = path.join(output_directory, `${file_name}.${mime_type === 'image/jpeg' ? 'jpg' : 'png'}`);

          await writeFile(outputPath, Buffer.from(imageBytes, 'base64'));

          return {
            content: [
              { type: "text", text: `画像が ${outputPath} に生成されました。` }
            ]
          };
        } else {
          throw new Error('画像データがレスポンスから取得できませんでした。');
        }
      } else {
        throw new Error('No image was generated. The response might be empty or in an unexpected format. This could be due to safety filters or an issue with the prompt.');
      }
    } catch (error: any) {
      console.error('画像生成エラー:', error);
      return {
        content: [{ type: "text", text: `画像生成中にエラーが発生しました: ${error.message}` }]
      };
    }
  }
};