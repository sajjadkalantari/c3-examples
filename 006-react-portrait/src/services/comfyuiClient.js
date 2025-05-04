import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import config from './config';

// Proxy URL for development
const PROXY_URL = 'http://localhost:8080/';

class ComfyUIClient {
  /**
   * Client for interacting with ComfyUI API through Comput3
   * @param {string} serverUrl - ComfyUI server URL
   * @param {string} apiKey - Comput3 API key
   */
  constructor(serverUrl, apiKey) {
    // Add the proxy URL for development to avoid CORS issues
    this.originalServerUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
    this.serverUrl = PROXY_URL + this.originalServerUrl;
    this.apiKey = apiKey;
    this.clientId = this._getClientId();
    console.log(`🔌 Initialized ComfyUIClient with server URL: ${this.serverUrl}`);
  }
  
  /**
   * Get a client ID from the server or generate one if the endpoint doesn't exist
   * @returns {string} Client ID
   */
  _getClientId() {
    // Generate a UUID for client ID
    return uuidv4();
  }
  
  /**
   * Get headers with Comput3 API key
   * @returns {Object} Headers
   */
  _getHeaders() {
    return {
      'X-C3-API-KEY': this.apiKey,
      'X-Requested-With': 'XMLHttpRequest'  // Required by CORS-Anywhere
    };
  }
  
