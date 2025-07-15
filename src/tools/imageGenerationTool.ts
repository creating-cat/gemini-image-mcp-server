import { GoogleGenAI, Modality, Part, GenerateContentResponse, GenerationConfig } from '@google/genai'; // GenerateImagesConfig, GenerateImagesResponse を削除し、GenerateContentResponse, GenerationConfig をインポート
import { writeFile, mkdir, stat, readFile } from 'fs/promises'; // stat, readFile をインポート
import * as path from 'path';
import { z } from "zod";
import dotenv from 'dotenv';
import sharp from 'sharp'; // sharpをインポート
import imagemin from 'imagemin'; // imagemin のインポートは imagemin-optipng の前に配置することが推奨される場合があります
import imageminOptipng from 'imagemin-optipng'; // imagemin-pngquant から imagemin-optipng に変更
import imageminMozjpeg from 'imagemin-mozjpeg';
import imageminWebp from 'imagemin-webp';

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

// 圧縮パラメータのデフォルト値
const DEFAULT_JPEG_QUALITY = 80;
const DEFAULT_WEBP_QUALITY = 80;
const DEFAULT_PNG_COMPRESSION_LEVEL = 9;
const DEFAULT_OPTIPNG_OPTIMIZATION_LEVEL = 2;

// MIMEタイプと拡張子の定数
const MIME_TYPES = {
  PNG: 'image/png',
  JPEG: 'image/jpeg',
  WEBP: 'image/webp',
  OCTET_STREAM: 'application/octet-stream',
};
const EXTENSIONS = {
  JPG: 'jpg',
  PNG: 'png',
  WEBP: 'webp',
};

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
  prompt: z.string().describe('Text prompt for image generation. If input images are provided, include instructions on how to use them to create the new image. English is recommended.'),
  output_directory: z.string().default(DEFAULT_OUTPUT_DIRECTORY).describe(`The directory path to save the image. Defaults to '${DEFAULT_OUTPUT_DIRECTORY}'.`),
  file_name: z.string().default(DEFAULT_FILE_NAME).describe(`The name of the image file to be saved (without extension). Defaults to '${DEFAULT_FILE_NAME}'.`),
  input_image_paths: z.array(z.string().describe("Absolute path of the image file.")).optional().describe("Optional. A list of file paths for input images to be used as a reference for generation."),
  use_enhanced_prompt: z.boolean().default(true).describe("Whether to use an enhanced prompt to assist the AI's instructions. Defaults to true."),
  target_image_max_size: z.number().int().positive().optional().default(DEFAULT_TARGET_IMAGE_MAX_SIZE).describe(`The maximum length (in pixels) of the longest side of the resized image. The original aspect ratio is maintained. Defaults to ${DEFAULT_TARGET_IMAGE_MAX_SIZE}.`),
  force_conversion_type: z.enum(['jpeg', 'webp', 'png']).optional().describe("Optionally force conversion to a specific format ('jpeg', 'webp', 'png'). If not specified, the original format will be processed, defaulting to PNG for non-JPEG images."),
  skip_compression_and_resizing: z.boolean().optional().default(false).describe("Whether to skip compression and resizing of the generated image. If true, `force_conversion_type` and `target_image_max_size` are ignored. Defaults to false."),
  jpeg_quality: z.number().int().min(0).max(100).optional().default(DEFAULT_JPEG_QUALITY).describe(`JPEG quality (0-100). Lower values result in higher compression. Defaults to ${DEFAULT_JPEG_QUALITY}.`),
  webp_quality: z.number().int().min(0).max(100).optional().default(DEFAULT_WEBP_QUALITY).describe(`WebP quality (0-100). Lower values result in higher compression. Defaults to ${DEFAULT_WEBP_QUALITY}.`),
  png_compression_level: z.number().int().min(0).max(9).optional().default(DEFAULT_PNG_COMPRESSION_LEVEL).describe(`PNG compression level (0-9). Higher values result in higher compression. Defaults to ${DEFAULT_PNG_COMPRESSION_LEVEL}.`),
  optipng_optimization_level: z.number().int().min(0).max(7).optional().default(DEFAULT_OPTIPNG_OPTIMIZATION_LEVEL).describe(`OptiPNG optimization level (0-7). Higher values result in higher compression. Defaults to ${DEFAULT_OPTIPNG_OPTIMIZATION_LEVEL}.`),
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

