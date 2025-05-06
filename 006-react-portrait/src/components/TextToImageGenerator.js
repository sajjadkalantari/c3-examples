import React, { useState, useEffect, useRef } from 'react';
import ComfyUIClient from '../services/comfyuiClient';
import Comput3API from '../services/comput3Api';
import config from '../services/config';
import { v4 as uuidv4 } from 'uuid';

// Helper to set API key as a cookie for authentication
const setApiKeyCookie = (apiKey) => {
  if (!apiKey) return;
  
  // Set cookie with apiKey that expires in 1 day
  const expires = new Date();
  expires.setDate(expires.getDate() + 1);
  document.cookie = `c3_api_key=${apiKey}; expires=${expires.toUTCString()}; path=/`;
  console.log('Set c3_api_key cookie for authentication');
};

// Helper to ensure direct URLs are not proxied (for copy/paste purposes)
const getDirectImageUrl = (url) => {
  if (!url) return '';
  
  // Remove proxy prefix if it exists
  const PROXY_URL = 'http://localhost:8080/';
  if (url.startsWith(PROXY_URL)) {
    return url.substring(PROXY_URL.length);
  }
  
  return url;
};

// For use in fetch requests only, not in src attributes
const getProxiedUrlForFetch = (url) => {
  if (!url) return '';
  
  const PROXY_URL = 'http://localhost:8080/';
  
  // If the URL is already a full URL and not already proxied, add the proxy
  if (url.startsWith('http') && !url.startsWith(PROXY_URL)) {
    console.log('Adding proxy to URL for fetch request:', url);
    return PROXY_URL + url;
  }
  
  return url;
};

// Generic two-step approach to prepare image viewing - doesn't depend on component state
const prepareImageForViewing = (imageUrl) => {
  if (!imageUrl) return Promise.resolve('');
  
  const directUrl = getDirectImageUrl(imageUrl);
  const proxiedUrl = getProxiedUrlForFetch(directUrl);
  
  console.log('Preparing image for viewing...');
  console.log('Direct URL:', directUrl);
  console.log('Proxied URL:', proxiedUrl);
  
  // Step 1: First make a request through the proxy to set up cookies/session
  return fetch(proxiedUrl, {
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'max-age=0',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
    },
    credentials: 'include'
  })
  .then(response => {
    console.log('Proxy request completed with status:', response.status);
    // Step 2: Now the direct URL should work
    return directUrl;
  })
  .catch(error => {
    console.error('Error in proxy request:', error);
    return directUrl; // Return direct URL anyway to try
  });
};

