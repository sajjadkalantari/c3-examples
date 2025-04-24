# ComfyUI Talking Portrait Generator

This React application allows users to upload a portrait image and an audio file to create a talking portrait video using ComfyUI through the Comput3 API.

## Features

- API key storage in localStorage
- Image and audio upload with previews
- Talking portrait generation using ComfyUI's SadTalker
- Progress tracking
- Result display and download

## Getting Started

### Prerequisites

- Node.js and npm installed
- A Comput3 API key (get one from [https://launch.comput3.ai](https://launch.comput3.ai))
- A running ComfyUI instance through Comput3 with SadTalker installed

### Installation

1. Clone the repository
2. Navigate to the project directory
3. Install dependencies:

```bash
npm install
```

### Running the Application

Start the development server with:

```bash
npm run dev
```

This will start both the React application and the CORS proxy needed for API communication.

## Usage

1. Enter your Comput3 API key in the API Key field
2. Upload a portrait image (preferably a clear face photo)
3. Upload an audio file (MP3, WAV)
4. Click "Generate Talking Portrait"
5. Wait for the processing to complete
6. View and download the result

## Components

- **StoredApiKey**: Manages the storage and retrieval of the ComfyUI API key
- **AvatarGenerator**: Handles image and audio upload, processing, and result display
- **App**: Main application component that connects everything together

## Technical Implementation

The application uses:
- React hooks for state management
- localStorage for API key persistence
- Axios for API communication
- A CORS proxy for cross-origin requests
- SadTalker for animating the portrait based on audio

## Important Notes

- The API key is stored in the browser's localStorage, which persists between sessions
- A CORS proxy is required for development to avoid cross-origin issues
- The application needs to be started with `npm run dev` to run both the React app and the CORS proxy
- Make sure your ComfyUI instance has SadTalker installed
