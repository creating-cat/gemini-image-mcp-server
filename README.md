[日本語版はこちら (Read in Japanese)](./README.ja.md)

# Gemini Image MCP Server

This is an MCP (Model Context Protocol) server that uses Google's Gemini API to generate images and save them to a specified directory.
In addition to text prompts, you can optionally provide input images to guide the image generation process.
Generated images are automatically compressed to reduce file size.

---

## Features

* Image generation from text prompts
* (Optional) Image generation using input reference images
* Automatic compression of generated images (JPEG, PNG)
* Unique file name assignment to prevent file name conflicts
* Operates as an MCP server, accepting tool calls via standard input/output

---

## Prerequisites

* Node.js (v18 or higher recommended)
* Google Cloud Project with Gemini API enabled
* Gemini API Key

---

## Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/creating-cat/gemini-image-mcp-server.git
   cd gemini-image-mcp-server
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Build the code:**

   ```bash
   npm run build
   ```

### Example MCP server configuration for Roo Code

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

* Replace `YOUR_GEMINI_API_KEY` with your actual Gemini API Key.

  * You can also use `${env:GEMINI_API_KEY}` to retrieve the key from environment variables (Roo Code feature).

---

## Tool: `generate_image`

This MCP server provides a tool named `generate_image`.

### Input Parameters

| Parameter Name                  | Description                                                                                                                                                                          | Default Value      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `prompt`                        | (string, required) Text prompt for image generation. If input images are provided, include instructions on how to incorporate them into the generated image. English is recommended. | None               |
| `output_directory`              | (string, optional) Directory path where the generated image will be saved.                                                                                                           | `output/images`    |
| `file_name`                     | (string, optional) Name of the saved image file (without extension).                                                                                                                 | `generated_image`  |
| `input_image_paths`             | (string\[], optional) List of file paths for input reference images.                                                                                                                 | `[]` (empty array) |
| `use_enhanced_prompt`           | (boolean, optional) Whether to use enhanced prompts to assist AI instructions.                                                                                                       | `true`             |
| `target_image_max_size`         | (number, optional) Maximum size (in pixels) for the longer edge after resizing. The aspect ratio is preserved.                                                                       | `512`              |
| `force_conversion_type`         | (string, optional) Optionally force conversion to a specific format ('jpeg', 'webp', 'png'). If not specified, the original format will be processed, defaulting to PNG for non-JPEG images. | None               |
| `skip_compression_and_resizing` | (boolean, optional) Whether to skip compression and resizing of generated images. If `true`, `force_conversion_type` and `target_image_max_size` will be ignored.                    | `false`            |
| `jpeg_quality`                  | (number, optional) JPEG quality (0-100). Lower values result in higher compression.                                                                                                  | `80`               |
| `webp_quality`                  | (number, optional) WebP quality (0-100). Lower values result in higher compression.                                                                                                  | `80`               |
| `png_compression_level`         | (number, optional) PNG compression level (0-9). Higher values result in higher compression.                                                                                          | `9`                |
| `optipng_optimization_level`    | (number, optional) OptiPNG optimization level (0-7). Higher values result in higher compression.                                                                                     | `2`                |

### Output

On success, the server returns the save path of the generated image and a message detailing the process, including the original and compressed file sizes.
Example:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Image successfully generated and compressed at output/images/my_cat.jpg.\nOriginal size: 1024.12KB, Final size: 150.45KB"
    }
  ]
}
```

If an error occurs, an error message will be returned.

---

## Notes

* The MIME type and aspect ratio of the generated images depend on the default settings of the Gemini API.
* Handle your API key with care.
* This server uses the model `gemini-2.0-flash-preview-image-generation`. Google may discontinue this model in the future.

---

## License

MIT
