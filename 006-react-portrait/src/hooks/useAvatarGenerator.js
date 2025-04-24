import { useState, useCallback } from 'react';
import Comput3API from '../services/comput3Api';
import ComfyUIClient from '../services/comfyuiClient';
import config from '../services/config';

const useAvatarGenerator = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, checking, uploading, processing, completed, error

  const generateAvatar = useCallback(async (portraitImage, audioFile, workflowJson, apiKey) => {
    if (!apiKey) {
      setError('API key is required');
      setStatus('error');
      return null;
    }

    try {
      setLoading(true);
      setStatus('checking');
      setProgress(0);
      setError(null);
      setResult(null);

      // Step 1: Initialize Comput3 API client
      const c3Client = new Comput3API(apiKey);
      
      // Step 2: Get ComfyUI URL from running instance
      const comfyuiUrl = await c3Client.getComfyuiUrl();
      if (!comfyuiUrl) {
        throw new Error('No running media instance found. Please launch a media instance first at https://launch.comput3.ai');
      }
      
      // Step 3: Initialize ComfyUI client
      const comfyClient = new ComfyUIClient(comfyuiUrl, apiKey);
      
      // Step 4: Upload files
      setStatus('uploading');
      setProgress(10);
      
      try {
        // Upload image
        const imageName = await comfyClient.uploadFile(portraitImage, 'input');
        if (!imageName) {
          throw new Error('Failed to upload image');
        }
        
        setProgress(20);
        
        // Upload audio
        const audioName = await comfyClient.uploadFile(audioFile, 'input');
        if (!audioName) {
          throw new Error('Failed to upload audio');
        }
        
        setProgress(30);
        
        // Step 5: Load and update workflow
        const workflow = await comfyClient.loadWorkflow(workflowJson);
        
        // Update workflow with image and audio
        const updatedWorkflow = JSON.parse(JSON.stringify(workflow));
        
        // Update nodes with the uploaded files
        for (const nodeId in updatedWorkflow) {
          const node = updatedWorkflow[nodeId];
          if (node.class_type === 'LoadImage') {
            node.inputs.image = imageName;
            console.log(`🖼️ Updated LoadImage node with image: ${imageName}`);
          }
          if (node.class_type === 'LoadAudio') {
            node.inputs.audio = audioName;
            console.log(`🔊 Updated LoadAudio node with audio: ${audioName}`);
          }
        }
        
        setProgress(40);
        
        // Step 6: Queue workflow
        const promptId = await comfyClient.queueWorkflow(updatedWorkflow);
        
        if (!promptId) {
          throw new Error('Failed to queue workflow');
        }
        
        setProgress(50);
        setStatus('processing');
        
        // Step 7: Wait for workflow to complete with progress updates
        const progressCallback = (result) => {
          if (result.status === 'processing') {
            // Calculate progress (adjust as needed based on expected node count)
            // This is a rough estimation that assumes the total progress from 50% to 90%
            const processingProgress = Math.min(40, 40 * (result.completedNodeCount / result.expectedNodeCount || 0.5));
            setProgress(50 + processingProgress);
          }
        };
        
        const completed = await comfyClient.waitForWorkflowCompletion(
          promptId, 
          config.DEFAULT_TIMEOUT_MINUTES,
          progressCallback
        );
        
        if (!completed) {
          throw new Error('Workflow processing failed or timed out');
        }
        
        setProgress(90);
        
        // Step 8: Get output files
        const outputFiles = await comfyClient.getOutputFiles(promptId);
        
        if (!outputFiles) {
          throw new Error('No output files found');
        }
        
        // Get the most recent video or image from outputs
        let resultUrl = null;
        let resultType = 'image';
        
        // First try to find a video file
        const videos = outputFiles.filter(f => f.type === 'video');
        if (videos.length > 0) {
          // Get the most recent video
          const latestVideo = videos[videos.length - 1];
          resultUrl = await comfyClient.downloadFile(latestVideo.url);
          resultType = 'video';
        }
        // If no video found, try to find an image
        else {
          const images = outputFiles.filter(f => f.type === 'image');
          if (images.length === 0) {
            throw new Error('No video or image found in output');
          }
          // Get the most recent image
          const latestImage = images[images.length - 1];
          resultUrl = await comfyClient.downloadFile(latestImage.url);
        }
        
        if (!resultUrl) {
          throw new Error('Failed to download result');
        }
        
        setResult({
          videoUrl: resultUrl,
          type: resultType
        });
        
        setProgress(100);
        setStatus('completed');
        return resultUrl;
        
      } catch (uploadError) {
        console.error('Error during file upload or processing:', uploadError);
        throw new Error(`CORS Error or processing error: Make sure the CORS proxy is running. Start the app with 'npm run dev' instead of 'npm start'. (${uploadError.message})`);
      }
      
    } catch (error) {
      console.error('Error generating avatar:', error);
      setError(error.message || 'Unknown error occurred');
      setStatus('error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    generateAvatar,
    loading,
    error,
    progress,
    result,
    status
  };
};

export default useAvatarGenerator; 