import React, { useState, useEffect } from 'react';
import ComfyUIClient from '../services/comfyuiClient';
import Comput3API from '../services/comput3Api';
import config from '../services/config';
import { v4 as uuidv4 } from 'uuid';

const TextToVideoGenerator = ({ apiKey }) => {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('poor quality, blurry, pixelated, low resolution, watermark, signature, text, letters, words');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [comfyuiUrl, setComfyuiUrl] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [debug, setDebug] = useState(false);
  const [workflowData, setWorkflowData] = useState(null);

  useEffect(() => {
    const checkComfyuiUrl = async () => {
      if (apiKey) {
        try {
          const c3Client = new Comput3API(apiKey);
          const url = await c3Client.getComfyuiUrl();
          setComfyuiUrl(url);
          if (!url) {
            setError('No running media instance found. Please launch a media instance at https://launch.comput3.ai');
          }
        } catch (err) {
          console.error('Error getting ComfyUI URL:', err);
          setError('Error connecting to Comput3 API. Please check your API key.');
        }
      }
    };

    checkComfyuiUrl();
  }, [apiKey]);

  const generateVideo = async () => {
    if (!apiKey) {
      setError('Please enter your Comput3 API key');
      return;
    }

    if (!comfyuiUrl) {
      setError('No running media instance found. Please launch a media instance at https://launch.comput3.ai');
      return;
    }

    if (!prompt) {
      setError('Please enter a prompt');
      return;
    }

    setError('');
    setIsProcessing(true);
    setStatusMessage('Initializing...');
    setResult(null);
    setWorkflowData(null);

    try {
      // Initialize ComfyUI client
      console.log('Initializing ComfyUI client with URL:', comfyuiUrl, 'and API key:', apiKey ? 'API key provided' : 'No API key');
      const comfyClient = new ComfyUIClient(comfyuiUrl, apiKey);
      
      // Load workflow template
      setStatusMessage('Loading workflow template...');
      console.log('Loading workflow from path:', `${process.env.PUBLIC_URL}${config.TEXT_TO_VIDEO_WORKFLOW_PATH}`);
      const workflow = await comfyClient.loadWorkflow(`${process.env.PUBLIC_URL}${config.TEXT_TO_VIDEO_WORKFLOW_PATH}`);
      console.log('Workflow loaded successfully:', workflow ? 'Yes' : 'No');
      setWorkflowData(workflow);
      
      // Validate the workflow structure
      // const validation = comfyClient.validateWorkflow(workflow);
      // if (!validation.valid) {
      //   const errorMessage = `Invalid workflow structure: ${validation.errors.join(', ')}`;
      //   console.error(errorMessage);
      //   setError(errorMessage);
      //   return;
      // }
      
      // Update workflow with parameters
      setStatusMessage('Updating workflow parameters...');
      
      let updatedWorkflow;
      try {
        updatedWorkflow = comfyClient.updateTextToVideoWorkflow(
          workflow,
          prompt,
          negativePrompt
        );
      } catch (updateError) {
        console.error('Error updating workflow parameters:', updateError);
        setError(`Error updating workflow: ${updateError.message}. Please check the browser console for more details.`);
        return; // Stop further processing
      }
      
      // Queue workflow
      setStatusMessage('Queueing workflow...');
      console.log('Queueing workflow:', JSON.stringify(updatedWorkflow));
      const promptId = await comfyClient.queueWorkflow(updatedWorkflow);
      
      if (!promptId) {
        throw new Error('Failed to queue workflow');
      }
      
      // Wait for workflow completion
      setStatusMessage('Processing video...');
      const isComplete = await comfyClient.waitForWorkflowCompletion(promptId, 15, (status) => {
        setStatusMessage(`Processing: ${status}`);
      });
      
      if (!isComplete) {
        throw new Error('Workflow processing failed or timed out');
      }
      
      // Get output files
      setStatusMessage('Getting results...');
      const outputFiles = await comfyClient.getOutputFiles(promptId);
      
      if (!outputFiles || outputFiles.length === 0) {
        throw new Error('No output files found');
      }
      
      // Filter for videos
      const videos = outputFiles.filter(f => f.type === 'video');
      
      if (videos.length === 0) {
        throw new Error('No videos found in output');
      }
      
      // Get the most recent video
      const targetVideo = videos[videos.length - 1];
      
      // Download the video for displaying
      const videoUrl = await comfyClient.downloadFile(targetVideo.url);
      
      setStatusMessage('Done!');
      setResult({
        videoUrl,
        prompt,
        negativePrompt
      });
      
    } catch (err) {
      console.error('Error generating video:', err);
      // Detailed error logging for debugging
      if (err.response) {
        console.error('Response error:', {
          status: err.response.status,
          data: err.response.data,
          headers: err.response.headers
        });
        setError(`Error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
      } else if (err.request) {
        console.error('Request error (no response):', err.request);
        setError(`Error: No response received from server. Check your network connection.`);
      } else {
        console.error('Error details:', err.message);
        setError(`Error: ${err.message || 'Unknown error occurred'}`);
      }
      
      if (err && typeof err === 'object' && !(err instanceof Error)) {
        console.error('Full error object:', JSON.stringify(err, null, 2));
        setError(`Error: ${JSON.stringify(err, null, 2)}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleDebug = () => {
    setDebug(!debug);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-1">
            Prompt
          </label>
          <textarea
            id="prompt"
            className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 min-h-[100px]"
            placeholder="Describe what you want in the video..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isProcessing}
          />
        </div>
        
        <div>
          <label htmlFor="negative-prompt" className="block text-sm font-medium text-gray-700 mb-1">
            Negative Prompt
          </label>
          <textarea
            id="negative-prompt"
            className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2"
            placeholder="Describe what you don't want in the video..."
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            disabled={isProcessing}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={generateVideo}
        className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isProcessing || !apiKey || !prompt}
      >
        {isProcessing ? 'Processing...' : 'Generate Video'}
      </button>
      
      {/* Debug toggle button */}
      <button
        type="button"
        onClick={toggleDebug}
        className="mt-2 text-sm text-gray-500 hover:text-gray-700"
      >
        {debug ? 'Hide Debug Info' : 'Show Debug Info'}
      </button>
      
      {/* Debug information section */}
      {debug && workflowData && (
        <div className="mt-4 overflow-auto max-h-96 p-4 bg-gray-50 rounded border text-xs">
          <h4 className="font-bold mb-2">Workflow Data:</h4>
          <pre>{JSON.stringify(workflowData, null, 2)}</pre>
        </div>
      )}

      {isProcessing && (
        <div className="mt-4">
          <div className="relative pt-1">
            <div className="flex mb-2 items-center justify-between">
              <div>
                <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
                  {statusMessage}
                </span>
              </div>
            </div>
            <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200">
              <div className="animate-pulse w-full shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500"></div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Generated Video</h3>
          <div className="flex flex-col items-center">
            <video 
              src={result.videoUrl} 
              controls
              loop
              autoPlay
              className="max-w-full h-auto rounded shadow-lg mb-4" 
            />
            <div className="grid grid-cols-1 gap-4 w-full text-sm text-gray-600">
              <div>
                <p><span className="font-semibold">Prompt:</span> {result.prompt}</p>
                <p><span className="font-semibold">Negative Prompt:</span> {result.negativePrompt}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextToVideoGenerator; 