  /**
   * Upload a file to the ComfyUI server
   * @param {File} file - File object to upload
   * @param {string} fileType - Type of file (input, output, etc.)
   * @returns {Promise<string|null>} Uploaded file name or null if upload failed
   */
  async uploadFile(file, fileType = 'input') {
    if (!file) {
      console.error('❌ No file provided');
      return null;
    }
    
    const filename = file.name;
    console.log(`📤 Uploading file: ${filename}`);
    
    // Always use the /upload/image endpoint since there's no /upload/audio
    const uploadUrl = `${this.serverUrl}/upload/image`;
    
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('type', fileType);
      
      const response = await axios.post(uploadUrl, formData, {
        headers: {
          ...this._getHeaders(),
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.status === 200) {
        const responseData = response.data;
        console.log(`✅ File uploaded successfully: ${responseData.name}`);
        return responseData.name;
      } else {
        console.error(`❌ Upload failed: ${response.status} - ${response.data}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Exception during upload: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Load a workflow from a JSON file
   * @param {string} workflowPath - Path to workflow file or JSON object
   * @returns {Promise<Object>} Workflow JSON
   */
  async loadWorkflow(workflowPath) {
    try {
      console.log(`Attempting to load workflow from: ${workflowPath}`);
      
      // If workflowPath is already an object, return it
      if (typeof workflowPath === 'object') {
        console.log('Workflow provided as object, using directly');
        return workflowPath;
      }
      
      // Otherwise, fetch it
      console.log(`Fetching workflow from URL: ${workflowPath}`);
      const response = await fetch(workflowPath);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch workflow: ${response.status} ${response.statusText}`);
        console.error(`Response body: ${errorText}`);
        throw new Error(`Failed to fetch workflow: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
      }
      
      // Try to parse JSON response
      try {
        const workflow = await response.json();
        console.log('Workflow loaded successfully, structure:', 
          workflow.nodes ? `${workflow.nodes.length} nodes` : 'No nodes found',
          'Format:',
          workflow.nodes && workflow.nodes.length > 0 ? 'ComfyUI format' : 'Unknown format'
        );
        return workflow;
      } catch (jsonError) {
        console.error('Error parsing workflow JSON:', jsonError);
        const responseText = await response.text();
        console.error('Raw response:', responseText.substring(0, 500));
        throw new Error(`Invalid workflow JSON: ${jsonError.message}`);
      }
    } catch (error) {
      console.error(`❌ Error loading workflow from ${workflowPath}:`, error);
      // Re-throw with more context
      throw new Error(`Failed to load workflow: ${error.message}`);
    }
  }
  
  /**
   * Determine optimal dimensions for the image based on aspect ratio
   * @param {File} imageFile - Image file
   * @returns {Promise<{width: number, height: number}>} Optimal dimensions
   */
  async getOptimalDimensions(imageFile) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        const aspectRatio = width / height;
        console.log(`📐 Original image dimensions: ${width}x${height}, aspect ratio: ${aspectRatio.toFixed(2)}`);

        // Define target formats
        const LANDSCAPE = { width: 1024, height: 576 };  // 16:9
        const PORTRAIT = { width: 576, height: 1024 };   // 9:16
        const SQUARE = { width: 576, height: 576 };      // 1:1

        // Calculate differences from target ratios
        const landscapeDiff = Math.abs(aspectRatio - (16/9));
        const portraitDiff = Math.abs(aspectRatio - (9/16));
        const squareDiff = Math.abs(aspectRatio - 1);

        if (landscapeDiff <= Math.min(portraitDiff, squareDiff)) {
          console.log("🖼️ Selected landscape format (16:9)");
          resolve(LANDSCAPE);
        } else if (portraitDiff <= Math.min(landscapeDiff, squareDiff)) {
          console.log("🖼️ Selected portrait format (9:16)");
          resolve(PORTRAIT);
        } else {
          console.log("🖼️ Selected square format (1:1)");
          resolve(SQUARE);
        }
      };
      
      img.onerror = () => {
        console.error('❌ Error loading image for dimension analysis');
        resolve({ width: 576, height: 576 }); // Default to square
      };
      
      img.src = URL.createObjectURL(imageFile);
    });
  }
  
  /**
   * Update the workflow with image and audio information
   * @param {Object} workflow - Workflow JSON
   * @param {string} imageName - Uploaded image name
   * @param {File} audioFile - Audio file
   * @returns {Promise<Object>} Updated workflow
   */
  async updateWorkflow(workflow, imageName, audioFile) {
    // Make a copy of the workflow to avoid modifying the original
    const updatedWorkflow = JSON.parse(JSON.stringify(workflow));
    
    // Get audio duration (in browser we'll use the AudioContext)
    // We'll use this in future updates if needed
    await this.getAudioDuration(audioFile);
    
    // Get optimal dimensions for the image
    const dimensions = await this.getOptimalDimensions(audioFile);
    const optimalWidth = dimensions.width;
    const optimalHeight = dimensions.height;
    
    // Update the workflow nodes
    for (const nodeId in updatedWorkflow) {
      const node = updatedWorkflow[nodeId];
      
      // Update LoadImage node
      if (node.class_type === 'LoadImage') {
        node.inputs.image = imageName;
        console.log(`🖼️ Updated LoadImage node with image: ${imageName}`);
      }
      
      // Update Image Resize node
      if (node.class_type === 'Image Resize') {
        // Save original dimensions for logging
        const originalWidth = node.inputs.resize_width || 576;
        const originalHeight = node.inputs.resize_height || 576;
        
        // Update with optimal dimensions
        node.inputs.resize_width = optimalWidth;
        node.inputs.resize_height = optimalHeight;
        
        console.log(`📐 Updated Image Resize dimensions from ${originalWidth}x${originalHeight} to ${optimalWidth}x${optimalHeight}`);
      }
      
      // Update the LoadAudio or VHS_LoadAudio node with the audio path
      if (['LoadAudio', 'VHS_LoadAudio'].includes(node.class_type)) {
        // Handle different node structures
        if ('audio' in node.inputs) {
          node.inputs.audio = audioFile.name;
        } else if ('audio_file' in node.inputs) {
          node.inputs.audio_file = `input/${audioFile.name}`;
        }
        console.log(`🔊 Updated audio node with: ${audioFile.name}`);
      }
    }
    
    return updatedWorkflow;
  }
  
  /**
   * Get the duration of an audio file in seconds
   * @param {File} audioFile - Audio file
   * @returns {Promise<number>} Audio duration in seconds
   */
  async getAudioDuration(audioFile) {
    return new Promise((resolve, reject) => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const reader = new FileReader();
      
      reader.onload = function(e) {
        audioContext.decodeAudioData(e.target.result, function(buffer) {
          // Get the raw duration in seconds
          const rawDuration = buffer.duration;
          
          // Round up to the next second
          const roundedDuration = Math.ceil(rawDuration);
          
          // Add 1 second safety margin
          const finalDuration = roundedDuration + 1;
          
          console.log(`⏱️ Audio duration: ${rawDuration.toFixed(2)}s → ${finalDuration}s (rounded up + safety margin)`);
          resolve(finalDuration);
        }, function(err) {
          console.error('Error decoding audio data', err);
          resolve(5); // Default duration if we can't decode
        });
      };
      
      reader.onerror = function(err) {
        console.error('Error reading audio file', err);
        resolve(5); // Default duration
      };
      
      reader.readAsArrayBuffer(audioFile);
    });
  }
  
  /**
   * Queue a workflow for execution
   * @param {Object} workflow - Workflow JSON
   * @returns {Promise<string|null>} Prompt ID or null if queueing failed
   */
  async queueWorkflow(workflow) {
    try {
      console.log('🚀 Queueing workflow');
      
      // Structure the payload - needs to match the format ComfyUI expects
      const payload = {
        prompt: workflow,
        client_id: this.clientId
      };
      
      console.log('Sending payload:', JSON.stringify(payload, null, 2));
      
      const response = await axios.post(
        `${this.serverUrl}/prompt`,
        payload,
        { headers: this._getHeaders() }
      );
      
      if (response.status === 200) {
        const result = response.data;
        const promptId = result.prompt_id;
        console.log(`✅ Workflow queued with ID: ${promptId}`);
        return promptId;
      } else {
        console.error(`❌ Failed to queue workflow: ${response.status} - ${response.data}`);
        return null;
      }
    } catch (error) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error(`❌ Server responded with error: ${error.response.status}`);
        console.error(`Error details: ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        // The request was made but no response was received
        console.error(`❌ No response received from server: ${error.request}`);
      } else {
        // Something happened in setting up the request
        console.error(`❌ Error setting up request: ${error.message}`);
      }
      return null;
    }
  }
  
  /**
   * Get the history for a specific prompt
   * @param {string} promptId - Prompt ID
   * @returns {Promise<Object|null>} History data or null if retrieval failed
   */
  async getHistory(promptId, retries = 3, retryDelay = 2000) {
    const historyUrl = `${this.serverUrl}/history/${promptId}`;
    
    let attempt = 0;
    while (attempt < retries) {
      try {
        const response = await axios.get(historyUrl, {
          headers: this._getHeaders()
        });
        
        if (response.status === 200) {
          return response.data;
        } else {
          console.warn(`⚠️ Failed to get history (attempt ${attempt + 1}): ${response.status}`);
        }
      } catch (error) {
        console.warn(`⚠️ Exception getting history (attempt ${attempt + 1}): ${error.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      attempt++;
    }
    
    console.error(`❌ Failed to get history after ${retries} attempts`);
    return null;
  }
  
  /**
   * Check the status of a workflow execution
   * @param {string} promptId - Prompt ID
   * @returns {Promise<{ status: string, outputs: Object|null, completedNodeCount: number, expectedNodeCount: number }>} Status and outputs
   */
  async checkWorkflowStatus(promptId) {
    try {
      const history = await this.getHistory(promptId);
      
      if (!history) {
        return { status: 'error', outputs: null, completedNodeCount: 0, expectedNodeCount: 0 };
      }
      
      // Check if the history contains the prompt
      const promptData = history[promptId] || history;
      
      if (!promptData) {
        return { status: 'pending', outputs: null, completedNodeCount: 0, expectedNodeCount: 0 };
      }
      
      // Check prompt status from status field
      if (promptData.status && promptData.status.status_str === 'error') {
        console.error(`❌ Error in workflow execution: ${JSON.stringify(promptData.status)}`);
        return { status: 'error', outputs: null, completedNodeCount: 0, expectedNodeCount: 0 };
      }
      
      if (promptData.status && promptData.status.completed) {
        console.log(`✅ Workflow marked as completed in status field`);
        return { 
          status: 'completed', 
          outputs: promptData.outputs || {}, 
          completedNodeCount: Object.keys(promptData.outputs || {}).length,
          expectedNodeCount: Object.keys(promptData.prompt || {}).length
        };
      }
      
      // Check if the workflow is still in the queue
      try {
        const queueResponse = await axios.get(
          `${this.serverUrl}/queue`,
          { headers: this._getHeaders() }
        );
        
        if (queueResponse.status === 200) {
          const queueData = queueResponse.data;
          
          // Check if our prompt is in the queue
          const runningPrompts = (queueData.queue_running || []).map(item => item.prompt_id);
          const pendingPrompts = (queueData.queue_pending || []).map(item => item.prompt_id);
          
          if (runningPrompts.includes(promptId)) {
            console.log(`⏳ Workflow is currently running...`);
            return { 
              status: 'processing', 
              outputs: null,
              completedNodeCount: 0,
              expectedNodeCount: Object.keys(promptData.prompt || {}).length,
            };
          }
          
          if (pendingPrompts.includes(promptId)) {
            console.log(`⏳ Workflow is pending in queue...`);
            return { 
              status: 'pending', 
              outputs: null,
              completedNodeCount: 0,
              expectedNodeCount: Object.keys(promptData.prompt || {}).length,
            };
          }
          
          // If we have outputs and we're not in any queue, consider it complete
          if (promptData.outputs && Object.keys(promptData.outputs).length > 0) {
            console.log('✅ Workflow has outputs and is not in queue, considering complete');
            return { 
              status: 'completed', 
              outputs: promptData.outputs,
              completedNodeCount: Object.keys(promptData.outputs).length,
              expectedNodeCount: Object.keys(promptData.prompt || {}).length,
            };
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error checking queue status: ${error.message}`);
        // Continue with other checks even if queue check fails
      }
      
      // Check for errors in the nodes
      const nodes = promptData.outputs || {};
      const nodeIds = Object.keys(nodes);
      
      for (const nodeId of nodeIds) {
        const node = nodes[nodeId];
        
        if (node.error) {
          console.error(`❌ Error in node ${nodeId}: ${node.error}`);
          return { 
            status: 'error', 
            outputs: null,
            completedNodeCount: nodeIds.length,
            expectedNodeCount: Object.keys(promptData.prompt || {}).length,
          };
        }
      }
      
      // Check if all nodes have completed (fallback to old method)
      const expectedNodeCount = Object.keys(promptData.prompt || {}).length;
      const completedNodeCount = nodeIds.length;
      
      // If we have at least some nodes completed but not all, it's in progress
      if (completedNodeCount > 0 && completedNodeCount < expectedNodeCount) {
        const progress = Math.round((completedNodeCount / expectedNodeCount) * 100);
        console.log(`⏳ Workflow in progress: ${progress}% (${completedNodeCount}/${expectedNodeCount} nodes)`);
        return { 
          status: 'processing', 
          outputs: null,
          completedNodeCount: completedNodeCount,
          expectedNodeCount: expectedNodeCount,
        };
      }
      
      // Execution is still in progress with no completed nodes
      console.log(`⏳ Workflow execution in progress: No completed nodes yet`);
      return { 
        status: 'processing', 
        outputs: null,
        completedNodeCount: 0,
        expectedNodeCount: expectedNodeCount,
      };
    } catch (error) {
      console.error(`❌ Error checking workflow status: ${error.message}`);
      return { 
        status: 'error', 
        outputs: null,
        completedNodeCount: 0,
        expectedNodeCount: 0,
      };
    }
  }
  
  /**
   * Get the output files from a completed workflow
   * @param {string} promptId - Prompt ID
   * @returns {Promise<Array|null>} Array of output files or null if retrieval failed
   */
  async getOutputFiles(promptId) {
    try {
      // Get the history
      const history = await this.getHistory(promptId);
      
      if (!history) {
        console.error('No history found for prompt ID:', promptId);
        return null;
      }
      
      // Direct access or via the prompt ID
      const promptData = history[promptId] || history;
      
      // Check if we have outputs
      if (!promptData.outputs) {
        console.error('No outputs found in history');
        return null;
      }
      
      const outputs = promptData.outputs;
      const outputFiles = [];
      
      // Process all output nodes
      for (const nodeId in outputs) {
        const node = outputs[nodeId];
        
        // Process images in this node
        if (node.images) {
          for (const image of node.images) {
            // Create the correct URL
            let imageUrl = `${this.originalServerUrl}/view?filename=${encodeURIComponent(image.filename)}`;
            if (image.type) {
              imageUrl += `&type=${encodeURIComponent(image.type)}`;
            }
            if (image.subfolder) {
              imageUrl += `&subfolder=${encodeURIComponent(image.subfolder)}`;
            }
            
            outputFiles.push({
              type: 'image',
              node_id: nodeId,
              filename: image.filename,
              subfolder: image.subfolder || '',
              url: imageUrl
            });
            
            console.log(`Found image: ${image.filename}`);
          }
        }
        
        // Process videos in this node (both videos and gifs arrays)
        if (node.videos) {
          for (const video of node.videos) {
            const videoUrl = `${this.originalServerUrl}/view?filename=${encodeURIComponent(video.filename)}&type=output${video.subfolder ? `&subfolder=${encodeURIComponent(video.subfolder)}` : ''}`;
            outputFiles.push({
              type: 'video',
              node_id: nodeId,
              filename: video.filename,
              subfolder: video.subfolder || '',
              url: videoUrl
            });
            console.log(`Found video: ${video.filename}`);
          }
        }
        
        // Process gifs in this node (ComfyUI often puts videos in the gifs array)
        if (node.gifs) {
          for (const video of node.gifs) {
            const videoUrl = `${this.originalServerUrl}/view?filename=${encodeURIComponent(video.filename)}&type=output${video.subfolder ? `&subfolder=${encodeURIComponent(video.subfolder)}` : ''}`;
            outputFiles.push({
              type: 'video',
              node_id: nodeId,
              filename: video.filename,
              subfolder: video.subfolder || '',
              url: videoUrl
            });
            console.log(`Found video (from gifs array): ${video.filename}`);
          }
        }
      }
      
      console.log(`Found ${outputFiles.length} output files`);
      
      if (outputFiles.length === 0) {
        console.warn('No output files found');
        return null;
      }
      
      return outputFiles;
    } catch (error) {
      console.error('Error getting output files:', error);
      return null;
    }
  }
  
  /**
   * Download a file from the server
   * @param {string} url - URL to download
   * @returns {Promise<string|null>} Blob URL to the downloaded file or null if download failed
   */
  async downloadFile(url) {
    if (!url) {
      console.error('Download failed: URL is undefined or null');
      return null;
    }
    
    // Replace the original URL with the proxied URL
    console.log('Original URL:', url);
    const proxiedUrl = url.replace(this.originalServerUrl, this.serverUrl);
    console.log('Proxied URL:', proxiedUrl);
    
    try {
      console.log('Attempting to download file from:', proxiedUrl);
      const response = await axios.get(proxiedUrl, {
        headers: this._getHeaders(),
        responseType: 'blob'
      });
      
      if (response.status === 200) {
        // Create a blob URL for the downloaded file
        const blob = new Blob([response.data], { type: response.headers['content-type'] });
        const blobUrl = URL.createObjectURL(blob);
        
        console.log('File downloaded successfully, blob URL created');
        return blobUrl;
      } else {
        console.error(`Download failed: ${response.status} - ${response.statusText}`);
        return null;
      }
    } catch (error) {
      console.error('Exception during download:');
      if (error.response) {
        console.error('Response error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data
        });
      } else if (error.request) {
        console.error('Request error (no response received):', error.request);
      } else {
        console.error('Error details:', error.message);
      }
      console.error('Full error:', error);
      return null;
    }
  }
  
  /**
   * Wait for a workflow to complete
   * @param {string} promptId - Prompt ID
   * @param {number} timeoutMinutes - Timeout in minutes
   * @param {function} progressCallback - Callback for progress updates
   * @returns {Promise<boolean>} True if workflow completed successfully, false otherwise
   */
  async waitForWorkflowCompletion(promptId, timeoutMinutes = 15, progressCallback = null) {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const startTime = Date.now();
    const checkIntervalMs = config.CHECK_INTERVAL_SECONDS * 1000;
    
    // Wait for initial server processing time
    await new Promise(resolve => setTimeout(resolve, config.INITIAL_WAIT_SECONDS * 1000));
    
    // Keep track of how many times we've checked and how many successful checks we've had
    let checkCount = 0;
    let successCount = 0;
    
    while (Date.now() - startTime < timeoutMs) {
      checkCount++;
      const result = await this.checkWorkflowStatus(promptId);
      
      if (progressCallback) {
        progressCallback({
          ...result,
          checkCount,
          elapsedTime: Math.round((Date.now() - startTime) / 1000)
        });
      }
      
      if (result.status === 'completed') {
        // Sometimes the API can mistakenly report completion,
        // so we'll wait for a few consecutive successful checks
        successCount++;
        
        if (successCount >= 2) {
          console.log(`✅ Workflow completion confirmed after ${checkCount} checks`);
          return true;
        }
        
        // Wait a short time before checking again to confirm completion
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      } else {
        // Reset success count if we get a non-completed status
        successCount = 0;
      }
      
      if (result.status === 'error') {
        console.error('❌ Workflow execution failed with error');
        return false;
      }
      
      // Calculate progress based on completed nodes
      const progress = result.completedNodeCount > 0 && result.expectedNodeCount > 0
        ? Math.min(95, Math.floor((result.completedNodeCount / result.expectedNodeCount) * 100))
        : Math.min(40, Math.floor(((Date.now() - startTime) / timeoutMs) * 100));
      
      console.log(`⏳ Workflow in progress... ${progress}% (Check ${checkCount})`);
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }
    
    console.error(`⏱️ Workflow execution timed out after ${timeoutMinutes} minutes`);
    return false;
  }
  
  /**
   * Update a text-to-image workflow with the given parameters
   * @param {Object} workflow - Workflow JSON
   * @param {string} positivePrompt - Positive prompt text
   * @param {string} negativePrompt - Negative prompt text
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} seed - Random seed
   * @param {number} steps - Number of sampling steps
   * @returns {Object} Updated workflow
   */
  updateTextToImageWorkflow(workflow, positivePrompt, negativePrompt, width = 1024, height = 1024, seed = null, steps = 35) {
    // Validate input workflow
    const validation = this.validateWorkflow(workflow);
    if (!validation.valid) {
      const errorMessage = `Invalid workflow: ${validation.errors.join(', ')}`;
      console.error('❌ ' + errorMessage);
      throw new Error(errorMessage);
    }

    console.log(`Updating workflow with parameters: prompt=${positivePrompt.slice(0, 20)}..., negativePrompt=${negativePrompt.slice(0, 20)}..., width=${width}, height=${height}, seed=${seed}, steps=${steps}`);
    
    // Make a copy of the workflow to avoid modifying the original
    const updatedWorkflow = JSON.parse(JSON.stringify(workflow));
    
    // Diagnostic info
    console.log(`Workflow contains ${updatedWorkflow.nodes.length} nodes`);
    
    let positiveNodeFound = false;
    let negativeNodeFound = false;
    let samplerNodeFound = false;
    let latentNodeFound = false;
    
    // Find nodes by their titles or types
    updatedWorkflow.nodes.forEach(node => {
      console.log(`Inspecting node: id=${node.id}, type=${node.type}, title=${node.title || 'N/A'}`);
      
      // Update positive prompt
      if (node.type === 'CLIPTextEncode' && node.title === 'Positive Prompt' && node.widgets_values) {
        node.widgets_values[0] = positivePrompt;
        console.log('✅ Updated positive prompt');
        positiveNodeFound = true;
      }
      
      // Update negative prompt
      if (node.type === 'CLIPTextEncode' && node.title === 'Negative Prompt' && node.widgets_values) {
        node.widgets_values[0] = negativePrompt;
        console.log('✅ Updated negative prompt');
        negativeNodeFound = true;
      }
      
      // Update KSampler settings
      if (node.type === 'KSampler' && node.widgets_values) {
        console.log(`Found KSampler node with widgets: ${JSON.stringify(node.widgets_values)}`);
        // Check widget structure based on the workflow
        // Typical order: seed, steps, cfg, sampler_name, scheduler, denoise
        if (seed !== null && node.widgets_values.length > 0) {
          node.widgets_values[0] = seed;
          console.log(`⚙️ Updated KSampler seed to ${seed}`);
        }
        
        if (node.widgets_values.length > 1) {
          node.widgets_values[1] = steps;
          console.log(`⚙️ Updated KSampler steps to ${steps}`);
        }
        samplerNodeFound = true;
      }
      
      // Update SD3 Sampler settings (if present)
      if (node.type === 'SONICSampler' && node.widgets_values) {
        console.log(`Found SONICSampler node with widgets: ${JSON.stringify(node.widgets_values)}`);
        // Update relevant settings based on the workflow structure
        if (seed !== null) {
          // Find the seed value widget index
          const seedIndex = 0; // Adjust based on actual workflow
          if (node.widgets_values.length > seedIndex) {
            node.widgets_values[seedIndex] = seed;
            console.log(`⚙️ Updated SONICSampler seed to ${seed}`);
          }
        }
        
        // Find the steps value widget index
        const stepsIndex = 1; // Adjust based on actual workflow
        if (node.widgets_values.length > stepsIndex) {
          node.widgets_values[stepsIndex] = steps;
          console.log(`⚙️ Updated SONICSampler steps to ${steps}`);
        }
        samplerNodeFound = true;
      }
      
      // Update latent image dimensions
      if (node.type === 'EmptySD3LatentImage' && node.widgets_values) {
        console.log(`Found EmptySD3LatentImage node with widgets: ${JSON.stringify(node.widgets_values)}`);
        if (node.widgets_values.length >= 2) {
          node.widgets_values[0] = width;
          node.widgets_values[1] = height;
          console.log(`📐 Updated image dimensions to ${width}x${height}`);
          latentNodeFound = true;
        }
      }
      
      // Also check for EmptyLatentImage for backwards compatibility
      if (node.type === 'EmptyLatentImage' && node.widgets_values) {
        console.log(`Found EmptyLatentImage node with widgets: ${JSON.stringify(node.widgets_values)}`);
        if (node.widgets_values.length >= 2) {
          node.widgets_values[0] = width;
          node.widgets_values[1] = height;
          console.log(`📐 Updated image dimensions to ${width}x${height}`);
          latentNodeFound = true;
        }
      }
      
      // Update the SaveImage node if present
      if (node.type === 'SaveImage' && node.widgets_values) {
        // Generate a unique filename based on the prompt (truncated) and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const promptSlug = positivePrompt.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${promptSlug}_${timestamp}`;
        
        // Update the filename widget value (assuming it's the first widget)
        if (node.widgets_values.length > 0) {
          node.widgets_values[0] = filename;
          console.log(`💾 Updated save filename to: ${filename}`);
        }
      }
    });
    
    // Log whether all required nodes were found
    console.log(`Required nodes found: positive=${positiveNodeFound}, negative=${negativeNodeFound}, sampler=${samplerNodeFound}, latent=${latentNodeFound}`);
    
    if (!positiveNodeFound) {
      console.warn('⚠️ Positive prompt node not found in workflow');
    }
    
    if (!negativeNodeFound) {
      console.warn('⚠️ Negative prompt node not found in workflow');
    }
    
    if (!samplerNodeFound) {
      console.warn('⚠️ Sampler node (KSampler or SONICSampler) not found in workflow');
    }
    
    if (!latentNodeFound) {
      console.warn('⚠️ Latent image node not found in workflow');
    }
    
    return updatedWorkflow;
  }
  
  /**
   * Get a direct URL to an image file on the server
   * @param {string} filename - Image filename
   * @param {string} subfolder - Subfolder (optional)
   * @returns {string} Image URL
   */
  getImageUrl(filename, subfolder = '') {
    // Base URL for the image view endpoint
    let imageUrl = `${this.serverUrl}/view?filename=${encodeURIComponent(filename)}`;
    
    // Add subfolder if provided
    if (subfolder) {
      imageUrl += `&subfolder=${encodeURIComponent(subfolder)}`;
    }
    
    // Add type=output for output files
    if (subfolder.includes('output') || filename.includes('.png') || filename.includes('.jpg')) {
      imageUrl += '&type=output';
    }
    
    console.log(`🔗 Generated image URL: ${imageUrl}`);
    return imageUrl;
  }
  
  /**
   * Validate that a workflow has the required structure and nodes
   * @param {Object} workflow - The workflow to validate
   * @returns {Object} Validation result: { valid: boolean, errors: string[] }
   */
  validateWorkflow(workflow) {
    const errors = [];
    
    if (!workflow) {
      errors.push('Workflow is null or undefined');
      return { valid: false, errors };
    }
    
    if (typeof workflow !== 'object') {
      errors.push(`Workflow is not an object: ${typeof workflow}`);
      return { valid: false, errors };
    }
    
    // Check if workflow has nodes array
    if (!workflow.nodes) {
      errors.push('Workflow is missing "nodes" property');
    } else if (!Array.isArray(workflow.nodes)) {
      errors.push(`Workflow "nodes" is not an array: ${typeof workflow.nodes}`);
    } else if (workflow.nodes.length === 0) {
      errors.push('Workflow "nodes" array is empty');
    }
    
    // If nodes exist, check for required node types
    if (workflow.nodes && Array.isArray(workflow.nodes)) {
      // Check for required node types
      const nodeTypes = workflow.nodes.map(node => node.type);
      
      // Count nodes by type or title
      let positivePromptCount = 0;
      let negativePromptCount = 0;
      let samplerCount = 0;
      let latentImageCount = 0;
      
      for (const node of workflow.nodes) {
        if (node.type === 'CLIPTextEncode' && node.title === 'Positive Prompt') {
          positivePromptCount++;
        } else if (node.type === 'CLIPTextEncode' && node.title === 'Negative Prompt') {
          negativePromptCount++;
        } else if (node.type === 'KSampler' || node.type === 'SONICSampler') {
          samplerCount++;
        } else if (node.type === 'EmptySD3LatentImage' || node.type === 'EmptyLatentImage') {
          latentImageCount++;
        }
      }
      
      // Report missing required nodes
      if (positivePromptCount === 0) {
        errors.push('Workflow is missing positive prompt node (CLIPTextEncode with title "Positive Prompt")');
      }
      
      if (negativePromptCount === 0) {
        errors.push('Workflow is missing negative prompt node (CLIPTextEncode with title "Negative Prompt")');
      }
      
      if (samplerCount === 0) {
        errors.push('Workflow is missing sampler node (KSampler or SONICSampler)');
      }
      
      if (latentImageCount === 0) {
        errors.push('Workflow is missing latent image node (EmptySD3LatentImage or EmptyLatentImage)');
      }
      
      // Log node types for debugging
      console.log('Workflow node types:', nodeTypes.join(', '));
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export default ComfyUIClient; 