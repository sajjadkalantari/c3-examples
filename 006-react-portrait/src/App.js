import React, { useState } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AvatarGenerator from './components/AvatarGenerator';
import StoredApiKey from './components/StoredApiKey';
import LandingPage from './components/LandingPage';
import Navbar from './components/Navbar';
import BackButton from './components/BackButton';
import CSMGenerator from './components/CSMGenerator';
import WhisperTranscriber from './components/WhisperTranscriber';
import TextToImageGenerator from './components/TextToImageGenerator';

function App() {
  const [apiKey, setApiKey] = useState('');
  
  const handleApiKeyChange = (key) => {
    setApiKey(key);
  };

  const PortraitPage = () => (
    <div className="bg-gray-100 min-h-screen">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-5 pt-16">
        <BackButton />
        <main className="py-5">
          <div className="bg-white rounded-lg shadow-md p-6">
            <StoredApiKey onChange={handleApiKeyChange} />
            <div className="text-center mb-8 pb-5 border-b border-gray-200">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">ComfyUI Image Processor</h1>
              <p className="text-gray-600 text-lg">Upload an image and process it using ComfyUI</p>
            </div>
            <AvatarGenerator apiKey={apiKey} />
          </div>
        </main>
      </div>
    </div>
  );

  const CSMPage = () => (
    <div className="bg-gray-100 min-h-screen">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-5 pt-16">
        <BackButton />
        <main className="py-5">
          <CSMGenerator />
        </main>
      </div>
    </div>
  );

  const WhisperPage = () => (
    <div className="bg-gray-100 min-h-screen">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-5 pt-16">
        <BackButton />
        <main className="py-5">
          <WhisperTranscriber />
        </main>
      </div>
    </div>
  );

  const TextToImagePage = () => (
    <div className="bg-gray-100 min-h-screen">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-5 pt-16">
        <BackButton />
        <main className="py-5">
          <div className="bg-white rounded-lg shadow-md p-6">
            <StoredApiKey onChange={handleApiKeyChange} />
            <div className="text-center mb-8 pb-5 border-b border-gray-200">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">Text to Image Generator</h1>
              <p className="text-gray-600 text-lg">Generate images from text prompts using ComfyUI</p>
            </div>
            <TextToImageGenerator apiKey={apiKey} />
          </div>
        </main>
      </div>
    </div>
  );

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/portrait" element={<PortraitPage />} />
        <Route path="/csm" element={<CSMPage />} />
        <Route path="/whisper" element={<WhisperPage />} />
        <Route path="/text-to-image" element={<TextToImagePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
