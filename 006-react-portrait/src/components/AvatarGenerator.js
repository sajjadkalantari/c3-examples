import React, { useState, useRef } from 'react';
import useAvatarGenerator from '../hooks/useAvatarGenerator';

const AvatarGenerator = ({ apiKey }) => {
  const [portraitImage, setPortraitImage] = useState(null);
  const [portraitPreviewUrl, setPortraitPreviewUrl] = useState(null);
  const [isPortraitUploaded, setIsPortraitUploaded] = useState(false);
  
  const [audioFile, setAudioFile] = useState(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState(null);
  const [isAudioUploaded, setIsAudioUploaded] = useState(false);
  
  const {
    generateAvatar,
    loading,
    error,
    progress,
    result,
    status
  } = useAvatarGenerator();
  
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);
  
  // Workflow JSON object that includes audio processing
  const workflowJson = {
    "1": {
      "class_type": "LoadImage",
      "inputs": {
        "image": "",
        "upload": "image"
      }
    },
    "2": {
      "class_type": "ImageScale",
      "inputs": {
        "image": ["1", 0],
        "width": 576,
        "height": 576,
        "upscale_method": "lanczos",
        "crop": "disabled"
      }
    },
    "3": {
      "class_type": "LoadAudio",
      "inputs": {
        "audio": "",
        "upload": "audio"
      }
    },
    "4": {
      "class_type": "VHS_SadTalker",
      "inputs": {
        "image": ["2", 0],
        "audio": ["3", 0],
        "preprocess": "none",
        "still_mode": true,
        "expression_scale": 1,
        "use_enhancer": false,
        "batch_size": 1,
        "result_fps": 25
      }
    },
    "5": {
      "class_type": "SaveImage",
      "inputs": {
        "images": ["4", 0],
        "filename_prefix": "talking_portrait_",
        "jpeg_quality": 95,
        "overwrite_mode": "overwrite"
      }
    }
  };

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
    
    if (!audioFile) {
      alert('Please upload an audio file');
      return;
    }
    
    if (!apiKey) {
      alert('Please enter your API key');
      return;
    }
    
    try {
      await generateAvatar(portraitImage, audioFile, workflowJson, apiKey);
    } catch (error) {
      console.error('Error generating avatar:', error);
    }
  };

  const resetForm = () => {
    setPortraitImage(null);
    setPortraitPreviewUrl(null);
    setIsPortraitUploaded(false);
    setAudioFile(null);
    setAudioPreviewUrl(null);
    setIsAudioUploaded(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  return (
    <div className="portrait-generator">
      <h2>Talking Portrait Generator</h2>
      <form onSubmit={onSubmit}>
        <div className="upload-section">
          <h3>Upload Your Portrait</h3>
          <input
            type="file"
            onChange={handlePortraitChange}
            accept="image/*"
            ref={fileInputRef}
            disabled={loading}
          />
          
          {portraitPreviewUrl && (
            <div className="preview">
              <img src={portraitPreviewUrl} alt="Portrait preview" />
            </div>
          )}
        </div>

        <div className="upload-section">
          <h3>Upload Your Audio</h3>
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
        
        <div className="action-buttons">
          <button 
            type="submit" 
            disabled={!isPortraitUploaded || !isAudioUploaded || loading || !apiKey}
            className="generate-btn"
          >
            Generate Talking Portrait
          </button>
          
          {(isPortraitUploaded || isAudioUploaded || result) && (
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
          <h3>Processing Your Talking Portrait</h3>
          <div className="progress-bar">
            <div 
              className="progress" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p>{status}</p>
        </div>
      )}
      
      {error && (
        <div className="error">
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      )}
      
      {result && (
        <div className="result">
          <h3>Your Talking Portrait</h3>
          <div className="result-image">
            <video 
              controls
              autoPlay
              loop
              src={`data:video/mp4;base64,${result.videoUrl}`} 
              alt="Generated talking portrait" 
            />
          </div>
          <a 
            href={`data:video/mp4;base64,${result.videoUrl}`} 
            download="talking_portrait.mp4"
            className="download-btn"
          >
            Download
          </a>
        </div>
      )}
    </div>
  );
};

export default AvatarGenerator; 