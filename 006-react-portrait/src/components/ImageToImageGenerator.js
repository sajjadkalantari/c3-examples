import React, { useState, useEffect } from 'react';
import ComfyUIClient from '../services/comfyuiClient';
import Comput3API from '../services/comput3Api';
import config from '../services/config';
import { FiUploadCloud, FiImage, FiSliders, FiCopy } from 'react-icons/fi';

const ImageToImageGenerator = ({ apiKey }) => {
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality, distorted, deformed');
  const [strength, setStrength] = useState(0.75);
  const [steps, setSteps] = useState(35);
  const [seed, setSeed] = useState('');
  const [width, setWidth] = useState(768);
  const [height, setHeight] = useState(768);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [comfyuiUrl, setComfyuiUrl] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Generate a random seed if not provided
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
          setIsInitialized(true);
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

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      setUploadedImage(file);
      const objectUrl = URL.createObjectURL(file);
      setUploadedImagePreview(objectUrl);
    } else {
      setError('Please upload a valid image file');
    }
  };

  const handleRandomSeed = () => {
    const randomSeed = Math.floor(Math.random() * 2147483647);
    setSeed(randomSeed);
  };

  const handleGenerate = async () => {
    if (!apiKey) {
      setError('Please enter your Comput3 API key');
      return;
    }

    if (!comfyuiUrl) {
      setError('No running media instance found. Please launch a media instance at https://launch.comput3.ai');
      return;
    }

    if (!uploadedImage) {
      setError('Please upload an image');
      return;
    }

    setError('');
    setIsProcessing(true);
    setStatusMessage('Initializing...');

    try {
      // Initialize ComfyUI client
      const comfyClient = new ComfyUIClient(comfyuiUrl, apiKey);
      
      // Upload the image
      setStatusMessage('Uploading image...');
      const imageName = await comfyClient.uploadFile(uploadedImage, 'input');
      
      if (!imageName) {
        throw new Error('Failed to upload image');
      }
      
      // Load workflow template
      setStatusMessage('Loading workflow template...');
      const workflow = await comfyClient.loadWorkflow(`${process.env.PUBLIC_URL}/workflows/image_to_image.json`);
      
      if (!workflow) {
        throw new Error('Failed to load workflow template');
      }
      
      // Update workflow with parameters
      setStatusMessage('Updating workflow parameters...');
      const seedValue = seed || Math.floor(Math.random() * 2147483647);
      
      // Create a modified copy of the workflow
      const updatedWorkflow = JSON.parse(JSON.stringify(workflow));
      
      // Update the workflow nodes
      for (const nodeId in updatedWorkflow) {
        const node = updatedWorkflow[nodeId];
        
        // Update LoadImage node
        if (node.class_type === 'LoadImage') {
          node.inputs.image = imageName;
        }
        
        // Update KSampler node
        if (node.class_type === 'KSampler') {
          node.inputs.denoise = parseFloat(strength);
          node.inputs.steps = parseInt(steps);
          node.inputs.noise_seed = parseInt(seedValue);
        }
        
        // Update CLIPTextEncode nodes
        if (node.class_type === 'CLIPTextEncode') {
          if (node._meta?.title === 'Positive Prompt') {
            node.inputs.text = prompt;
          } else if (node._meta?.title === 'Negative Prompt') {
            node.inputs.text = negativePrompt;
          }
        }
        
        // Update ImageScale node
        if (node.class_type === 'ImageScale') {
          node.inputs.width = parseInt(width);
          node.inputs.height = parseInt(height);
        }
      }
      
      // Queue workflow
      setStatusMessage('Queueing workflow...');
      const promptId = await comfyClient.queueWorkflow(updatedWorkflow);
      
      if (!promptId) {
        throw new Error('Failed to queue workflow');
      }
      
      // Wait for workflow completion
      setStatusMessage('Processing...');
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
      
      // Get the image from nodes
      const previewImages = images.filter(img => 
        img.node_id === '9' || img.node_id === '6' || img.node_id === '8'
      );
      
      // Get the most recent image
      const targetImage = previewImages.length > 0 ? previewImages[0] : images[0];
      
      // Get image URL
      const imageUrl = comfyClient.getImageUrl(targetImage.filename, targetImage.subfolder);
      
      // Add to results
      const newResult = {
        id: Date.now(),
        imageUrl,
        inputImageUrl: uploadedImagePreview,
        prompt,
        negativePrompt,
        strength,
        seed: seedValue,
        steps
      };
      
      setResults(prevResults => [newResult, ...prevResults]);
      setStatusMessage('Done!');
      
    } catch (err) {
      console.error('Error generating image:', err);
      setError(`Error: ${err.message || 'Unknown error occurred'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Upload and Settings */}
        <div className="lg:col-span-1 space-y-6">
          {/* Image Upload */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center">
              <FiUploadCloud className="mr-2" /> Upload Image
            </h3>
            
            <div 
              className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => document.getElementById('image-upload').click()}
            >
              {uploadedImagePreview ? (
                <img 
                  src={uploadedImagePreview} 
                  alt="Uploaded" 
                  className="max-h-64 mx-auto rounded"
                />
              ) : (
                <div className="py-8">
                  <FiImage className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-500">
                    Click to upload an image or drag and drop
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    PNG, JPG, WEBP up to 5MB
                  </p>
                </div>
              )}
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
                disabled={isProcessing}
              />
            </div>
          </div>
          
          {/* Transformation Settings */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center">
              <FiSliders className="mr-2" /> Settings
            </h3>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="strength" className="block text-sm font-medium text-gray-700">
                  Transformation Strength: {strength}
                </label>
                <input
                  id="strength"
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  className="w-full mt-1"
                  value={strength}
                  onChange={(e) => setStrength(e.target.value)}
                  disabled={isProcessing}
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Subtle</span>
                  <span>Strong</span>
                </div>
              </div>
              
              <div>
                <label htmlFor="steps" className="block text-sm font-medium text-gray-700">
                  Steps: {steps}
                </label>
                <input
                  id="steps"
                  type="range"
                  min="20"
                  max="50"
                  step="1"
                  className="w-full mt-1"
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
              
              <div>
                <label htmlFor="seed" className="block text-sm font-medium text-gray-700">
                  Seed
                </label>
                <div className="mt-1 flex">
                  <input
                    id="seed"
                    type="number"
                    className="flex-grow shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border-gray-300 rounded-md"
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    disabled={isProcessing}
                  />
                  <button
                    onClick={handleRandomSeed}
                    className="ml-2 px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    disabled={isProcessing}
                  >
                    Random
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="width" className="block text-sm font-medium text-gray-700">
                    Width
                  </label>
                  <select
                    id="width"
                    className="mt-1 block w-full shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border-gray-300 rounded-md"
                    value={width}
                    onChange={(e) => setWidth(parseInt(e.target.value))}
                    disabled={isProcessing}
                  >
                    <option value="512">512px</option>
                    <option value="768">768px</option>
                    <option value="1024">1024px</option>
                  </select>
                </div>
                
                <div>
                  <label htmlFor="height" className="block text-sm font-medium text-gray-700">
                    Height
                  </label>
                  <select
                    id="height"
                    className="mt-1 block w-full shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border-gray-300 rounded-md"
                    value={height}
                    onChange={(e) => setHeight(parseInt(e.target.value))}
                    disabled={isProcessing}
                  >
                    <option value="512">512px</option>
                    <option value="768">768px</option>
                    <option value="1024">1024px</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Panel - Prompts and Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* Prompting */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium mb-4">Prompts</h3>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="prompt" className="block text-sm font-medium text-gray-700">
                  Positive Prompt
                </label>
                <textarea
                  id="prompt"
                  className="mt-1 block w-full shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border-gray-300 rounded-md"
                  rows="3"
                  placeholder="Describe what you want in the image..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
              
              <div>
                <label htmlFor="negative-prompt" className="block text-sm font-medium text-gray-700">
                  Negative Prompt
                </label>
                <textarea
                  id="negative-prompt"
                  className="mt-1 block w-full shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border-gray-300 rounded-md"
                  rows="2"
                  placeholder="Describe what you don't want in the image..."
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
              
              <div className="flex justify-end">
                <button
                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                    isProcessing
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                  }`}
                  onClick={handleGenerate}
                  disabled={isProcessing || !uploadedImage || !isInitialized}
                >
                  {isProcessing ? 'Processing...' : 'Generate'}
                </button>
              </div>
              
              {isProcessing && (
                <div className="mt-4">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className="bg-blue-600 h-2.5 rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{statusMessage}</p>
                </div>
              )}
            </div>
          </div>
          
          {/* Results */}
          {results.length > 0 && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium">Results</h3>
              </div>
              
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {results.map((result) => (
                    <div key={result.id} className="border rounded-lg overflow-hidden bg-gray-50">
                      <div className="flex">
                        <div className="w-1/2 border-r">
                          <div className="aspect-square relative">
                            <img
                              src={result.inputImageUrl}
                              alt="Input"
                              className="absolute w-full h-full object-cover"
                            />
                          </div>
                          <div className="p-2 text-xs text-gray-500 text-center border-t">Input</div>
                        </div>
                        <div className="w-1/2">
                          <div className="aspect-square relative">
                            <img
                              src={result.imageUrl}
                              alt="Output"
                              className="absolute w-full h-full object-cover"
                            />
                          </div>
                          <div className="p-2 text-xs text-gray-500 text-center border-t">Output</div>
                        </div>
                      </div>
                      
                      <div className="p-3 border-t bg-white">
                        <div className="truncate text-sm">
                          <span className="font-medium">Prompt:</span> {result.prompt || "(empty)"}
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>Strength: {result.strength}</span>
                          <span>Steps: {result.steps}</span>
                          <span>Seed: {result.seed}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageToImageGenerator; 