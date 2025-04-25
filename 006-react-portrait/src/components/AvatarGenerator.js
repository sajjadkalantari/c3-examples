import React, { useState, useRef } from 'react';
import useAvatarGenerator from '../hooks/useAvatarGenerator';
import { loadWorkflow } from '../utils/loadWorkflow';

const AvatarGenerator = ({ apiKey }) => {
  const [portraitImage, setPortraitImage] = useState(null);
  const [portraitPreviewUrl, setPortraitPreviewUrl] = useState(null);
  const [isPortraitUploaded, setIsPortraitUploaded] = useState(false);
  
  const [audioFile, setAudioFile] = useState(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null);
  const [isAudioUploaded, setIsAudioUploaded] = useState(false);
  
  const [useAdvancedWorkflow, setUseAdvancedWorkflow] = useState(true);
  const [debugInfo, setDebugInfo] = useState('');
  
  const {
    generateAvatar,
    loading,
    error,
    progress,
    result,
    status,
    debugInfo: hookDebugInfo
  } = useAvatarGenerator();
  
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);

  const handlePortraitChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPortraitImage(file);
      const imageUrl = URL.createObjectURL(file);
      setPortraitPreviewUrl(imageUrl);
      setIsPortraitUploaded(true);
    }
  };

  const handleAudioChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAudioFile(file);
      const audioUrl = URL.createObjectURL(file);
      setAudioPreviewUrl(audioUrl);
      setIsAudioUploaded(true);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    
    if (!portraitImage) {
      alert('Please upload a portrait image');
      return;
    }
    
    if (useAdvancedWorkflow && !audioFile) {
      alert('Please upload an audio file for the advanced workflow');
      return;
    }
    
    if (!apiKey) {
      alert('Please enter your API key');
      return;
    }
    
    setDebugInfo('Processing started...');
    
    try {
      // Load the appropriate workflow
      const workflow = loadWorkflow(useAdvancedWorkflow);
      setDebugInfo(prev => prev + `\nUsing ${useAdvancedWorkflow ? 'advanced' : 'simple'} workflow`);
      
      // Generate the avatar
      const result = await generateAvatar(portraitImage, audioFile, workflow, apiKey);
      setDebugInfo(prev => prev + '\nProcessing completed successfully.');
    } catch (error) {
      console.error('Error generating avatar:', error);
      setDebugInfo(prev => prev + '\nError: ' + error.message);
    }
  };

  const resetForm = () => {
    setPortraitImage(null);
    setPortraitPreviewUrl(null);
    setIsPortraitUploaded(false);
    setAudioFile(null);
    setAudioPreviewUrl(null);
    setIsAudioUploaded(false);
    setDebugInfo('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  // Calculate the actual progress to show
  const displayProgress = loading ? progress : 0;

  // Determine if we should show the result
  const showResult = result && result.videoUrl;

  return (
    <div className="mt-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-5">ComfyUI Animation Generator</h2>
      
      <form onSubmit={onSubmit}>
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-medium text-gray-700 mb-3">Upload Your Image</h3>
          <input
            type="file"
            onChange={handlePortraitChange}
            accept="image/*"
            ref={fileInputRef}
            disabled={loading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0 file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          
          {portraitPreviewUrl && (
            <div className="mt-4 text-center">
              <img src={portraitPreviewUrl} alt="Image preview" className="max-h-[300px] mx-auto rounded" />
            </div>
          )}
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-medium text-gray-700 mb-3">Upload Audio {!useAdvancedWorkflow && "(Optional)"}</h3>
          <input
            type="file"
            onChange={handleAudioChange}
            accept="audio/*"
            ref={audioInputRef}
            disabled={loading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0 file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          
          {audioPreviewUrl && (
            <div className="mt-4 text-center">
              <audio controls src={audioPreviewUrl} className="w-full" />
            </div>
          )}
        </div>
        
        <div className="mb-6 flex items-center">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={useAdvancedWorkflow}
              onChange={e => setUseAdvancedWorkflow(e.target.checked)}
              disabled={loading}
              className="sr-only peer"
            />
            <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="ms-3 text-sm font-medium text-gray-700">Use Advanced Workflow (requires audio)</span>
          </label>
        </div>
        
        <div className="flex gap-3 mb-8">
          <button 
            type="submit" 
            disabled={!isPortraitUploaded || (useAdvancedWorkflow && !isAudioUploaded) || loading || !apiKey}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {useAdvancedWorkflow ? "Generate Animation" : "Process Image"}
          </button>
          
          {(isPortraitUploaded || isAudioUploaded || showResult) && (
            <button 
              type="button" 
              onClick={resetForm} 
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Reset
            </button>
          )}
        </div>
      </form>
      
      {loading && (
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-medium text-gray-700 mb-3">Processing Your {useAdvancedWorkflow ? "Animation" : "Image"}</h3>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${displayProgress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600">{status}</p>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6">
          <h3 className="text-lg font-medium mb-2">Error</h3>
          <p>{typeof error === 'object' ? JSON.stringify(error, null, 2) : error}</p>
        </div>
      )}
      
      {showResult && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-medium text-gray-700 mb-3">Your {result.type === 'video' ? 'Animation' : 'Processed Image'}</h3>
          <div className="flex justify-center">
            {result.type === 'video' ? (
              result.directLink ? (
                <video 
                  controls
                  autoPlay
                  loop
                  src={result.videoUrl} 
                />
              ) : (
                <video 
                  controls
                  autoPlay
                  loop
                  src={`data:video/mp4;base64,${result.videoUrl}`} 
                />
              )
            ) : (
              <img 
                src={result.directLink ? result.videoUrl : `data:image/png;base64,${result.videoUrl}`} 
                alt="Processed image" 
              />
            )}
          </div>
          
          {result.downloadUrl && (
            <div className="flex justify-center mt-4">
              <a 
                href={result.downloadUrl} 
                download
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors inline-flex items-center"
              >
                Download {result.type === 'video' ? 'Video' : 'Image'}
              </a>
            </div>
          )}
        </div>
      )}
      
      {(debugInfo || hookDebugInfo) && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-medium text-gray-700 mb-3">Debug Information</h3>
          <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
            {debugInfo}
            {hookDebugInfo && (
              <>
                {debugInfo && <hr className="my-2 border-gray-300" />}
                {hookDebugInfo}
              </>
            )}
          </pre>
        </div>
      )}
    </div>
  );
};

export default AvatarGenerator; 