# 🎬 Image to Video Generator

Transform static images into dynamic videos using ComfyUI through the Comput3 platform. This tool implements the WanVideo Image-to-Video workflow to create short videos from still images with natural motion.

## ✅ Prerequisites

1. 🔑 A Comput3 account with API key (get it from [launch.comput3.ai](https://launch.comput3.ai))
2. 🐍 Python 3.7 or higher
3. 🖥️ A running media instance on Comput3 (media:fast type recommended)
4. 📦 ComfyUI with WanVideo nodes installed (already included in Comput3 media instances)

## 🚀 Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/comput3ai/c3-examples
   cd c3-examples/010-image-to-video-script
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Create a `.env` file with your Comput3 API key:
   ```bash
   echo "C3_API_KEY=your_c3_api_key_here" > .env
   ```

4. Create input directory for your files (if it doesn't exist):
   ```bash
   mkdir -p input output
   ```

5. Add the workflow template:
   ```bash
   # Create workflows directory if it doesn't exist
   mkdir -p workflows
   # Copy the provided workflow template to the workflows directory
   cp path/to/img2vid_workflow.json workflows/
   ```

## 📋 Usage

### 🖥️ Launching a Media Instance

Before using this tool, you need to have a media instance running on Comput3. You can launch one through:

1. The web interface at [launch.comput3.ai](https://launch.comput3.ai)
2. The c3-launcher CLI tool from [GitHub](https://github.com/comput3/c3-launcher)

### 🎭 Generating a Video from an Image

Once you have a media instance running, you can generate a video using:

```bash
python main.py --image /path/to/image.jpg
```

Options:
- `--image`, `-i`: 🖼️ Path to input image file (required)
- `--prompt`, `-p`: ✍️ Text prompt to guide video generation (default: "astronauts looking around a futuristic spaceship cockpit")
- `--negative-prompt`, `-n`: ❌ Negative text prompt to avoid unwanted elements
- `--output-dir`, `-o`: 📁 Directory to save output files (default: `./output`)
- `--timeout`, `-t`: ⏱️ Timeout in minutes (default: 15)
- `--verbose`, `-v`: 🔍 Enable verbose logging

### 💡 Examples

Basic usage:
```bash
python main.py -i input/landscape.jpg
```

With custom prompt:
```bash
python main.py -i input/portrait.jpg -p "a person walking through a forest"
```

With additional options:
```bash
python main.py -i input/car.jpg -p "a car driving on a coastal road" -n "static, blurry, low quality" -o ./my_videos -t 20
```

## 🛠️ Technical Details

### 🔧 Image to Video Process

The tool uses the WanVideo model from [Kijai/WanVideo_comfy](https://huggingface.co/Kijai/WanVideo_comfy/tree/main) to generate videos from still images. The process includes:

1. 📤 Uploading your image to ComfyUI
2. 🖼️ Processing the image dimensions to determine optimal processing size
3. 🔄 Updating the WanVideo workflow with your image and text prompts
4. 🚀 Executing the workflow which:
   - Encodes the image using a CLIP vision model
   - Processes it through the WanVideo model
   - Applies motion to create a natural-looking short video
   - Renders the final video using the VHS_VideoCombine node
5. 📥 Downloading the completed video to your output directory

### ⚙️ Workflow Components

The workflow includes:
- WanVideoModelLoader: Loads the WanVideo model with optional optimizations
- WanVideoVAELoader: Handles encoding/decoding between pixel space and latent space
- WanVideoTextEncode: Converts text prompts to embeddings using a T5 text encoder
- WanVideoClipVisionEncode: Encodes the input image using CLIP vision model
- WanVideoImageToVideoEncode: Prepares the image for video generation
- WanVideoSampler: The core component that generates the video frames
- WanVideoDecode: Converts the generated latents back to images
- VHS_VideoCombine: Combines the image frames into a final video file

## 📋 Requirements for Input Images

- **Formats**: JPG, PNG
- **Content**: Can be virtually any image, but clearer images with good lighting produce better results
- **Size**: Any size works, but the script will automatically resize to optimal dimensions for processing

## 🧩 Extending the Project

You can extend or customize this project in various ways:

1. **Custom Workflow Parameters**: Modify parameters like frame rate, video format, or quality in the workflow JSON file
2. **Additional Models**: Use different models by modifying the workflow template
3. **Prompt Engineering**: Experiment with different prompts to achieve specific styles and motions
4. **Batch Processing**: Extend the script to process multiple images in a folder

## ❓ Troubleshooting

If you encounter issues:

1. **🔴 No running media instance found**
   - Launch a media instance on Comput3 before running the script
   - Make sure to use a "media:fast" instance type

2. **🔴 VRAM or memory issues**
   - If you see out-of-memory errors, the model is likely running out of VRAM
   - Consider using a larger instance type on Comput3
   - Reduce the dimensions of the output video in the workflow

3. **⏰ Workflow timeout**
   - Try increasing the timeout with `--timeout 30`
   - Large images or complex scenes may take longer to process

4. **🔑 API key issues**
   - Ensure your C3_API_KEY is correctly set in the .env file
   - Check that your account has access to the media service

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details. 