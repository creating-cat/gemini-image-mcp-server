import { GoogleGenAI, Modality, Part, GenerateContentResponse, GenerationConfig } from '@google/genai'; // GenerateImagesConfig, GenerateImagesResponse を削除し、GenerateContentResponse, GenerationConfig をインポート
import { writeFile, mkdir, stat, readFile } from 'fs/promises'; // stat, readFile をインポート
import * as path from 'path';
import { z } from "zod";
import dotenv from 'dotenv';
import sharp from 'sharp'; // sharpをインポート
import imagemin from 'imagemin'; // imagemin のインポートは imagemin-optipng の前に配置することが推奨される場合があります
import imageminOptipng from 'imagemin-optipng'; // imagemin-pngquant から imagemin-optipng に変更
import imageminMozjpeg from 'imagemin-mozjpeg';

dotenv.config(); // .env ファイルから環境変数をロード

// 環境変数からAPIキーを取得
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is not set.');
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const IMAGE_GENERATION_MODEL = 'gemini-2.0-flash-preview-image-generation';

// 定数定義
const DEFAULT_OUTPUT_DIRECTORY = 'output/images';
const DEFAULT_FILE_NAME = 'generated_image';
const DEFAULT_TARGET_IMAGE_MAX_SIZE = 512;
const JPEG_QUALITY = 70;
const PNG_COMPRESSION_LEVEL = 9;
const OPTIPNG_OPTIMIZATION_LEVEL = 2;

// 入力画像がある場合のプロンプトテンプレート
const ASSISTANT_PROMPT_TEMPLATE_WITH_IMAGES = `You are a professional image generation AI. Follow the steps below to generate the best possible image.

Step 1: Analyze Input Images (if any)
For each input image, thoroughly analyze and organize its key features (e.g., subject, style, mood, composition, color tone, motifs).

Step 2: Plan Integration with User Prompt
Deeply understand the analyzed features of the input images from Step 1 and the content of the "User Prompt" below. Then, plan how to creatively incorporate which elements of the input images into the new image to best realize the user's intent.

Step 3: Generate High-Quality Image
Based on the plan above, generate a high-quality image that faithfully reflects the instructions in the user prompt and effectively utilizes the elements of the input images.

--- User Prompt ---
{{USER_PROMPT}}
--- User Prompt End ---
`;

