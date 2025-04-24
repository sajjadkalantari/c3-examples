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
    <div className="portrait-generator">
      <h2>ComfyUI Animation Generator</h2>
      
      <form onSubmit={onSubmit}>
        <div className="upload-section">
          <h3>Upload Your Image</h3>
          <input
            type="file"
            onChange={handlePortraitChange}
            accept="image/*"
            ref={fileInputRef}
            disabled={loading}
          />
          
          {portraitPreviewUrl && (
            <div className="preview">
              <img src={portraitPreviewUrl} alt="Image preview" />
            </div>
          )}
        </div>

        <div className="upload-section">
          <h3>Upload Audio {!useAdvancedWorkflow && "(Optional)"}</h3>
          <input
            type="file"
            onChange={handleAudioChange}
            accept="audio/*"
            ref={audioInputRef}
            disabled={loading}
          />
          
          {audioPreviewUrl && (
            <div className="preview">
              <audio controls src={audioPreviewUrl} />
            </div>
          )}
        </div>
        
        <div className="workflow-toggle">
          <label>
            <input
              type="checkbox"
              checked={useAdvancedWorkflow}
              onChange={e => setUseAdvancedWorkflow(e.target.checked)}
              disabled={loading}
            />
            Use Advanced Workflow (requires audio)
          </label>
        </div>
        
        <div className="action-buttons">
          <button 
            type="submit" 
            disabled={!isPortraitUploaded || (useAdvancedWorkflow && !isAudioUploaded) || loading || !apiKey}
            className="generate-btn"
          >
            {useAdvancedWorkflow ? "Generate Animation" : "Process Image"}
          </button>
          
          {(isPortraitUploaded || isAudioUploaded || showResult) && (
            <button 
              type="button" 
              onClick={resetForm} 
              disabled={loading}
              className="reset-btn"
            >
              Reset
            </button>
          )}
        </div>
      </form>
      
      {loading && (
        <div className="processing">
          <h3>Processing Your {useAdvancedWorkflow ? "Animation" : "Image"}</h3>
          <div className="progress-bar">
            <div 
              className="progress" 
              style={{ width: `${displayProgress}%` }}
            ></div>
          </div>
          <p className="status-message">{status}</p>
        </div>
      )}
      
      {error && (
        <div className="error">
          <h3>Error</h3>
          <p>{typeof error === 'object' ? JSON.stringify(error, null, 2) : error}</p>
        </div>
      )}
      
      {showResult && (
        <div className="result">
          <h3>Your {result.type === 'video' ? 'Animation' : 'Processed Image'}</h3>
          <div className="result-image">
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
          <div className="download-container">
            <a 
              href={result.directLink ? result.videoUrl : `data:${result.type === 'video' ? 'video/mp4' : 'image/png'};base64,${result.videoUrl}`} 
              download={result.type === 'video' ? "animation.mp4" : "processed_image.png"}
              className="download-btn"
              target={result.directLink ? "_blank" : "_self"}
            >
              {result.directLink ? "Open in New Tab" : "Download"}
            </a>
          </div>
        </div>
      )}
      
      {debugInfo && (
        <div className="debug-info">
          <h3>Debug Information</h3>
          <pre>{debugInfo}</pre>
          <p>Current status: {status}</p>
          <p>Progress: {progress}%</p>
          {hookDebugInfo && (
            <div className="hook-debug">
              <h4>Processing Details:</h4>
              <pre>{hookDebugInfo}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AvatarGenerator; 