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

  // Convert a Blob to Base64
  const blobToBase64 = async (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Get the data part after the comma
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

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
        
        // Upload audio if provided
        let audioName = null;
        if (audioFile) {
          audioName = await comfyClient.uploadFile(audioFile, 'input');
          if (!audioName) {
            throw new Error('Failed to upload audio');
          }
        }
        
        setProgress(30);
        
        // Step 5: Load and update workflow
        const workflow = await comfyClient.loadWorkflow(workflowJson);
        console.log("workflow", workflow);
        
        // Update workflow with image and audio
        const updatedWorkflow = JSON.parse(JSON.stringify(workflow));
        
        // Update nodes with the uploaded files
        for (const nodeId in updatedWorkflow) {
          const node = updatedWorkflow[nodeId];
          if (node.class_type === 'LoadImage') {
            node.inputs.image = imageName;
            console.log(`Updated LoadImage node with image: ${imageName}`);
          }
          if (node.class_type === 'LoadAudio' && audioName) {
            node.inputs.audio = audioName;
            console.log(`Updated LoadAudio node with audio: ${audioName}`);
          }
        }
        
        setProgress(40);
        
        // Step 6: Queue workflow
        const promptId = await comfyClient.queueWorkflow(updatedWorkflow);
        
        if (!promptId) {
          throw new Error('Failed to queue workflow');
        }
        
        console.log("Workflow queued with ID:", promptId);
        setProgress(50);
        setStatus('processing');
        
        // Step 7: Wait for workflow to complete with progress updates
        const progressCallback = (result) => {
          if (result.status === 'processing') {
            // Calculate progress
            const processingProgress = Math.min(40, 40 * (result.completedNodeCount / result.expectedNodeCount || 0.5));
            setProgress(50 + processingProgress);
          }
        };
        
        // Wait for completion
        console.log("Waiting for workflow completion...");
        const completed = await comfyClient.waitForWorkflowCompletion(
          promptId, 
          config.DEFAULT_TIMEOUT_MINUTES,
          progressCallback
        );
        
        if (!completed) {
          throw new Error('Workflow processing failed or timed out');
        }
        
        setProgress(90);
        console.log("Workflow completed, getting output files...");
        
        // Step 8: Get output files
        const outputFiles = await comfyClient.getOutputFiles(promptId);
        console.log("Output files:", JSON.stringify(outputFiles, null, 2));
        
        if (!outputFiles || outputFiles.length === 0) {
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
          console.log("Downloading video:", JSON.stringify(latestVideo, null, 2));
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
          console.log("Downloading image object:", JSON.stringify(latestImage, null, 2));
          
          if (!latestImage.url) {
            throw new Error(`Image has no URL: ${JSON.stringify(latestImage)}`);
          }
          
          console.log("Downloading image from URL:", latestImage.url);
          resultUrl = await comfyClient.downloadFile(latestImage.url);
          
          if (!resultUrl) {
            throw new Error('Failed to download image, got null URL');
          }
        }
        
        if (!resultUrl) {
          throw new Error('Failed to download result');
        }
        
        try {
          // Convert blobUrl to base64 for display
          console.log("Converting blob URL to base64:", resultUrl);
          const response = await fetch(resultUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
          }
          
          const blob = await response.blob();
          console.log("Blob received:", blob.type, blob.size, "bytes");
          
          const base64Data = await blobToBase64(blob);
          console.log("Base64 conversion successful, length:", base64Data?.length || 0);
          
          setResult({
            videoUrl: base64Data,
            type: resultType
          });
          
          setProgress(100);
          setStatus('completed');
          return base64Data;
        } catch (conversionError) {
          console.error("Error converting to base64:", conversionError);
          throw new Error(`Error processing the result: ${conversionError.message}`);
        }
        
      } catch (processError) {
        console.error('Error during processing:', processError);
        const errorMessage = processError.message || 'Unknown processing error';
        throw new Error(`Processing error: ${errorMessage}`);
      }
      
    } catch (error) {
      console.error('Error generating avatar:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      setError(errorMessage);
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