import os
import requests
import json
import time
import logging
import uuid
from typing import Optional, Dict, Any, List, Tuple

logger = logging.getLogger(__name__)

class ComfyUIClient:
    """Client for interacting with ComfyUI API through Comput3"""
    
    def __init__(self, server_url: str, api_key: str):
        """Initialize with ComfyUI server URL and Comput3 API key"""
        self.server_url = server_url.rstrip('/')
        self.api_key = api_key
        self.client_id = self._get_client_id()
        logger.info(f"🔌 Initialized ComfyUIClient with server URL: {self.server_url}")
    
    def _get_client_id(self) -> str:
        """Get a client ID from the server or generate one if the endpoint doesn't exist"""
        try:
            # Try to get a client ID from the server
            response = requests.get(
                f"{self.server_url}/prompt/get_client_id",
                headers=self._get_headers()
            )
            if response.status_code == 200:
                return response.json()["client_id"]
            
            # If the endpoint doesn't exist (404), generate our own client ID
            return str(uuid.uuid4())
        except Exception as e:
            logger.warning(f"⚠️ Failed to get client ID: {str(e)}")
            return str(uuid.uuid4())
    
    def _get_headers(self) -> Dict[str, str]:
        """Get headers with Comput3 API key"""
        return {
            "X-C3-API-KEY": self.api_key
        }
    
    def upload_file(self, file_path: str, file_type: str = "input") -> Optional[str]:
        """Upload a file to the ComfyUI server"""
        if not os.path.exists(file_path):
            logger.error(f"❌ File not found: {file_path}")
            return None
        
        filename = os.path.basename(file_path)
        logger.info(f"📤 Uploading file: {filename}")
        
        # Always use the /upload/image endpoint since there's no /upload/audio
        upload_url = f"{self.server_url}/upload/image"
        
        try:
            with open(file_path, 'rb') as f:
                files = {'image': (filename, f)}
                data = {'type': file_type}
                
                response = requests.post(upload_url, files=files, data=data, headers=self._get_headers())
                
                if response.status_code == 200:
                    response_data = response.json()
                    logger.info(f"✅ File uploaded successfully: {response_data.get('name')}")
                    return response_data.get('name')
                else:
                    logger.error(f"❌ Upload failed: {response.status_code} - {response.text}")
                    return None
        except Exception as e:
            logger.error(f"❌ Exception during upload: {str(e)}")
            return None
    
    def load_workflow(self, workflow_path: str) -> Dict[str, Any]:
        """Load a workflow from a JSON file"""
        try:
            # Explicitly use UTF-8 encoding to avoid character decoding issues
            with open(workflow_path, 'r', encoding='utf-8') as f:
                workflow = json.load(f)
            return workflow
        except Exception as e:
            logger.error(f"❌ Error loading workflow from {workflow_path}: {str(e)}")
            raise
    
    def update_workflow(self, workflow: Dict[str, Any], prompt: str) -> Dict[str, Any]:
        """Update the workflow with the text prompt"""
        # Make a copy of the workflow to avoid modifying the original
        updated_workflow = json.loads(json.dumps(workflow))
        
        # Flag to track if we found and updated the prompt
        prompt_updated = False
        
        # Update text encoding nodes with the prompt
        if "nodes" in updated_workflow:
            if isinstance(updated_workflow["nodes"], list):
                # Handle nodes as a list
                for node in updated_workflow["nodes"]:
                    # Look for the WanVideoTextEncode node (node ID 16 in the template workflow)
                    if node.get("type") == "WanVideoTextEncode":
                        # Update the positive prompt
                        if "widgets_values" in node and len(node["widgets_values"]) >= 1:
                            node["widgets_values"][0] = prompt
                            logger.info(f"✏️ Updated text prompt: {prompt[:50]}...")
                            prompt_updated = True
            elif isinstance(updated_workflow["nodes"], dict):
                # Handle nodes as a dictionary
                for _, node in updated_workflow["nodes"].items():
                    # Look for the WanVideoTextEncode node
                    if node.get("type") == "WanVideoTextEncode":
                        # Update the positive prompt
                        if "widgets_values" in node and len(node["widgets_values"]) >= 1:
                            node["widgets_values"][0] = prompt
                            logger.info(f"✏️ Updated text prompt: {prompt[:50]}...")
                            prompt_updated = True
        
        if not prompt_updated:
            logger.warning("⚠️ Could not find WanVideoTextEncode node to update prompt")
        
        return updated_workflow

    def queue_workflow(self, workflow: Dict[str, Any]) -> Optional[str]:
        """Queue a workflow for execution"""
        try:
            logger.info("🚀 Queueing workflow")
            
            # Extract the prompt from the workflow
            prompt = ""
            if "nodes" in workflow and isinstance(workflow["nodes"], list):
                for node in workflow["nodes"]:
                    if node.get("type") == "WanVideoTextEncode" and "widgets_values" in node and len(node["widgets_values"]) >= 1:
                        prompt = node["widgets_values"][0]
                        break
            
            if not prompt:
                logger.error("❌ Could not find text prompt in workflow")
                return None
            
            negative_prompt = "poor quality, blurry, pixelated, low resolution, watermark, signature, text, letters, words"
            
            # Create a simplified API-compatible workflow with minimal nodes
            api_workflow = {}
            
            # Build a simple workflow with required nodes
            # 1. T5 Encoder
            api_workflow["1"] = {
                "class_type": "LoadWanVideoT5TextEncoder",
                "inputs": {
                    "model_name": "umt5-xxl-enc-bf16.safetensors",
                    "precision": "bf16",
                    "offload_model": "offload_device",
                    "offload_type": "disabled"
                }
            }
            
            # 2. Text Encoder
            api_workflow["2"] = {
                "class_type": "WanVideoTextEncode",
                "inputs": {
                    "t5": ["1", 0],
                    "positive_prompt": prompt,
                    "negative_prompt": negative_prompt,
                    "force_zeros": True
                }
            }
            
            # 3. Empty Embeds
            api_workflow["3"] = {
                "class_type": "WanVideoEmptyEmbeds",
                "inputs": {
                    "width": 832,
                    "height": 480,
                    "num_frames": 16
                }
            }
            
            # 4. Block Swap - blocks_to_swap must be an integer, not a string
            api_workflow["4"] = {
                "class_type": "WanVideoBlockSwap",
                "inputs": {
                    "blocks_to_swap": 20,  # Use a numeric value (int) instead of "xnxnnn"
                    "offload_txt_emb": True,
                    "offload_img_emb": True
                }
            }
            
            # 5. Model Loader
            api_workflow["5"] = {
                "class_type": "WanVideoModelLoader",
                "inputs": {
                    "block_swap_args": ["4", 0],
                    # Use a model from the valid list
                    "model": "WanVideo/Wan2_1-T2V-14B_fp8_e4m3fn.safetensors",
                    "base_precision": "fp16",
                    "load_device": "main_device",  # Changed from "cuda" to "main_device"
                    "quantization": "disabled"  # Changed from "none" to "disabled"
                }
            }
            
            # 6. VAE Loader
            api_workflow["6"] = {
                "class_type": "WanVideoVAELoader",
                "inputs": {
                    "model_name": "wan_2.1_vae.safetensors"  # Changed from "sdvae.safetensors" to a valid model
                }
            }
            
            # 7. Tea Cache
            api_workflow["7"] = {
                "class_type": "WanVideoTeaCache",
                "inputs": {
                    "start_step": 0.1,
                    "end_step": 0.7,
                    "rel_l1_thresh": 0.97,
                    "use_coefficients": False,
                    "cache_device": "offload_device"  # Changed from "cuda" to "offload_device"
                }
            }
            
            # 8. Sampler
            api_workflow["8"] = {
                "class_type": "WanVideoSampler",
                "inputs": {
                    "model": ["5", 0],
                    "text_embeds": ["2", 0],
                    "image_embeds": ["3", 0],
                    "teacache_args": ["7", 0],
                    "steps": 25,
                    "cfg": 6.0,
                    "seed": int(time.time() * 1000) % (2**32),
                    "scheduler": "unipc",
                    "shift": 5,
                    "force_offload": False,
                    "riflex_freq_index": 0
                }
            }
            
            # 9. Decoder
            api_workflow["9"] = {
                "class_type": "WanVideoDecode",
                "inputs": {
                    "vae": ["6", 0],
                    "samples": ["8", 0],
                    "restore_faces": True,
                    "tile_x": 272,
                    "tile_y": 272,
                    "tile_stride_x": 144,
                    "tile_stride_y": 128,
                    "enable_vae_tiling": True  # Added missing required parameter
                }
            }
            
            # 10. Video Combiner
            api_workflow["10"] = {
                "class_type": "VHS_VideoCombine",
                "inputs": {
                    "images": ["9", 0],
                    "frame_rate": 24,
                    "loop_count": 0,
                    "filename_prefix": "video_output",
                    "format": "video/h264-mp4",
                    "pingpong": False,
                    "save_output": True
                }
            }
            
            # Structure the payload
            payload = {
                "prompt": api_workflow,
                "client_id": self.client_id
            }
            
            # For debugging - Save the payload to a file
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as f:
                json.dump(payload, f, indent=2)
                logger.debug(f"Wrote payload to {f.name}")
            
            # Add a small delay before API call to prevent rate limiting
            time.sleep(1)
            
            # Retry mechanism for API call
            max_retries = 3
            retry_delay = 2
            
            for retry in range(max_retries):
                try:
                    logger.debug(f"Attempt {retry + 1} of {max_retries} to queue workflow")
                    
                    response = requests.post(
                        f"{self.server_url}/prompt",
                        json=payload,
                        headers=self._get_headers(),
                        timeout=30  # Set a timeout
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        prompt_id = result.get("prompt_id")
                        logger.info(f"✅ Workflow queued with ID: {prompt_id}")
                        return prompt_id
                    else:
                        logger.error(f"❌ Failed to queue workflow: {response.status_code} - {response.text}")
                        if retry < max_retries - 1:
                            logger.info(f"Retrying in {retry_delay} seconds...")
                            time.sleep(retry_delay)
                            retry_delay *= 2  # Exponential backoff
                        else:
                            return None
                
                except requests.RequestException as e:
                    logger.error(f"❌ Network error: {str(e)}")
                    if retry < max_retries - 1:
                        logger.info(f"Retrying in {retry_delay} seconds...")
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                    else:
                        return None
            
            return None
        
        except Exception as e:
            logger.error(f"❌ Error queueing workflow: {str(e)}")
            return None
    
    def check_workflow_status(self, prompt_id: str) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """
        Check the status of a workflow execution
        
        Returns:
            Tuple[bool, Dict, str]: 
                - is_complete: Whether the workflow execution is complete
                - history_data: The full history data if available
                - error_message: Error message if there was an error
        """
        try:
            url = f"{self.server_url}/history/{prompt_id}"
            response = requests.get(url, headers=self._get_headers())
            
            if response.status_code == 200:
                history_data = response.json()
                
                # Check if there's an error in the history
                if "error" in history_data:
                    error_msg = history_data.get("error", "Unknown error")
                    logger.error(f"❌ Workflow error: {error_msg}")
                    return True, history_data, error_msg
                
                # Check if all nodes have executed
                nodes_in_prompt = set()
                executed_nodes = set()
                
                # First collect all nodes in the prompt
                if "prompt" in history_data:
                    for node_id in history_data["prompt"]:
                        # Only add non-special nodes (that don't start with $)
                        if not node_id.startswith('$'):
                            nodes_in_prompt.add(node_id)
                
                # Then collect all executed nodes
                if "outputs" in history_data:
                    for node_id in history_data["outputs"]:
                        if not node_id.startswith('$'):
                            executed_nodes.add(node_id)
                
                # Check for output node 30 (VHS_VideoCombine in our workflow)
                is_complete = "30" in executed_nodes
                
                if is_complete:
                    logger.info("✅ Workflow execution complete")
                
                return is_complete, history_data, None
            
            else:
                logger.error(f"❌ Failed to get history: {response.status_code} - {response.text}")
                return False, None, f"API error: {response.status_code}"
                
        except Exception as e:
            logger.error(f"❌ Error checking workflow status: {str(e)}")
            return False, None, str(e)
    
    def get_output_files(self, prompt_id: str) -> List[Dict[str, Any]]:
        """Get the output files from a completed workflow"""
        try:
            logger.info("🔍 Getting list of output files...")
            
            # First check workflow status and get full history
            _, history_data, error = self.check_workflow_status(prompt_id)
            
            if error or not history_data:
                logger.error(f"❌ Cannot get output files: {error or 'No history data'}")
                return []
            
            # Extract files from the outputs
            output_files = []
            
            if "outputs" in history_data:
                for node_id, node_outputs in history_data["outputs"].items():
                    # Look for file outputs
                    for output_data in node_outputs.values():
                        if isinstance(output_data, list):
                            for item in output_data:
                                if isinstance(item, dict) and "filename" in item:
                                    file_info = {
                                        "filename": item["filename"],
                                        "subfolder": item.get("subfolder", ""),
                                        "type": item.get("type", "output"),
                                        "node_id": node_id
                                    }
                                    output_files.append(file_info)
            
            logger.info(f"📄 Found {len(output_files)} output files")
            return output_files
            
        except Exception as e:
            logger.error(f"❌ Error getting output files: {str(e)}")
            return []
    
    def download_file(self, filename: str, output_dir: str, subfolder: str = "") -> Optional[str]:
        """Download a file from the ComfyUI server"""
        try:
            # Determine the file type
            is_image = filename.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif'))
            is_video = filename.lower().endswith(('.mp4', '.avi', '.mov', '.webm'))
            
            # Set the download URL based on file type
            if is_image:
                download_url = f"{self.server_url}/view"
            elif is_video:
                download_url = f"{self.server_url}/view_video"
            else:
                download_url = f"{self.server_url}/view"  # Default to image endpoint
                
            # Add subfolder parameter if provided
            params = {"filename": filename}
            if subfolder:
                params["subfolder"] = subfolder
                
            logger.info(f"📥 Downloading file: {filename}{' (subfolder: ' + subfolder + ')' if subfolder else ''}")
            
            response = requests.get(download_url, params=params, headers=self._get_headers(), stream=True)
            
            if response.status_code == 200:
                # Ensure output directory exists
                os.makedirs(output_dir, exist_ok=True)
                
                # Define output path
                output_path = os.path.join(output_dir, filename)
                
                # Save the file
                with open(output_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                
                logger.info(f"✅ Downloaded file to: {output_path}")
                return output_path
            else:
                logger.error(f"❌ Download failed: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error downloading file: {str(e)}")
            return None
    
    def wait_for_workflow_completion(self, prompt_id: str, timeout_minutes: int = 25) -> bool:
        """Wait for a workflow to complete with timeout"""
        logger.info(f"⏳ Waiting for workflow to complete (timeout: {timeout_minutes} minutes)...")
        
        # Calculate timeout timestamp
        timeout_seconds = timeout_minutes * 60
        end_time = time.time() + timeout_seconds
        
        # Initial wait for processing to start
        time.sleep(5)
        
        # Poll for completion with increasing delays
        delay = 10 * 60  # Start with 5 seconds
        max_delay = 60 * 60  # Maximum delay of 30 seconds
        
        while time.time() < end_time:
            is_complete, _, error = self.check_workflow_status(prompt_id)
            
            if error:
                logger.error(f"❌ Workflow failed: {error}")
                return False
                
            if is_complete:
                logger.info("✅ Workflow completed successfully!")
                return True
                
            # Wait before next check with progressive delay
            logger.info(f"⏳ Still processing... (checking again in {delay} seconds)")
            time.sleep(delay)
            
            # Increase delay for next iteration (up to max_delay)
            delay = min(delay * 1.5, max_delay)
        
        # If we get here, we've timed out
        logger.error(f"⏰ Workflow timed out after {timeout_minutes} minutes")
        return False 