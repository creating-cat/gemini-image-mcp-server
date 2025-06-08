import { GoogleGenAI, Modality, Part, GenerateContentResponse, GenerationConfig } from '@google/genai'; // GenerateImagesConfig, GenerateImagesResponse を削除し、GenerateContentResponse, GenerationConfig をインポート
import { writeFile, mkdir, stat, readFile } from 'fs/promises'; // stat, readFile をインポート
import * as path from 'path';
import { z } from "zod";
import dotenv from 'dotenv';
import sharp from 'sharp'; // sharpをインポート
import imagemin from 'imagemin';
import imageminPngquant from 'imagemin-pngquant';
import imageminMozjpeg from 'imagemin-mozjpeg';

dotenv.config(); // .env ファイルから環境変数をロード

// 環境変数からAPIキーを取得
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is not set.');
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const IMAGE_GENERATION_MODEL = 'gemini-2.0-flash-preview-image-generation';

// InlineDataPartインターフェースを定義
export interface InlineDataPart {
  inlineData: {
    mimeType: string;
    data: string; // base64 encoded string
  };
}

// ツールの入力スキーマをzodで定義
export const generateImageInputSchema = z.object({
  prompt: z.string().describe('画像を生成するためのテキストプロンプト。入力画像がある場合は、それらをどのように利用して新しい画像を生成してほしいか指示に含めてください。プロンプトは英語推奨'),
  output_directory: z.string().default('output/images').describe("画像を保存するディレクトリのパス。デフォルトは 'output/images'。"),
  file_name: z.string().default('generated_image').describe("保存する画像ファイルの名前（拡張子なし）。デフォルトは 'generated_image'。"),
  input_image_paths: z.array(z.string().describe("画像ファイルの絶対パス。")).optional().describe("任意。画像生成の参考にする入力画像のファイルパスのリスト。")
});

// ファイル名が重複しないようにユニークなパスを生成するヘルパー関数
async function getUniqueFilePath(directory: string, baseName: string, extension: string): Promise<string> {
  let counter = 0;
  let outputPath = '';
  while (true) {
    const currentFileName = counter === 0 ? baseName : `${baseName} (${counter})`;
    outputPath = path.join(directory, `${currentFileName}.${extension}`);
    try {
      await stat(outputPath); // ファイルが存在するかチェック
      counter++; // 存在する場合はカウンターを増やす
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        // ファイルが存在しない場合、このパスを使用
        break;
      } else {
        // その他のエラー
        throw e;
      }
    }
  }
  return outputPath;
}

export const generateImageTool = {
  name: 'generate_image',
  description: 'プロンプトに基づいて画像を生成し、指定されたパスに保存します。',
  input_schema: generateImageInputSchema,
  execute: async (args: z.infer<typeof generateImageInputSchema>) => {
    try {
      const { prompt, output_directory, file_name, input_image_paths } = args;

      let imageParts: InlineDataPart[] = [];
      if (input_image_paths && input_image_paths.length > 0) {
        console.log(`Input image paths received: ${input_image_paths.join(', ')}`);
        imageParts = await Promise.all(
          input_image_paths.map(async (filePath) => {
            try {
              console.log(`Processing image file: ${filePath}`);
              const fileBuffer = await readFile(filePath);
              const base64Data = fileBuffer.toString('base64');
              const extension = path.extname(filePath).toLowerCase();
              let resolvedMimeType = 'application/octet-stream'; // デフォルト

              if (extension === '.png') {
                resolvedMimeType = 'image/png';
              } else if (extension === '.jpg' || extension === '.jpeg') {
                resolvedMimeType = 'image/jpeg';
              } else if (extension === '.webp') {
                resolvedMimeType = 'image/webp';
              }
              // 必要に応じて他の画像形式（例: image/gif, image/heic, image/heif）も追加

              console.log(`File ${filePath} processed. MimeType: ${resolvedMimeType}`);
              return {
                inlineData: {
                  data: base64Data,
                  mimeType: resolvedMimeType,
                },
              };
            } catch (error) {
              console.error(`Error processing image file ${filePath}:`, error);
              throw new Error(`Failed to read or process input image file: ${filePath}. ${error instanceof Error ? error.message : String(error)}`);
            }
          })
        );
        console.log(`Successfully prepared ${imageParts.length} image parts.`);
      }

      // ディレクトリが存在しない場合は作成
      await mkdir(output_directory, { recursive: true });

      const textPart: Part = { text: prompt };
      let allParts: Part[];

      if (imageParts.length > 0) {
        // 画像がある場合は、テキストプロンプトの後に画像パーツを配置
        // The current selection `tPart, ...im` is part of this line.
        allParts = [textPart, ...imageParts];
      } else {
        allParts = [textPart];
      }

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: IMAGE_GENERATION_MODEL,
        contents: [{ role: "user", parts: allParts }],
        config: {
          // temperature: 0.8, // 必要に応じて調整
          responseModalities: [Modality.IMAGE, Modality.TEXT], // 画像とテキストのレスポンスを期待
          // numberOfImages: 1, // generateContent APIでは直接この指定がない場合があるため、モデルのデフォルトや挙動に依存。必要ならAPI仕様確認。
        } as GenerationConfig // 明示的な型アサーション（必要に応じて）
      });

      if (response.candidates && response.candidates[0]?.content?.parts) {
        let imageData: string | undefined
        let imageMimeType: string | undefined
        for (const part of response.candidates[0].content.parts) {
          if (!imageData && part.inlineData && part.inlineData.mimeType?.startsWith('image/') && part.inlineData.data) {
            imageData = part.inlineData.data;
            imageMimeType = part.inlineData.mimeType
          }
        }

        if (imageData && imageMimeType) {
          const imageBuffer = Buffer.from(imageData, 'base64');
          let processedImageBuffer: Buffer = imageBuffer;
          const meta = await sharp(imageBuffer).metadata();
                    
          const extension = meta.format === 'png' ? 'png' : 'jpg';
          const outputPath = await getUniqueFilePath(output_directory, file_name, extension);

          // 画像圧縮処理
          // NOTE: imageMimeTypeは当てにならないので、
          if (meta.format === 'jpeg' || meta.format === 'jpg') {
            const resizedJpegBuffer = await sharp(imageBuffer)
              .resize(512, 512, { fit: 'inside' })
              .jpeg({
                quality: 70,
                progressive: true,
                mozjpeg: true
              })
              .toBuffer();
          
            // さらに imagemin-mozjpeg で再圧縮
            processedImageBuffer = Buffer.from(await imagemin.buffer(resizedJpegBuffer, {
              plugins: [
                imageminMozjpeg({
                  quality: 70,  // 同等の品質設定
                  progressive: true
                })
              ]
            }));
          
          } else if (meta.format === 'png') {
            const resizedPngBuffer = await sharp(imageBuffer)
              .resize(512, 512, { fit: 'inside' })
              .png({ compressionLevel: 9 })
              .toBuffer();
          
            processedImageBuffer = Buffer.from(await imagemin.buffer(resizedPngBuffer, {
              plugins: [
                imageminPngquant({
                  quality: [0.6, 0.8],
                  speed: 1
                })
              ]
            }));
          }
          
          await writeFile(outputPath, processedImageBuffer);
          
          const originalSizeKB = (imageBuffer.length / 1024).toFixed(2);
          const compressedSizeKB = (processedImageBuffer.length / 1024).toFixed(2);
          
          return {
            content: [
              {
                type: "text",
                text: `画像が ${outputPath} に生成され、圧縮されました。\n元のサイズ: ${originalSizeKB}KB, 圧縮後のサイズ: ${compressedSizeKB}KB`
              }
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