# React Portrait Generator

A React-based web application that uses ComfyUI and Comput3 API to process and generate images, text-to-speech, speech-to-text, and text-to-image content.

## Features

- **Portrait Generation**: Transform your photos into animations using ComfyUI
- **Text-to-Image Generation**: Create images from text descriptions using AI
- **CSM Text-to-Speech**: Convert text to natural-sounding speech
- **WHISPER Speech-to-Text**: Transcribe audio to text with multilingual support

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Comput3 API key (get one from [https://launch.comput3.ai](https://launch.comput3.ai))
- A running Comput3 media instance

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory based on the `env.example` file:
   ```
   REACT_APP_C3_API_KEY=your_comput3_api_key
   ```
4. Start the development server:
   ```
   npm run dev
   ```

## Text-to-Image Generation

Our Text-to-Image feature allows you to generate images from text descriptions using the power of ComfyUI through the Comput3 API.

### How to use

1. Navigate to the Text-to-Image page
2. Enter your Comput3 API key if prompted
3. Write a detailed prompt describing the image you want to generate
4. Optionally, customize:
   - Negative prompt (things you don't want in the image)
   - Image dimensions
   - Sampling steps
   - Random seed (for reproducibility)
5. Click "Generate Image" and wait for the AI to create your image
6. View and save the generated image

### Examples

Try these prompts for interesting results:

- "A serene mountain landscape with a lake at sunset, realistic photography"
- "A futuristic cityscape with flying cars and neon lights, digital art style"
- "A portrait of a fantasy character with glowing eyes and ornate armor, detailed illustration"

## Architecture

The application uses:

- React for the frontend
- React Router for navigation
- Tailwind CSS for styling
- Axios for API requests
- ComfyUI for image processing
- Comput3 API for accessing AI capabilities

## Workflow Files

The application uses JSON workflow files to define the processing steps:

- `avatar_generator.json`: Workflow for portrait processing
- `text_to_image.json`: Workflow for text-to-image generation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
- [Comput3](https://comput3.ai)
- [Stable Diffusion](https://github.com/CompVis/stable-diffusion)
