import React, { useState } from 'react';
import './App.css';
import AvatarGenerator from './components/AvatarGenerator';
import StoredApiKey from './components/StoredApiKey';

function App() {
  const [apiKey, setApiKey] = useState('');
  
  const handleApiKeyChange = (key) => {
    setApiKey(key);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">
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
  );
}

export default App;
