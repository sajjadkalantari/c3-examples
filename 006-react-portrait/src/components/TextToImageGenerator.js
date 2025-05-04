import React, { useState, useEffect } from 'react';
import ComfyUIClient from '../services/comfyuiClient';
import Comput3API from '../services/comput3Api';
import config from '../services/config';
import { v4 as uuidv4 } from 'uuid';

const TextToImageGenerator = ({ apiKey }) => {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality, distorted, deformed');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(35);
  const [seed, setSeed] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [comfyuiUrl, setComfyuiUrl] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [debug, setDebug] = useState(false);
  const [workflowData, setWorkflowData] = useState(null);

  useEffect(() => {
    // Get a random seed if not provided
    if (!seed) {
      const randomSeed = Math.floor(Math.random() * 2147483647);
      setSeed(randomSeed);
    }
  }, [seed]);

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

  const generateImage = async () => {
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
      console.log('Loading workflow from path:', `${process.env.PUBLIC_URL}${config.TEXT_TO_IMAGE_WORKFLOW_PATH}`);
      const workflow = await comfyClient.loadWorkflow(`${process.env.PUBLIC_URL}${config.TEXT_TO_IMAGE_WORKFLOW_PATH}`);
      console.log('Workflow loaded successfully:', workflow ? 'Yes' : 'No');
      setWorkflowData(workflow);
      
      // Validate the workflow structure
      const validation = comfyClient.validateWorkflow(workflow);
      if (!validation.valid) {
        const errorMessage = `Invalid workflow structure: ${validation.errors.join(', ')}`;
        console.error(errorMessage);
        setError(errorMessage);
        return;
      }
      
      // Update workflow with parameters
      setStatusMessage('Updating workflow parameters...');
      const seedValue = seed || Math.floor(Math.random() * 2147483647);
      
      let updatedWorkflow;
      try {
        updatedWorkflow = comfyClient.updateTextToImageWorkflow(
          workflow,
          prompt,
          negativePrompt,
          width,
          height,
          parseInt(seedValue),
          steps
        );
      } catch (updateError) {
        console.error('Error updating workflow parameters:', updateError);
        setError(`Error updating workflow: ${updateError.message}. Please check the browser console for more details.`);
        return; // Stop further processing
      }
      
      // Queue workflow
      setStatusMessage('Queueing workflow...');
      const promptId = await comfyClient.queueWorkflow(updatedWorkflow);
      
      if (!promptId) {
        throw new Error('Failed to queue workflow');
      }
      
      // Wait for workflow completion
      setStatusMessage('Processing image...');
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
      
      // Filter for images
      const images = outputFiles.filter(f => f.type === 'image');
      
      if (images.length === 0) {
        throw new Error('No images found in output');
      }
      
      // Get the most recent image (usually from node 9)
      const node9Images = images.filter(img => img.node_id === '9');
      const targetImage = node9Images.length > 0 ? node9Images[node9Images.length - 1] : images[0];
      
      // Get image URL
      const imageUrl = comfyClient.getImageUrl(targetImage.filename, targetImage.subfolder);
      
      setStatusMessage('Done!');
      setResult({
        imageUrl,
        prompt,
        negativePrompt,
        seed: seedValue,
        width,
        height,
        steps
      });
      
    } catch (err) {
      console.error('Error generating image:', err);
      // Detailed error logging for debugging
      if (err.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('Response error:', {
          status: err.response.status,
          data: err.response.data,
          headers: err.response.headers
        });
        setError(`Error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
      } else if (err.request) {
        // The request was made but no response was received
        console.error('Request error (no response):', err.request);
        setError(`Error: No response received from server. Check your network connection.`);
      } else {
        // Something happened in setting up the request
        console.error('Error details:', err.message);
        setError(`Error: ${err.message || 'Unknown error occurred'}`);
      }
      
      // If it's just a plain object, log the entire object
      if (err && typeof err === 'object' && !(err instanceof Error)) {
        console.error('Full error object:', JSON.stringify(err, null, 2));
        setError(`Error: ${JSON.stringify(err, null, 2)}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRandomSeed = () => {
    const randomSeed = Math.floor(Math.random() * 2147483647);
    setSeed(randomSeed);
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
            placeholder="Describe what you want in the image..."
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
            placeholder="Describe what you don't want in the image..."
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            disabled={isProcessing}
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="width" className="block text-sm font-medium text-gray-700 mb-1">
              Width
            </label>
            <select
              id="width"
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
              value={width}
              onChange={(e) => setWidth(parseInt(e.target.value))}
              disabled={isProcessing}
            >
              <option value="512">512px</option>
              <option value="768">768px</option>
              <option value="1024">1024px</option>
              <option value="1280">1280px</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="height" className="block text-sm font-medium text-gray-700 mb-1">
              Height
            </label>
            <select
              id="height"
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
              value={height}
              onChange={(e) => setHeight(parseInt(e.target.value))}
              disabled={isProcessing}
            >
              <option value="512">512px</option>
              <option value="768">768px</option>
              <option value="1024">1024px</option>
              <option value="1280">1280px</option>
            </select>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="steps" className="block text-sm font-medium text-gray-700 mb-1">
              Steps
            </label>
            <input
              type="number"
              id="steps"
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
              value={steps}
              onChange={(e) => setSteps(parseInt(e.target.value))}
              min="10"
              max="150"
              disabled={isProcessing}
            />
          </div>
          
          <div>
            <label htmlFor="seed" className="block text-sm font-medium text-gray-700 mb-1">
              Seed (leave blank for random)
            </label>
            <div className="flex">
              <input
                type="number"
                id="seed"
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-l-md"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                disabled={isProcessing}
              />
              <button
                type="button"
                onClick={handleRandomSeed}
                className="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-r-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                disabled={isProcessing}
              >
                Random
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4">
        <button
          type="button"
          onClick={generateImage}
          className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isProcessing || !apiKey || !prompt}
        >
          {isProcessing ? 'Processing...' : 'Generate Image'}
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
        {debug && (
          <div className="mt-4 p-4 bg-gray-100 rounded-md">
            <h3 className="text-lg font-medium mb-2">Debug Information</h3>
            <div className="space-y-2">
              <div>
                <p className="text-sm font-semibold">ComfyUI URL:</p>
                <p className="text-xs break-all">{comfyuiUrl || 'Not set'}</p>
              </div>
              <div>
                <p className="text-sm font-semibold">Workflow File Path:</p>
                <p className="text-xs break-all">{`${process.env.PUBLIC_URL}${config.TEXT_TO_IMAGE_WORKFLOW_PATH}`}</p>
              </div>
              {workflowData && (
                <div>
                  <p className="text-sm font-semibold">Workflow Structure:</p>
                  <pre className="text-xs bg-gray-200 p-2 rounded max-h-40 overflow-auto">
                    {JSON.stringify({
                      id: workflowData.id,
                      nodeCount: workflowData.nodes ? workflowData.nodes.length : 0,
                      nodes: workflowData.nodes
                        ? workflowData.nodes.map(n => ({ id: n.id, type: n.type, title: n.title }))
                        : []
                    }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
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
      </div>

      {result && (
        <div className="mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Generated Image</h3>
          <div className="flex flex-col items-center">
            <img 
              src={result.imageUrl} 
              alt="Generated image" 
              className="max-w-full h-auto rounded shadow-lg mb-4" 
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full text-sm text-gray-600">
              <div>
                <p><span className="font-semibold">Prompt:</span> {result.prompt}</p>
                <p><span className="font-semibold">Negative Prompt:</span> {result.negativePrompt}</p>
              </div>
              <div>
                <p><span className="font-semibold">Size:</span> {result.width}x{result.height}</p>
                <p><span className="font-semibold">Steps:</span> {result.steps}</p>
                <p><span className="font-semibold">Seed:</span> {result.seed}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextToImageGenerator; 