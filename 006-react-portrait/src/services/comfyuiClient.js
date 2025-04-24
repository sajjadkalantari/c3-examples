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
      // If workflowPath is already an object, return it
      if (typeof workflowPath === 'object') {
        return workflowPath;
      }
      
      // Otherwise, fetch it
      const response = await fetch(workflowPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch workflow: ${response.status} ${response.statusText}`);
      }
      
      const workflow = await response.json();
      return workflow;
    } catch (error) {
      console.error(`❌ Error loading workflow from ${workflowPath}: ${error.message}`);
      throw error;
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
   * @returns {Promise<string|null>} Prompt ID or null if queuing failed
   */
  async queueWorkflow(workflow) {
    const queueUrl = `${this.serverUrl}/prompt`;
    
    try {
      const response = await axios.post(queueUrl, {
        prompt: workflow,
        client_id: this.clientId
      }, {
        headers: this._getHeaders()
      });
      
      if (response.status === 200) {
        const promptId = response.data.prompt_id;
        console.log(`✅ Workflow queued with prompt ID: ${promptId}`);
        return promptId;
      } else {
        console.error(`❌ Failed to queue workflow: ${response.status} - ${response.data}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Exception during workflow queuing: ${error.message}`);
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
   * @returns {Promise<{ status: string, outputs: Object|null }>} Status and outputs
   */
  async checkWorkflowStatus(promptId) {
    const history = await this.getHistory(promptId);
    
    if (!history) {
      return { status: 'error', outputs: null };
    }
    
    // Check if the history contains the prompt
    if (!history[promptId]) {
      return { status: 'pending', outputs: null };
    }
    
    const prompt = history[promptId];
    
    // Check for errors in the nodes
    const nodes = prompt.outputs || {};
    const nodeIds = Object.keys(nodes);
    
    for (const nodeId of nodeIds) {
      const node = nodes[nodeId];
      
      if (node.error) {
        console.error(`❌ Error in node ${nodeId}: ${node.error}`);
        return { status: 'error', outputs: null };
      }
    }
    
    // Check if all nodes have completed
    const expectedNodeCount = Object.keys(prompt.prompt).length;
    const completedNodeCount = nodeIds.length;
    
    if (completedNodeCount < expectedNodeCount) {
      const progress = Math.round((completedNodeCount / expectedNodeCount) * 100);
      console.log(`⏳ Workflow in progress: ${progress}% (${completedNodeCount}/${expectedNodeCount} nodes)`);
      return { status: 'processing', outputs: null };
    }
    
    // Workflow completed successfully
    console.log(`✅ Workflow completed successfully`);
    return { status: 'completed', outputs: nodes };
  }
  
  /**
   * Get the output files from a completed workflow
   * @param {string} promptId - Prompt ID
   * @returns {Promise<Array|null>} Array of output files or null if retrieval failed
   */
  async getOutputFiles(promptId) {
    const result = await this.checkWorkflowStatus(promptId);
    
    if (result.status !== 'completed' || !result.outputs) {
      return null;
    }
    
    const outputs = result.outputs;
    const outputFiles = [];
    
    // Process all output nodes
    for (const nodeId in outputs) {
      const node = outputs[nodeId];
      
      // Process images in this node
      if (node.images) {
        for (const image of node.images) {
          const originalUrl = `${this.originalServerUrl}/view?filename=${encodeURIComponent(image.filename)}&type=output${image.subfolder ? `&subfolder=${encodeURIComponent(image.subfolder)}` : ''}`;
          outputFiles.push({
            type: 'image',
            node_id: nodeId,
            filename: image.filename,
            subfolder: image.subfolder || '',
            url: originalUrl
          });
        }
      }
      
      // Process videos in this node
      if (node.videos) {
        for (const video of node.videos) {
          const originalUrl = `${this.originalServerUrl}/view?filename=${encodeURIComponent(video.filename)}&type=output${video.subfolder ? `&subfolder=${encodeURIComponent(video.subfolder)}` : ''}`;
          outputFiles.push({
            type: 'video',
            node_id: nodeId,
            filename: video.filename,
            subfolder: video.subfolder || '',
            url: originalUrl
          });
        }
      }
    }
    
    if (outputFiles.length === 0) {
      console.warn('⚠️ No output files found in completed workflow');
      return null;
    }
    
    console.log(`🔍 Found ${outputFiles.length} output files`);
    return outputFiles;
  }
  
  /**
   * Download a file from the server
   * @param {string} url - URL to download
   * @returns {Promise<string|null>} Blob URL to the downloaded file or null if download failed
   */
  async downloadFile(url) {
    // Replace the original URL with the proxied URL
    const proxiedUrl = url.replace(this.originalServerUrl, this.serverUrl);
    
    try {
      const response = await axios.get(proxiedUrl, {
        headers: this._getHeaders(),
        responseType: 'blob'
      });
      
      if (response.status === 200) {
        // Create a blob URL for the downloaded file
        const blob = new Blob([response.data], { type: response.headers['content-type'] });
        const blobUrl = URL.createObjectURL(blob);
        
        console.log(`✅ File downloaded successfully`);
        return blobUrl;
      } else {
        console.error(`❌ Download failed: ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Exception during download: ${error.message}`);
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
    
    while (Date.now() - startTime < timeoutMs) {
      const result = await this.checkWorkflowStatus(promptId);
      
      if (progressCallback) {
        progressCallback(result);
      }
      
      if (result.status === 'completed') {
        return true;
      } else if (result.status === 'error') {
        return false;
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }
    
    console.error(`⏱️ Workflow execution timed out after ${timeoutMinutes} minutes`);
    return false;
  }
}

export default ComfyUIClient; 