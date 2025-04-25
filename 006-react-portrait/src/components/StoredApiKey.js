import React, { useState, useEffect } from 'react';

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
    <div className="mb-5 p-4 rounded-lg bg-gray-50 shadow-sm">
      <label htmlFor="api-key" className="block mb-2 font-medium text-gray-700">
        C3 API Key:
      </label>
      <input
        id="api-key"
        type="password"
        className="w-full p-2.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
        value={apiKey}
        onChange={handleChange}
        placeholder="Enter your Comput3 API key"
      />
      {!apiKey && (
        <p className="mt-2 text-sm text-red-600">
          Please enter your API key to use the application
        </p>
      )}
    </div>
  );
};

export default StoredApiKey; 