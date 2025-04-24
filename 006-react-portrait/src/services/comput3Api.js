import axios from 'axios';
import config from './config';

class Comput3API {
  /**
   * Client for interacting with Comput3 API
   * @param {string} apiKey - Comput3 API key
   */
  constructor(apiKey) {
    this.apiKey = apiKey;
    // Use relative path for the API URL to work with the proxy
    this.apiUrl = '/api/v0/workloads';
    
    if (!apiKey) {
      console.error('🔑 C3 API key is not provided. Please set your REACT_APP_C3_API_KEY in .env file.');
    }
  }
  
  /**
   * Get the headers for API requests
   * @returns {Object} Headers for API requests
   */
  getHeaders() {
    return {
      'accept': '/',
      'accept-language': 'en,en-US;q=0.9',
      'content-type': 'application/json',
      'origin': 'https://launch.comput3.ai',
      'referer': 'https://launch.comput3.ai/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      'x-c3-api-key': this.apiKey
    };
  }
  
  /**
   * Get all running workloads from Comput3 API
   * @returns {Promise<Array>} List of running workloads
   */
  async getRunningWorkloads() {
    if (!this.apiKey) {
      console.error('❌ Cannot get workloads: C3 API key is missing');
      return [];
    }
    
    try {
      const response = await axios.post(
        this.apiUrl,
        { running: true },
        { headers: this.getHeaders() }
      );
      
      if (response.status !== 200) {
        console.error(`❌ Failed to get workloads: ${response.status} - ${response.data}`);
        return [];
      }
      
      const workloads = response.data;
      console.log(`🔍 Found ${workloads.length} running workloads`);
      return workloads;
    } catch (error) {
      console.error(`❌ Error getting workloads: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Get a running media instance if available
   * @returns {Promise<Object|null>} Media instance or null if none found
   */
  async getMediaInstance() {
    const workloads = await this.getRunningWorkloads();
    
    // Filter for media instances
    const mediaInstances = workloads.filter(w => w.type && w.type.startsWith('media'));
    
    if (mediaInstances.length === 0) {
      console.warn('⚠️ No running media instances found');
      return null;
    }
    
    // Return the first media instance
    const instance = mediaInstances[0];
    console.log(`✅ Found media instance: ${instance.node} (type: ${instance.type})`);
    return instance;
  }
  
  /**
   * Get the ComfyUI URL for a running media instance
   * @returns {Promise<string|null>} ComfyUI URL or null if no instance found
   */
  async getComfyuiUrl() {
    const instance = await this.getMediaInstance();
    
    if (!instance || !instance.node) {
      return null;
    }
    
    const node = instance.node;
    const comfyuiUrl = `https://ui-${node}`;
    console.log(`🌐 ComfyUI URL: ${comfyuiUrl}`);
    return comfyuiUrl;
  }
}

export default Comput3API; 