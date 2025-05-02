# 🎨 Comput3 Image-to-Image Generator

Transform images using text prompts with ComfyUI through the Comput3 platform. This tool takes an input image and text prompts to generate variations based on your descriptions.

## ✅ Prerequisites

1. 🔑 A Comput3 account with API key (get it from [launch.comput3.ai](https://launch.comput3.ai))
2. 🐍 Python 3.7 or higher
3. 🖥️ A running media instance on Comput3 (media:fast type recommended)

## 🚀 Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/comput3ai/c3-examples.git
   cd c3-examples/009-image-to-image-script
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Create a `.env` file with your Comput3 API key:
   ```bash
   echo "C3_API_KEY=your_c3_api_key_here" > .env
   ```
   
   Your `.env` file should contain:
   ```
   C3_API_KEY=your_c3_api_key_here
   ```

4. Create input and output directories (if they don't exist):
   ```bash
   mkdir -p input output
   ```

5. Add a workflow template for image-to-image generation:
   ```bash
   mkdir -p workflows
   # Add your img2img_generator.json workflow file to the workflows directory
   ```

## 📋 Usage

### 🖥️ Launching a Media Instance

Before using this tool, you need to have a media instance running on Comput3. You can launch one through:

1. The web interface at [launch.comput3.ai](https://launch.comput3.ai)
2. The c3-launcher CLI tool from [GitHub](https://github.com/comput3/c3-launcher)

### 🎭 Transforming an Image

Once you have a media instance running, you can transform an image using:

```bash
python main.py --image /path/to/input.jpg --prompt "your detailed description here"
```

Options:
- `--image`, `-i`: 🖼️ Path to input image file (required)
- `--prompt`, `-p`: ✍️ Positive prompt for image generation (required)
- `--negative-prompt`, `-n`: ❌ Negative prompt for what to avoid (optional)
- `--strength`, `-s`: 🎛️ Transformation strength (0.0-1.0, higher = more change, default: 0.75)
- `--output-dir`, `-o`: 📁 Directory to save output files (default: `./output`)
- `--timeout`, `-t`: ⏱️ Timeout in minutes (default: 15)
- `--verbose`, `-v`: 🔍 Enable verbose logging

### 💡 Examples

Basic image transformation:
```bash
python main.py -i input/photo.jpg -p "a fantasy landscape with vibrant colors, magical atmosphere"
```

With negative prompt and custom strength:
```bash
python main.py -i input/portrait.jpg -p "professional headshot, high quality" -n "blurry, distorted, low quality" -s 0.5
```

Artistic style transfer:
```bash
python main.py -i input/city.jpg -p "in the style of Van Gogh, oil painting" -s 0.85
```

## 📁 Project Structure

The project follows a modular structure:

```
009-image-to-image-script/
├── config.py              # Configuration and environment variables
├── comput3_api.py         # API client for Comput3
├── comfyui_client.py      # ComfyUI client for workflow execution
├── main.py                # Main script entry point
├── workflows/             # ComfyUI workflow templates
│   └── img2img_generator.json  # The img2img workflow template
├── input/                 # Directory for input files
├── output/                # Generated images will be saved here
├── README.md              # This documentation
└── requirements.txt       # Python dependencies
```

### 🔧 Key Components

- **main.py**: Entry point script that orchestrates the entire process
- **comput3_api.py**: Handles communication with the Comput3 API
- **comfyui_client.py**: Manages interaction with the ComfyUI instance
- **config.py**: Loads environment variables and default configuration
- **workflows/img2img_generator.json**: The ComfyUI workflow template for image-to-image transformation

## ⚙️ How It Works

1. 🔍 The script checks if you have a running media instance on Comput3
2. 📤 It uploads your input image to the ComfyUI server
3. 🔄 It loads and updates the workflow template with your inputs:
   - 🖼️ Sets the input image
   - ✍️ Updates the positive and negative prompts
   - 🎛️ Sets the transformation strength (denoising strength in img2img)
   - 📐 Passes through the original image dimensions
4. 🚀 It queues the workflow for execution and monitors progress
5. 📥 Once complete, it downloads the generated images to the output directory

## 📝 Requirements for Input Files

### 🖼️ Input Image
- Can be any common image format (JPG, PNG, etc.)
- Will be processed according to the workflow template
- Image dimensions are preserved in the workflow

### ✍️ Prompts
- **Positive Prompt**: Describes what you want to see in the generated image
- **Negative Prompt**: Describes what you want to avoid in the generated image

## 🔧 Transformation Strength

The `--strength` parameter (0.0-1.0) controls how much to modify the original image:
- **Low values (0.1-0.3)**: Subtle changes, preserves most of the original image
- **Medium values (0.4-0.7)**: Balanced transformation, recognizable but stylized
- **High values (0.8-1.0)**: Dramatic changes, might significantly alter the original image

## ❓ Troubleshooting

If you encounter issues:

1. **🔴 No running media instance found**
   - Launch a media instance on Comput3 before running the script
   - Make sure to use a "media:fast" instance type

2. **🔴 Workflow template not found**
   - Ensure you have created the `workflows` directory
   - Add your `img2img_generator.json` workflow file to the `workflows` directory

3. **🔴 Failed to process image**
   - Ensure your image is in a common format (JPG, PNG)
   - The image might be too large; try resizing it

4. **⏰ Workflow timeout**
   - Try increasing the timeout with `--timeout 30`
   - Check if your media instance is still running

5. **🔑 API key issues**
   - Ensure your C3_API_KEY is correctly set in the .env file
   - The API key should start with "c3_api_"
   - Check that your account has access to the ComfyUI service

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details. 