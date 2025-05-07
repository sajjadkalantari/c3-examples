# 🎨 Comput3 Text-to-Image Generator

Generate high-quality images from text prompts using ComfyUI through the Comput3 platform.
Improved with robust image downloading, caching, and authentication similar to the React web app.

## ✅ Prerequisites

1. 🔑 A Comput3 account with API key (get it from [launch.comput3.ai](https://launch.comput3.ai))
2. 🐍 Python 3.7 or higher
3. 🖥️ A running media instance on Comput3 (media:fast type recommended)

## 🚀 Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/comput3ai/c3-examples/c3-text-to-image-script.git
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Create a `.env` file with your Comput3 API key:
   ```bash
   cp .env.example .env
   # Edit the .env file and add your API key
   ```
   
   Your `.env` file should contain:
   ```
   C3_API_KEY=your_c3_api_key_here
   ```

4. Create output directory for images (if it doesn't exist):
   ```bash
   mkdir -p output
   ```

## 📋 Usage

### 🖥️ Launching a Media Instance

Before using this tool, you need to have a media instance running on Comput3. You can launch one through:

1. The web interface at [launch.comput3.ai](https://launch.comput3.ai)
2. The c3-launcher CLI tool from [GitHub](https://github.com/comput3/c3-launcher)

### 🎭 Generating an Image

Once you have a media instance running, you can generate an image using:

```bash
python main.py --prompt "Your detailed text description here"
```

Options:
- `--prompt`, `-p`: 📝 Positive text prompt describing what you want in the image (required)
- `--negative-prompt`, `-n`: ❌ Negative text prompt describing what you don't want (default: "blurry, low quality, distorted, deformed")
- `--width`, `-W`: 📏 Width of the generated image (default: 1024)
- `--height`, `-H`: 📏 Height of the generated image (default: 1024)
- `--steps`, `-s`: 🔄 Number of sampling steps (default: 35)
- `--seed`: 🎲 Random seed for reproducible results (default: random)
- `--output-dir`, `-o`: 📁 Directory to save output files (default: `./output`)
- `--timeout`, `-t`: ⏱️ Timeout in minutes (default: 15)
- `--cache`: 🗄️ Enable image caching for better reliability (recommended)
- `--cache-dir`: 📂 Directory to store cached images (default: `./cache`)
- `--verbose`, `-v`: 🔍 Enable verbose logging

### 💪 New Features & Improvements

This script has been significantly enhanced with features from the React web app:

1. **🔐 Robust Authentication**: Uses a two-step approach for authentication when downloading images, similar to the React app
2. **🗄️ Image Caching**: Can store images as base64 for reliable access even with network issues
3. **🌉 Multiple Download Methods**: Tries several approaches to download images for maximum reliability
4. **📊 Live Status Updates**: Shows real-time progress during image generation
5. **🏷️ Direct URLs**: Provides direct image URLs that can be used externally (with authentication)
6. **⚠️ Error Handling**: Improved error handling and recovery mechanisms
7. **🔍 Validation**: Workflow validation to catch issues early

### 💡 Examples

Generate an image of a fantasy landscape:
```bash
python main.py --prompt "A mystical floating island with waterfalls, lush vegetation, and a small castle, fantasy art style with dramatic lighting"
```

Generate a portrait with custom dimensions:
```bash
python main.py --prompt "Portrait of a young woman with flowers in her hair, digital art style" --width 768 --height 1024
```

Use a specific seed for reproducible results with caching enabled:
```bash
python main.py --prompt "A cyberpunk cityscape at night with neon lights and flying cars" --seed 42 --cache
```

## 📁 Project Structure

The project follows a modular structure that makes it easy to understand and modify:

```
text-to-image-generator/
├── config.py              # Configuration and environment variables
├── comput3_api.py         # API client for Comput3
├── comfyui_client.py      # Enhanced ComfyUI client for workflow execution
├── main.py                # Main script entry point
├── workflows/             # ComfyUI workflow templates
│   └── text_to_image.json # Workflow template for text-to-image generation
├── output/                # Generated images will be saved here
├── cache/                 # Cached images for reliability (optional)
├── .env                   # Your API key (not committed to Git)
├── README.md              # This documentation
└── requirements.txt       # Python dependencies
```

### 🔧 Key Components

- **main.py**: Entry point script with enhanced image handling
- **comput3_api.py**: Handles communication with the Comput3 API
- **comfyui_client.py**: Enhanced client with robust image downloading and authentication
- **config.py**: Loads environment variables and default configuration
- **workflows/text_to_image.json**: The ComfyUI workflow template

## ⚙️ How It Works

1. 🔍 The script checks if you have a running media instance on Comput3
2. 📋 It loads and validates the text-to-image workflow template
3. 🔄 It updates the workflow with your prompts and parameters
4. 🚀 It queues the workflow for execution and monitors progress with live updates
5. 📥 Once complete, it uses a robust multi-step approach to download the image:
   - First tries the two-step authentication approach like in the React app
   - Falls back to alternative URL formats if needed
   - Optionally caches images as base64 for reliability
6. 🗄️ If downloading fails but caching was enabled, it retrieves the cached version

## 📝 Tips for Better Results

1. **Detailed Prompts**: The more detailed your prompt, the better the results. Include:
   - Subject description (what/who is in the image)
   - Setting (where the subject is)
   - Style (artistic style, medium, etc.)
   - Lighting, mood, and atmosphere

2. **Negative Prompts**: Use negative prompts to avoid unwanted elements:
   - Quality issues: "blurry, pixelated, low quality, distorted"
   - Unwanted elements: "text, watermark, signature, deformed limbs"

3. **Experiment with Settings**:
   - More steps (35-50) generally produce better quality but take longer
   - Try different dimensions depending on your needs (portrait vs. landscape)
   - Use a specific seed if you find a good result and want to make minor variations

4. **Enable Caching**: Using the `--cache` option is recommended for reliability:
   - Allows recovery of images even if network issues occur
   - Makes subsequent generations more robust
   - Provides a fallback if the Comput3 instance becomes unavailable

## ❓ Troubleshooting

If you encounter issues:

1. **🔴 No running media instance found**
   - Launch a media instance on Comput3 before running the script
   - Make sure to use a "media:fast" instance type

2. **⏰ Workflow timeout**
   - Try increasing the timeout with `--timeout 30`
   - Check if your media instance is still running

3. **🔑 API key issues**
   - Ensure your C3_API_KEY is correctly set in the .env file
   - The API key should start with "c3_api_"
   - Check that your account has access to the ComfyUI service

4. **❌ Image download failures**
   - Enable caching with `--cache` for better reliability
   - The script will try multiple methods to download the image
   - If all download attempts fail but caching was enabled, the script will try to use the cached version

## 🚀 Under the Hood

This script incorporates the same robust image handling techniques used in the React web app:

1. **Two-Step Image Loading**: Establishes authentication before downloading
2. **Cookie-Based Authentication**: Sets the API key as a cookie for authenticated requests
3. **Multiple URL Formats**: Tries different URL formats for maximum compatibility
4. **Base64 Caching**: Stores images as base64 encoded strings for reliability
5. **Progressive Backoff**: Uses adaptive waiting between status checks

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details. 