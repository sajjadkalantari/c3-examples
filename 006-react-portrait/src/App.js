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
    <div className="app-container">
      <main className="main-content">
        <div className="content-wrapper">
          <StoredApiKey onChange={handleApiKeyChange} />
          <div className="app-title">
            <h1>Talking Portrait Generator</h1>
            <p>Upload a portrait image and an audio file to create a talking portrait using ComfyUI</p>
          </div>
          <AvatarGenerator apiKey={apiKey} />
        </div>
      </main>
    </div>
  );
}

export default App;