// Generic helper to store image in localStorage - doesn't depend on component state
const storeImageInLocalStorage = (imgElement, filename) => {
  if (!filename || !imgElement) return;
  
  try {
    // Create a canvas to draw the image
    const canvas = document.createElement('canvas');
    canvas.width = imgElement.width;
    canvas.height = imgElement.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgElement, 0, 0);
    
    // Convert to base64
    const dataUrl = canvas.toDataURL('image/png');
    localStorage.setItem(`img_${filename}`, dataUrl);
    console.log('Stored image in localStorage');
  } catch (e) {
    console.error('Failed to store image in localStorage:', e);
  }
};

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
  const [directUrlCopied, setDirectUrlCopied] = useState(false);
  const directUrlRef = useRef(null);

  useEffect(() => {
    // Get a random seed if not provided
    if (!seed) {
      const randomSeed = Math.floor(Math.random() * 2147483647);
      setSeed(randomSeed);
    }
  }, [seed]);

  useEffect(() => {
    // Set API key as cookie for authentication when fetching images
    if (apiKey) {
      setApiKeyCookie(apiKey);
    }
    
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
      
      console.log('Output files:', outputFiles);
      
      // Filter for images
      const images = outputFiles.filter(f => f.type === 'image');
      console.log('Image files:', images);
      
      if (images.length === 0) {
        throw new Error('No images found in output');
      }
      
      // Get the most recent image (usually from node 9)
      const node9Images = images.filter(img => img.node_id === '9');
      console.log('Node 9 images:', node9Images);
      
      const targetImage = node9Images.length > 0 ? node9Images[node9Images.length - 1] : images[0];
      console.log('Selected target image:', targetImage);
      
      // Try to download the image using the ComfyUI client's downloadFile method
      // This should handle authentication properly
      let blobUrl = null;
      try {
        setStatusMessage('Downloading image...');
        console.log('Downloading image through proxy:', targetImage.url);
        blobUrl = await comfyClient.downloadFile(targetImage.url);
        console.log('Image downloaded successfully, blob URL:', blobUrl ? 'created' : 'failed');
      } catch (downloadErr) {
        console.error('Error downloading image:', downloadErr);
      }
      
      // Get image URL - this one includes &type=output by default
      const imageUrl = comfyClient.getImageUrl(targetImage.filename, targetImage.subfolder);
      console.log('Final image URL:', imageUrl);
  
      // Create an alternate URL without the &type=output param
      const cleanDirectUrl = `${comfyClient.originalServerUrl}/view?filename=${encodeURIComponent(targetImage.filename)}${targetImage.subfolder ? `&subfolder=${encodeURIComponent(targetImage.subfolder)}` : ''}`;
      console.log('Clean direct URL (no type param):', cleanDirectUrl);
      
      setStatusMessage('Done!');
      setResult({
        imageUrl,
        cleanDirectUrl,
        blobUrl,  // Add the blob URL to the result
        originalFilename: targetImage.filename,
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

  // Function to load the image with proper headers
  const loadImageWithHeaders = (imageUrl) => {
    if (!imageUrl) return;
    
    prepareImageForViewing(imageUrl)
      .then(preparedUrl => {
        // Now create an image element with the direct URL
        console.log('Loading prepared URL:', preparedUrl);
        
        // Create a new image element to test loading
        const testImg = new Image();
        
        testImg.onload = () => {
          console.log('Image loaded successfully');
          
          // Also store in localStorage as backup
          if (result && result.originalFilename) {
            storeImageInLocalStorage(testImg, result.originalFilename);
          }
        };
        
        testImg.onerror = () => {
          console.error('Direct image loading failed, falling back to fetch with blob URL');
          
          // Fall back to fetching as blob
          fetch(preparedUrl, {
            headers: {
              'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              'accept-language': 'en-US,en;q=0.9',
              'sec-fetch-dest': 'image',
              'sec-fetch-mode': 'no-cors',
              'sec-fetch-site': 'same-origin'
            },
            credentials: 'include'
          })
          .then(response => {
            if (!response.ok) {
              throw new Error(`Failed to load image: ${response.status} ${response.statusText}`);
            }
            return response.blob();
          })
          .then(blob => {
            const objectUrl = URL.createObjectURL(blob);
            
            // Save the blob to localStorage for future use
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
              const base64data = reader.result;
              try {
                // Store the image in localStorage with the filename as key
                if (result && result.originalFilename) {
                  localStorage.setItem(`img_${result.originalFilename}`, base64data);
                  console.log('Saved image to localStorage');
                }
              } catch (e) {
                console.error('Failed to save image to localStorage:', e);
              }
            };
          })
          .catch(error => {
            console.error('Error fetching image:', error);
            
            // Try to load from localStorage if available
            if (result && result.originalFilename) {
              const savedImage = localStorage.getItem(`img_${result.originalFilename}`);
              if (savedImage) {
                console.log('Loading image from localStorage');
                testImg.src = savedImage;
              }
            }
            
            // Try the alternative URL if the first one fails
            if (imageUrl === result.imageUrl && result.cleanDirectUrl) {
              console.log('Primary image URL failed, trying alternative URL');
              loadImageWithHeaders(result.cleanDirectUrl);
            }
          });
        };
        
        // Set the source to start loading
        testImg.src = preparedUrl;
      });
  };

  // Function to download the image directly
  const downloadImage = () => {
    if (!result) return;
    
    // If we have a blob URL, use it directly as it's already downloaded and authenticated
    if (result.blobUrl) {
      const a = document.createElement('a');
      a.href = result.blobUrl;
      a.download = result.originalFilename || 'generated-image.png';
      document.body.appendChild(a);
      a.click();
      
      // Clean up after download
      setTimeout(() => {
        document.body.removeChild(a);
      }, 100);
      
      return;
    }
    
    // Fallback to the clean URL without &type=output if available
    const directUrl = getDirectImageUrl(result.cleanDirectUrl || result.imageUrl);
    
    // First set API key cookie
    setApiKeyCookie(apiKey);
    
    // Then try direct download
    fetch(directUrl, {
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'max-age=0',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
      },
      credentials: 'include'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
      }
      return response.blob();
    })
    .then(blob => {
      // Create a download link and trigger it
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = result.originalFilename || 'generated-image.png';
      document.body.appendChild(a);
      a.click();
      
      // Clean up after download
      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);
      }, 100);
      
      // Also save to localStorage
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64data = reader.result;
        try {
          if (result && result.originalFilename) {
            localStorage.setItem(`img_${result.originalFilename}`, base64data);
            console.log('Saved downloaded image to localStorage');
          }
        } catch (e) {
          console.error('Failed to save image to localStorage:', e);
        }
      };
    })
    .catch(error => {
      console.error('Error downloading image:', error);
      alert('Failed to download image. Please try again.');
    });
  };

  // Display download instructions if image fails to load
  const displayDownloadInstructions = () => {
    if (!result || !result.imageUrl) return;
    
    const directUrl = getDirectImageUrl(result.imageUrl);
    
    setError(
      <div>
        <p>Unable to load the image directly. Please try one of these options:</p>
        <ol className="list-decimal pl-5 my-2">
          <li>Click the "Download Image" button below</li>
          <li>
            <a 
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Open image in a new tab
            </a> and save it from there
          </li>
          <li>Try using the "View Image in New Tab" option which provides more download options</li>
        </ol>
      </div>
    );
  };

  // Monitor for image loading issues
  useEffect(() => {
    if (result && result.imageUrl) {
      // Clear any previous errors
      setError('');
      
      // Set API key cookie again to ensure authentication
      setApiKeyCookie(apiKey);
      
      // If image doesn't appear after 5 seconds, show download instructions
      const timer = setTimeout(() => {
        const img = document.querySelector('.mt-6 img');
        if (img && (!img.complete || img.naturalHeight === 0)) {
          displayDownloadInstructions();
        }
      }, 5000);
      
      return () => {
        clearTimeout(timer);
      };
    }
  }, [result, apiKey]);

  // Debug image function - create a standalone HTML page to show the image
  const handleImageDisplay = () => {
    if (!result) return;
    
    // If we have a blob URL, use it directly - it's already authenticated
    if (result.blobUrl) {
      // Open a new window with the blob URL
      const win = window.open(result.blobUrl, '_blank');
      return;
    }
    
    // Fallback to the clean URL or original URL
    const directUrl = getDirectImageUrl(result.cleanDirectUrl || result.imageUrl);
    const proxiedUrl = getProxiedUrlForFetch(directUrl);
    
    // Check if we already have this image in localStorage
    let savedImageData = null;
    if (result.originalFilename) {
      savedImageData = localStorage.getItem(`img_${result.originalFilename}`);
    }
    
    // Open a new window with the direct URL embedded in HTML
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <html>
          <head>
            <title>Image - ${result.originalFilename || 'Generated Image'}</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
              }
              .image-container {
                display: flex;
                justify-content: center;
                margin: 20px 0;
              }
              img {
                max-width: 100%;
                height: auto;
                border-radius: 5px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              }
              .info {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
                margin-top: 20px;
              }
              .url-container {
                display: flex;
                margin: 10px 0;
              }
              input {
                flex-grow: 1;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
              }
              button {
                margin-left: 5px;
                padding: 8px 15px;
                background: #4299e1;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
              }
              h2 {
                margin-top: 30px;
                border-bottom: 1px solid #eee;
                padding-bottom: 10px;
              }
              .error {
                color: #e53e3e;
                margin-top: 10px;
                padding: 10px;
                background-color: #fff5f5;
                border-radius: 4px;
              }
              .download-btn {
                margin-top: 20px;
                padding: 12px 20px;
                font-size: 16px;
                background: #38a169;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                display: block;
                width: 100%;
                max-width: 300px;
                margin-left: auto;
                margin-right: auto;
              }
              .loading {
                text-align: center;
                padding: 40px;
                font-style: italic;
                color: #718096;
              }
              .fallback-container {
                display: none;
                margin-top: 20px;
              }
              .step-display {
                margin: 10px 0;
                padding: 10px;
                background-color: #edf2f7;
                border-radius: 4px;
                font-size: 14px;
              }
              .two-step-note {
                background-color: #e6fffa;
                padding: 10px;
                border-radius: 4px;
                margin-top: 15px;
                font-size: 14px;
                border-left: 4px solid #38b2ac;
              }
            </style>
          </head>
          <body>
            <h1>Generated Image</h1>
            
            <div class="loading" id="loading-message">
              Loading image using two-step approach...
            </div>
            
            <div class="image-container" style="display:none" id="image-container">
              <img 
                id="main-image"
                alt="Generated image"
              />
            </div>
            
            <div id="fallback-container" class="fallback-container">
              <h2>Using Cached Image</h2>
              <p>The direct image URL could not be loaded. Displaying the cached version of the image instead.</p>
              ${savedImageData ? `<img id="fallback-image" src="${savedImageData}" alt="Cached version of generated image" />` : ''}
            </div>
            
            <div class="step-display" id="step-display">
              Step 1: Preparing image through proxy...
            </div>
            
            <button class="download-btn" onclick="downloadImage()">Download Image</button>
            
            <div class="two-step-note">
              <strong>Note:</strong> This image is loaded using a two-step process:
              <ol>
                <li>First, we access the image through a proxy: <code>${proxiedUrl}</code></li>
                <li>Then, we can access the direct URL: <code>${directUrl}</code></li>
              </ol>
            </div>
            
            <h2>Direct Image URL</h2>
            <p>Copy this URL to use outside of the app:</p>
            <div class="url-container">
              <input type="text" value="${directUrl}" id="direct-url" readonly>
              <button onclick="copyUrl()">Copy</button>
            </div>
            
            <div class="info">
              <h2>Image Details</h2>
              <p><b>Prompt:</b> ${result.prompt}</p>
              <p><b>Negative Prompt:</b> ${result.negativePrompt}</p>
              <p><b>Size:</b> ${result.width}x${result.height}</p>
              <p><b>Steps:</b> ${result.steps}</p>
              <p><b>Seed:</b> ${result.seed}</p>
              <p><b>Filename:</b> ${result.originalFilename || 'Unknown'}</p>
            </div>
            
            <script>
              // Set API key as cookie in this window as well
              document.cookie = "c3_api_key=${apiKey}; path=/";
              
              // Store the saved image data if available
              const savedImageData = ${savedImageData ? `"${savedImageData}"` : 'null'};
              const proxiedUrl = "${proxiedUrl}";
              const directUrl = "${directUrl}";
              const originalFilename = "${result.originalFilename || 'generated-image.png'}";
              
              function copyUrl() {
                const urlInput = document.getElementById('direct-url');
                urlInput.select();
                document.execCommand('copy');
                const button = document.querySelector('.url-container button');
                button.textContent = 'Copied!';
                setTimeout(() => {
                  button.textContent = 'Copy';
                }, 2000);
              }
              
              // Two-step approach to load the image
              async function loadImageWithTwoSteps() {
                const stepDisplay = document.getElementById('step-display');
                const loadingMessage = document.getElementById('loading-message');
                const imageContainer = document.getElementById('image-container');
                const mainImage = document.getElementById('main-image');
                
                // Step 1: First make a request through the proxy to set up cookies/session
                stepDisplay.textContent = "Step 1: Accessing through proxy...";
                try {
                  const proxyResponse = await fetch(proxiedUrl, {
                    headers: {
                      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                      'accept-language': 'en-US,en;q=0.9',
                      'cache-control': 'max-age=0',
                      'sec-fetch-dest': 'document',
                      'sec-fetch-mode': 'navigate',
                      'sec-fetch-site': 'none',
                      'sec-fetch-user': '?1',
                      'upgrade-insecure-requests': '1',
                      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
                    },
                    credentials: 'include'
                  });
                  
                  stepDisplay.textContent = "Step 2: Accessing direct URL...";
                  
                  // If we have saved image data, use it as a fallback
                  if (savedImageData) {
                    mainImage.onerror = function() {
                      console.error('Direct image loading failed, using cached version');
                      document.getElementById('fallback-container').style.display = 'block';
                    };
                  }
                  
                  // Now try to load the direct URL
                  mainImage.onload = function() {
                    console.log('Image loaded successfully');
                    loadingMessage.style.display = 'none';
                    imageContainer.style.display = 'flex';
                    stepDisplay.textContent = "Image loaded successfully!";
                  };
                  
                  // Set the source to the direct URL
                  mainImage.src = directUrl;
                } catch (error) {
                  console.error('Error in two-step loading:', error);
                  stepDisplay.textContent = "Error loading image through proxy. Trying alternate methods...";
                  
                  if (savedImageData) {
                    // Use saved image data
                    document.getElementById('fallback-container').style.display = 'block';
                  } else {
                    // Try direct fetch
                    handleImageError();
                  }
                }
              }
              
              function handleImageError() {
                const mainImage = document.getElementById('main-image');
                const imageContainer = document.getElementById('image-container');
                const loadingMessage = document.getElementById('loading-message');
                const stepDisplay = document.getElementById('step-display');
                const fallbackContainer = document.getElementById('fallback-container');
                
                stepDisplay.textContent = "Direct loading failed. Trying fetch with blob...";
                
                // If we have a saved image, show it
                if (savedImageData) {
                  fallbackContainer.style.display = 'block';
                  loadingMessage.style.display = 'none';
                  return;
                }
                
                // Try to load the image using fetch with credentials
                fetch(directUrl, {
                  headers: {
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-language': 'en-US,en;q=0.9',
                    'cache-control': 'max-age=0',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'none',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
                  },
                  credentials: 'include'
                })
                .then(response => response.blob())
                .then(blob => {
                  const objectUrl = URL.createObjectURL(blob);
                  mainImage.src = objectUrl;
                  imageContainer.style.display = 'flex';
                  loadingMessage.style.display = 'none';
                  stepDisplay.textContent = "Image loaded via blob URL!";
                  
                  // Save this image data to window variables for download
                  window.imageBlob = blob;
                  window.imageObjectUrl = objectUrl;
                })
                .catch(error => {
                  console.error('Error fetching image:', error);
                  stepDisplay.textContent = "All image loading methods failed. Please try downloading the image.";
                  loadingMessage.textContent = "Unable to display image. Try downloading instead.";
                });
              }
              
              function downloadImage() {
                // If we have the image blob already, use it
                if (window.imageBlob) {
                  const a = document.createElement('a');
                  a.href = window.imageObjectUrl;
                  a.download = originalFilename;
                  a.click();
                  return;
                }
                
                // If we have the fallback image, use that
                if (savedImageData) {
                  const a = document.createElement('a');
                  a.href = savedImageData;
                  a.download = originalFilename;
                  a.click();
                  return;
                }
                
                // Otherwise, try to fetch and download the image using the two-step approach
                fetch(proxiedUrl, {
                  headers: {
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-language': 'en-US,en;q=0.9',
                    'cache-control': 'max-age=0',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'none',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
                  },
                  credentials: 'include'
                })
                .then(response => {
                  // After proxy request, try direct URL
                  return fetch(directUrl, {
                    headers: {
                      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                      'accept-language': 'en-US,en;q=0.9',
                      'cache-control': 'max-age=0',
                      'sec-fetch-dest': 'document',
                      'sec-fetch-mode': 'navigate',
                      'sec-fetch-site': 'none',
                      'sec-fetch-user': '?1',
                      'upgrade-insecure-requests': '1',
                      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
                    },
                    credentials: 'include'
                  });
                })
                .then(response => {
                  if (!response.ok) {
                    throw new Error('Failed to download image');
                  }
                  return response.blob();
                })
                .then(blob => {
                  // Create download link
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = originalFilename;
                  document.body.appendChild(a);
                  a.click();
                  
                  // Clean up
                  setTimeout(() => {
                    URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                  }, 100);
                  
                  // Also display the image if it wasn't displayed before
                  if (!document.getElementById('main-image').src) {
                    document.getElementById('main-image').src = url;
                    document.getElementById('image-container').style.display = 'flex';
                    document.getElementById('loading-message').style.display = 'none';
                    document.getElementById('step-display').textContent = "Image loaded from download!";
                  }
                })
                .catch(error => {
                  alert('Failed to download image. Please try again.');
                  console.error(error);
                });
              }
              
              // Start loading the image when the page loads
              window.onload = loadImageWithTwoSteps;
            </script>
          </body>
        </html>
      `);
      win.document.close();
    }
  };

  // Function to copy the direct URL to clipboard
  const copyDirectUrl = () => {
    if (directUrlRef.current) {
      directUrlRef.current.select();
      document.execCommand('copy');
      setDirectUrlCopied(true);
      setTimeout(() => setDirectUrlCopied(false), 2000);
    }
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
            {/* Updated image display approach - prioritize blob URL to avoid authentication issues */}
            <img 
              src={result.blobUrl || getDirectImageUrl(result.cleanDirectUrl || result.imageUrl)} 
              alt="Generated image" 
              className="max-w-full h-auto rounded shadow-lg mb-4"
              onError={(e) => {
                console.error('Error loading image directly:', e);
                if (e.target.src === result.blobUrl && result.cleanDirectUrl) {
                  // If blob URL fails, try the clean URL
                  console.log('Blob URL failed, trying clean URL');
                  e.target.src = getDirectImageUrl(result.cleanDirectUrl);
                } else if (e.target.src === getDirectImageUrl(result.cleanDirectUrl) && result.imageUrl) {
                  // If clean URL fails, try the original URL
                  console.log('Clean URL failed, trying original URL');
                  e.target.src = getDirectImageUrl(result.imageUrl);
                } else {
                  // If all direct methods fail, try to load from localStorage if available
                  if (result.originalFilename) {
                    const savedImage = localStorage.getItem(`img_${result.originalFilename}`);
                    if (savedImage) {
                      console.log('Loading image from localStorage');
                      e.target.src = savedImage;
                    }
                  }
                }
              }}
            />
            
            {/* Direct URL field for copy/paste - use clean URL */}
            <div className="w-full mb-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Direct Image URL:</p>
              <div className="flex">
                <input
                  ref={directUrlRef}
                  type="text"
                  readOnly
                  value={getDirectImageUrl(result.cleanDirectUrl || result.imageUrl)}
                  className="flex-grow shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-l-md"
                />
                <button
                  onClick={copyDirectUrl}
                  className="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-r-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {directUrlCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                This direct URL requires authentication with your API key. Use "View in New Tab" to see the image in a new window, or add a cookie named "c3_api_key" with your API key as value.
              </p>
            </div>
            
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
            
            <div className="mt-4 flex space-x-4">
              <button
                onClick={handleImageDisplay}
                className="text-blue-600 hover:text-blue-800 text-sm underline"
              >
                View Image in New Tab
              </button>
              <button
                onClick={downloadImage}
                className="text-blue-600 hover:text-blue-800 text-sm underline"
              >
                Download Image
              </button>
            </div>
            
            {debug && (
              <div className="mt-4 w-full">
                <p className="text-sm font-semibold">Image URLs:</p>
                <p className="text-xs break-all"><span className="font-semibold">Blob URL:</span> {result.blobUrl || 'None (download failed)'}</p>
                <p className="text-xs break-all"><span className="font-semibold">API URL:</span> {result.imageUrl}</p>
                <p className="text-xs break-all"><span className="font-semibold">Direct URL:</span> {getDirectImageUrl(result.imageUrl)}</p>
                <p className="text-xs break-all"><span className="font-semibold">Clean Direct URL:</span> {result.cleanDirectUrl}</p>
                <p className="text-xs break-all"><span className="font-semibold">Original Filename:</span> {result.originalFilename}</p>
                <button 
                  className="mt-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                  onClick={() => {
                    if (result.imageUrl) {
                      // Set API key cookie again before reloading
                      setApiKeyCookie(apiKey);
                      // Try the direct URL
                      const img = document.querySelector('.mt-6 img');
                      if (img) {
                        img.src = getDirectImageUrl(result.imageUrl);
                      }
                    }
                  }}
                >
                  Reload Image
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TextToImageGenerator; 