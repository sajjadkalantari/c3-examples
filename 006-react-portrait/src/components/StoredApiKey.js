import React, { useState, useEffect } from 'react';
import './StoredApiKey.css';

const StoredApiKey = ({ onChange }) => {
  const [apiKey, setApiKey] = useState('');
  const LOCAL_STORAGE_KEY = 'comfyui_api_key';

  // Load API key from localStorage on component mount
  useEffect(() => {
    const storedKey = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedKey) {
      setApiKey(storedKey);
      onChange(storedKey);
    }
  }, [onChange]);

  const handleChange = (e) => {
    const newKey = e.target.value;
    setApiKey(newKey);
    localStorage.setItem(LOCAL_STORAGE_KEY, newKey);
    onChange(newKey);
  };

  return (
    <div className="api-key-container">
      <label htmlFor="api-key" className="api-key-label">
        C3 API Key:
      </label>
      <input
        id="api-key"
        type="password"
        className="api-key-input"
        value={apiKey}
        onChange={handleChange}
        placeholder="Enter your Comput3 API key"
      />
      {!apiKey && (
        <p className="api-key-message">
          Please enter your API key to use the application
        </p>
      )}
    </div>
  );
};

export default StoredApiKey; 