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
  
  // Super basic workflow JSON object with only core ComfyUI nodes
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
      "class_type": "SaveImage",
      "inputs": {
        "images": ["2", 0],
        "filename_prefix": "portrait_",
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
    
    // Since we're only processing images for now, audio is optional
    // if (!audioFile) {
    //   alert('Please upload an audio file');
    //   return;
    // }
    
    if (!apiKey) {
      alert('Please enter your API key');
      return;
    }
    
    try {
      // For now, we're just passing the image
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
      <h2>ComfyUI Image Processor</h2>
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
          <h3>Upload Audio (Optional)</h3>
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
            disabled={!isPortraitUploaded || loading || !apiKey}
            className="generate-btn"
          >
            Process Image
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
          <h3>Processing Your Image</h3>
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
          <h3>Your Processed Image</h3>
          <div className="result-image">
            {result.type === 'video' ? (
              <video 
                controls
                autoPlay
                loop
                src={`data:video/mp4;base64,${result.videoUrl}`} 
                alt="Generated video" 
              />
            ) : (
              <img 
                src={`data:image/jpeg;base64,${result.videoUrl}`} 
                alt="Processed image" 
              />
            )}
          </div>
          <a 
            href={`data:${result.type === 'video' ? 'video/mp4' : 'image/jpeg'};base64,${result.videoUrl}`} 
            download={result.type === 'video' ? "processed_video.mp4" : "processed_image.jpg"}
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