// 圧縮オプションの型定義
interface CompressionOptions {
  jpegQuality: number;
  webpQuality: number;
  pngCompressionLevel: number;
  optipngOptimizationLevel: number;
}

// 画像処理と圧縮を行うヘルパー関数
async function processAndCompressImage(
  imageBuffer: Buffer,
  originalFormat: string | undefined, // sharpから取得したフォーマット名 (e.g., 'jpeg', 'png')
  conversionType: 'jpeg' | 'webp' | 'png' | undefined,
  targetImageMaxSize: number,
  options: CompressionOptions
): Promise<{ processedBuffer: Buffer; extension: typeof EXTENSIONS.JPG | typeof EXTENSIONS.PNG | typeof EXTENSIONS.WEBP }> {
  const sharpInstance = sharp(imageBuffer).resize(targetImageMaxSize, targetImageMaxSize, { fit: 'inside' });

  // 最終的な処理フォーマットを決定。指定があればそれを使い、なければ元のフォーマットを維持（JPEG以外はPNG扱い）
  const targetFormat = conversionType || (originalFormat === 'jpeg' ? 'jpeg' : 'png');

  if (targetFormat === 'jpeg') {
    const resizedJpegBuffer = await sharpInstance
      .jpeg({
        quality: options.jpegQuality,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();

    const compressedData = await imagemin.buffer(resizedJpegBuffer, {
      plugins: [
        imageminMozjpeg({
          quality: options.jpegQuality,
          progressive: true
        })
      ]
    });
    const processedBuffer = Buffer.from(compressedData);
    return { processedBuffer, extension: EXTENSIONS.JPG };
  } else if (targetFormat === 'webp') {
    // sharpでリサイズとWebPへの初期変換
    const resizedWebpBuffer = await sharpInstance
      .webp({ quality: options.webpQuality }) // sharpでも品質を指定し、初期変換
      .toBuffer();

    // imagemin-webpでさらに最適化
    const compressedData = await imagemin.buffer(resizedWebpBuffer, {
      plugins: [
        imageminWebp({
          quality: options.webpQuality,
        })
      ]
    });
    const processedBuffer = Buffer.from(compressedData);
    return { processedBuffer, extension: EXTENSIONS.WEBP };
  } else { // 'png'
    // PNGとして処理
    const resizedPngBuffer = await sharpInstance
      .png({ compressionLevel: options.pngCompressionLevel })
      .toBuffer();

    const compressedData = await imagemin.buffer(resizedPngBuffer, {
      plugins: [
        imageminOptipng({ optimizationLevel: options.optipngOptimizationLevel })
      ]
    });
    const processedBuffer = Buffer.from(compressedData);
    return { processedBuffer, extension: EXTENSIONS.PNG };
  }
}

export const generateImageTool = {
  name: 'generate_image',
  description: 'Generates an image based on a prompt and saves it to the specified path.',
  input_schema: generateImageInputSchema,
  execute: async (args: z.infer<typeof generateImageInputSchema>) => { // skip_compression_and_resizing を追加
    try {
      const {
        prompt,
        output_directory,
        file_name,
        input_image_paths,
        use_enhanced_prompt,
        target_image_max_size,
        force_conversion_type,
        webp_quality,
        jpeg_quality,
        png_compression_level,
        optipng_optimization_level
      } = args;

      let imageParts: InlineDataPart[] = [];
      if (input_image_paths && input_image_paths.length > 0) {
        console.log(`Input image paths received: ${input_image_paths.join(', ')}`);
        imageParts = await Promise.all(
          input_image_paths.map(async (filePath) => {
            try {
              console.log(`Processing image file: ${filePath}`);
              const fileBuffer = await readFile(filePath);
              const base64Data = fileBuffer.toString('base64');
              const extension = path.extname(filePath).toLowerCase().substring(1);

              const mimeTypeMap: { [key: string]: string } = {
                'png': MIME_TYPES.PNG,
                'jpg': MIME_TYPES.JPEG,
                'jpeg': MIME_TYPES.JPEG,
                'webp': MIME_TYPES.WEBP,
              };

              const resolvedMimeType = mimeTypeMap[extension] || MIME_TYPES.OCTET_STREAM;
              
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
          
          const originalSizeKB = (imageBuffer.length / 1024).toFixed(2);

          let finalImageBuffer: Buffer;
          let finalExtension: typeof EXTENSIONS.JPG | typeof EXTENSIONS.PNG | typeof EXTENSIONS.WEBP;
          let processedSizeKB: string;
          let baseMessage: string; // Pathを含まないメッセージ部分

          if (args.skip_compression_and_resizing) {
            // 圧縮とリサイズをスキップする場合
            if (imageMimeType === MIME_TYPES.PNG) {
              finalExtension = EXTENSIONS.PNG;
            } else if (imageMimeType === MIME_TYPES.JPEG) {
              finalExtension = EXTENSIONS.JPG;
            } else if (imageMimeType === MIME_TYPES.WEBP) {
              finalExtension = EXTENSIONS.WEBP;
            } else {
              // 予期しないMIMEタイプの場合のフォールバック
              console.warn(`Unexpected image MIME type received: ${imageMimeType}. Defaulting to JPG extension.`);
              finalExtension = EXTENSIONS.JPG;
            }
            finalImageBuffer = imageBuffer; // 元のバッファをそのまま使用
            processedSizeKB = originalSizeKB; // サイズは変わらない
            baseMessage = `generated (uncompressed)`;
          } else {
            // 既存の圧縮・リサイズ処理
            const compressionOptions: CompressionOptions = {
              jpegQuality: jpeg_quality,
              webpQuality: webp_quality,
              pngCompressionLevel: png_compression_level,
              optipngOptimizationLevel: optipng_optimization_level,
            };
            const { processedBuffer, extension } = await processAndCompressImage(imageBuffer, meta.format, force_conversion_type, target_image_max_size, compressionOptions);
            finalImageBuffer = processedBuffer;
            finalExtension = extension;
            processedSizeKB = (finalImageBuffer.length / 1024).toFixed(2);

            baseMessage = `generated and compressed`;
            const originalFormat = meta.format === 'jpeg' ? 'jpeg' : 'png'; // Geminiが返すフォーマットを正規化
            // 元のフォーマットと強制変換のフォーマットが異なる場合のみメッセージを変更
            if (force_conversion_type && force_conversion_type !== originalFormat) {
              baseMessage = `converted to ${extension.toUpperCase()} and compressed`;
            }
          }
          const outputPath = await getUniqueFilePath(output_directory, file_name, finalExtension);
          await writeFile(outputPath, finalImageBuffer);
          return {
            content: [
              {
                type: "text",
                text: `Image successfully ${baseMessage} at ${outputPath}.\nOriginal size: ${originalSizeKB}KB, Final size: ${processedSizeKB}KB`
              }
            ]
          };
        } else {
          const detail = response.candidates[0]?.content?.parts?.map(p => p.text || p.inlineData?.mimeType || 'unknown_part').join(', ');
          throw new Error(`No valid image data found in the response. Received parts: [${detail || 'none'}]`);
        }
      } else {
        let errorMessage = 'Image generation failed. The response may be empty or in an unexpected format.';
        if (response.promptFeedback) { // promptFeedback is at the top level of the response
          errorMessage += `\n[Feedback] ${JSON.stringify(response.promptFeedback, null, 2)}`;
        }
        const candidate = response.candidates?.[0];
        if (candidate?.finishReason) {
          errorMessage += `\n[Finish Reason] ${candidate.finishReason}`;
        }
        if (candidate?.safetyRatings) {
          errorMessage += `\n[Safety Ratings] ${JSON.stringify(candidate.safetyRatings, null, 2)}`;
        }
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('画像生成エラー:', error);
      return {
        content: [{ type: "text", text: `An error occurred during image generation: ${error.message}` }]
      };
    }
  }
};