// 入力画像がない場合のプロンプトテンプレート
const ASSISTANT_PROMPT_TEMPLATE_NO_IMAGES = `You are a professional image generation AI. Follow the steps below to generate the best possible image.

Step 1: Understand User Prompt
Deeply understand the content of the "User Prompt" below and clarify what kind of image should be generated.

Step 2: Generate High-Quality Image
Based on the understanding above, generate a high-quality image that faithfully reflects the instructions in the user prompt.

--- User Prompt ---
{{USER_PROMPT}}
--- User Prompt End ---
`;

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
  output_directory: z.string().default(DEFAULT_OUTPUT_DIRECTORY).describe(`画像を保存するディレクトリのパス。デフォルトは '${DEFAULT_OUTPUT_DIRECTORY}'。`),
  file_name: z.string().default(DEFAULT_FILE_NAME).describe(`保存する画像ファイルの名前（拡張子なし）。デフォルトは '${DEFAULT_FILE_NAME}'。`),
  input_image_paths: z.array(z.string().describe("画像ファイルの絶対パス。")).optional().describe("任意。画像生成の参考にする入力画像のファイルパスのリスト。"),
  use_enhanced_prompt: z.boolean().default(true).describe("AIへの指示を補助する強化プロンプトを使用するかどうか。デフォルトはtrue。"),
  force_jpeg_conversion: z.boolean().optional().default(false).describe("PNGで生成された場合でもJPEGに変換して圧縮するかどうか。有効にすると透明情報は失われ、ファイルサイズ削減が期待できます。デフォルトはfalse。"),
  target_image_max_size: z.number().int().positive().optional().default(DEFAULT_TARGET_IMAGE_MAX_SIZE).describe(`リサイズ後の画像の最大辺の長さ（ピクセル）。元のアスペクト比を維持します。デフォルトは ${DEFAULT_TARGET_IMAGE_MAX_SIZE}。`)
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
        throw new Error(`Failed to check file path ${outputPath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return outputPath;
}

// 画像処理と圧縮を行うヘルパー関数
async function processAndCompressImage(
  imageBuffer: Buffer,
  originalFormat: string | undefined,
  forceJpeg: boolean,
  targetImageMaxSize: number
): Promise<{ processedBuffer: Buffer; extension: 'jpg' | 'png' }> {
  let processedImageBuffer: Buffer;
  let extension: 'jpg' | 'png';

  if (forceJpeg || originalFormat?.toLowerCase() === 'jpeg' || originalFormat?.toLowerCase() === 'jpg') {
    extension = 'jpg';
    // sharpでJPEGに変換・リサイズ (forceJpegがtrueの場合、元がPNGでもここにくる)
    const resizedJpegBuffer = await sharp(imageBuffer)
      .resize(targetImageMaxSize, targetImageMaxSize, { fit: 'inside' })
      .jpeg({
        quality: JPEG_QUALITY,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();

    // imageminMozjpegで圧縮
    processedImageBuffer = Buffer.from(await imagemin.buffer(resizedJpegBuffer, {
      plugins: [
        imageminMozjpeg({
          quality: JPEG_QUALITY,
          progressive: true
        })
      ]
    }));
  } else { // forceJpegがfalseで、かつ元がPNG (またはその他でJPEGではない) の場合
    extension = 'png';
    // sharpでPNGにリサイズ・圧縮
    const resizedPngBuffer = await sharp(imageBuffer)
      .resize(targetImageMaxSize, targetImageMaxSize, { fit: 'inside' })
      .png({ compressionLevel: PNG_COMPRESSION_LEVEL })
      .toBuffer();

    processedImageBuffer = Buffer.from(await imagemin.buffer(resizedPngBuffer, {
      plugins: [
        imageminOptipng({ optimizationLevel: OPTIPNG_OPTIMIZATION_LEVEL })
      ]
    }));
  }
  return { processedBuffer: processedImageBuffer, extension };
}

export const generateImageTool = {
  name: 'generate_image',
  description: 'プロンプトに基づいて画像を生成し、指定されたパスに保存します。',
  input_schema: generateImageInputSchema,
  execute: async (args: z.infer<typeof generateImageInputSchema>) => {
    try {
      const { prompt, output_directory, file_name, input_image_paths, use_enhanced_prompt, force_jpeg_conversion, target_image_max_size } = args;

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

      let processedPrompt: string;
      if (use_enhanced_prompt) {
        let selectedPromptTemplate: string;
        if (imageParts.length > 0) {
          selectedPromptTemplate = ASSISTANT_PROMPT_TEMPLATE_WITH_IMAGES;
        } else {
          selectedPromptTemplate = ASSISTANT_PROMPT_TEMPLATE_NO_IMAGES;
        }
        processedPrompt = selectedPromptTemplate.replace('{{USER_PROMPT}}', prompt);
      } else {
        processedPrompt = prompt;
      }

      const textPart: Part = { text: processedPrompt };
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
          if (part.inlineData && part.inlineData.mimeType?.startsWith('image/') && part.inlineData.data) {
            imageData = part.inlineData.data;
            imageMimeType = part.inlineData.mimeType
            break; // 最初の画像部分が見つかったらループを抜ける
          }
        }

        if (imageData && imageMimeType) { // imageMimeTypeもチェック対象に加える
          const imageBuffer = Buffer.from(imageData, 'base64');
          const meta = await sharp(imageBuffer).metadata();

          const { processedBuffer: processedImageBuffer, extension } = await processAndCompressImage(imageBuffer, meta.format, force_jpeg_conversion, target_image_max_size);

          const outputPath = await getUniqueFilePath(output_directory, file_name, extension);
          await writeFile(outputPath, processedImageBuffer);
          
          const originalSizeKB = (imageBuffer.length / 1024).toFixed(2);
          const compressedSizeKB = (processedImageBuffer.length / 1024).toFixed(2);

          let message = `画像が ${outputPath} に生成され、圧縮されました。`;
          // force_jpeg_conversionがtrueで、かつ元のAPIレスポンスのMIMEタイプがPNGだった場合にメッセージを変更
          if (force_jpeg_conversion && imageMimeType === 'image/png') {
            message = `画像が ${outputPath} に生成され、JPEGに変換後圧縮されました。`;
          }
          
          return {
            content: [
              {
                type: "text",
                text: `${message}\n元のサイズ: ${originalSizeKB}KB, 圧縮後のサイズ: ${compressedSizeKB}KB`
              }
            ]
          };
        } else {
          const detail = response.candidates[0]?.content?.parts?.map(p => p.text || p.inlineData?.mimeType || 'unknown_part').join(', ');
          throw new Error(`レスポンスから有効な画像データが見つかりませんでした。受け取ったパーツ: [${detail || 'なし'}]`);
        }
      } else {
        let errorMessage = '画像が生成されませんでした。レスポンスが空か、予期しない形式である可能性があります。';
        if (response.promptFeedback) {
          errorMessage += ` プロンプトフィードバック: ${JSON.stringify(response.promptFeedback)}`;
        }
        // response.candidates[0]?.finishReason や safetyRatings もログやエラーメッセージに含めると有益です。
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('画像生成エラー:', error);
      return {
        content: [{ type: "text", text: `画像生成中にエラーが発生しました: ${error.message}` }]
      };
    }
  }
};