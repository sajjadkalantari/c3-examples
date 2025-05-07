import os
import requests
import json
import time
import logging
import uuid
import base64
from urllib.parse import urlencode, urlparse, parse_qs
from typing import Optional, Dict, Any, List, Tuple, Union, BinaryIO

logger = logging.getLogger(__name__)

class ComfyUIClient:
    """Client for interacting with ComfyUI API through Comput3"""
    
    def __init__(self, server_url: str, api_key: str):
        """Initialize with ComfyUI server URL and Comput3 API key"""
        self.server_url = server_url.rstrip('/')
        self.original_server_url = self.server_url  # Keep the original URL for direct access
        self.api_key = api_key
        self.client_id = self._get_client_id()
        self.session = self._create_session()
        logger.info(f"🔌 Initialized ComfyUIClient with server URL: {self.server_url}")
    
    def _create_session(self) -> requests.Session:
        """Create a session with persistent cookies for authentication"""
        session = requests.Session()
        session.headers.update(self._get_headers())
        
        # Set API key as cookie for authentication
        session.cookies.set("c3_api_key", self.api_key, domain=urlparse(self.server_url).netloc)
        
        return session
    
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
            "X-C3-API-KEY": self.api_key,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "max-age=0",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
        }
    
    def _get_video_headers(self) -> Dict[str, str]:
        """Get headers specifically for video requests"""
        return {
            "X-C3-API-KEY": self.api_key,
            "accept": "video/mp4,video/webm,video/*;q=0.8,*/*;q=0.5",
            "accept-language": "en-US,en;q=0.9",
            "sec-fetch-dest": "video",
            "sec-fetch-mode": "no-cors",
            "sec-fetch-site": "same-origin",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
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
            with open(workflow_path, 'r', encoding='utf-8') as f:
                workflow = json.load(f)
            return workflow
        except Exception as e:
            logger.error(f"❌ Error loading workflow from {workflow_path}: {str(e)}")
            raise
    
    def validate_workflow(self, workflow: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate that a workflow has the required structure and nodes for text-to-video
        """
        errors = []
        warnings = []
        
        if not workflow:
            errors.append('Workflow is null or undefined')
            return {"valid": False, "errors": errors, "warnings": warnings}
        
        if not isinstance(workflow, dict):
            errors.append(f'Workflow is not an object: {type(workflow)}')
            return {"valid": False, "errors": errors, "warnings": warnings}
        
        # Check if workflow has nodes
        if "nodes" not in workflow:
            errors.append('Workflow is missing "nodes" property')
        
        # If nodes exist in dictionary format, check for required node types
        if "nodes" in workflow:
            if isinstance(workflow["nodes"], dict):
                # Check for WanVideoTextEncode node (for text encoding)
                has_text_encode = False
                for node_id, node in workflow["nodes"].items():
                    if node.get("class_type") == "WanVideoTextEncode":
                        has_text_encode = True
                        break
                
                if not has_text_encode:
                    errors.append('Missing WanVideoTextEncode node')
            
            # If nodes are in list format
            elif isinstance(workflow["nodes"], list):
                # Check for WanVideoTextEncode node (for text encoding)
                has_text_encode = False
                for node in workflow["nodes"]:
                    if node.get("type") == "WanVideoTextEncode":
                        has_text_encode = True
                        break
                
                if not has_text_encode:
                    errors.append('Missing WanVideoTextEncode node')
            else:
                errors.append(f'Workflow "nodes" is not a list or dictionary: {type(workflow["nodes"])}')
        
        # Return validation result
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
    
    def update_workflow(self, workflow: Dict[str, Any], prompt: str) -> Dict[str, Any]:
        """Update the workflow with the text prompt (simple version)"""
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
    
    def update_text_to_video_workflow(self, workflow: Dict[str, Any], 
                                     positive_prompt: str, 
                                     negative_prompt: str, 
                                     width: int = 832, 
                                     height: int = 480, 
                                     frames: int = 16,
                                     fps: int = 24,
                                     seed: int = None, 
                                     steps: int = 25) -> Dict[str, Any]:
        """
        Update the workflow with text-to-video parameters
        """
        # Validate input workflow
        validation = self.validate_workflow(workflow)
        if not validation["valid"]:
            error_message = f"Invalid workflow: {', '.join(validation['errors'])}"
            logger.warning(f"⚠️ {error_message}")
            # Continue anyway as we're creating a new API-compatible workflow
        
        logger.info(f"Updating workflow with parameters: prompt={positive_prompt[:20]}..., "
                   f"negativePrompt={negative_prompt[:20]}..., width={width}, height={height}, "
                   f"frames={frames}, fps={fps}, seed={seed}, steps={steps}")
        
        # Make a copy of the workflow to avoid modifying the original
        updated_workflow = json.loads(json.dumps(workflow))
        
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
                "positive_prompt": positive_prompt,
                "negative_prompt": negative_prompt,
                "force_zeros": True
            }
        }
        
        # 3. Empty Embeds
        api_workflow["3"] = {
            "class_type": "WanVideoEmptyEmbeds",
            "inputs": {
                "width": width,
                "height": height,
                "num_frames": frames
            }
        }
        
        # 4. Block Swap
        api_workflow["4"] = {
            "class_type": "WanVideoBlockSwap",
            "inputs": {
                "blocks_to_swap": 20,
                "offload_txt_emb": True,
                "offload_img_emb": True
            }
        }
        
        # 5. Model Loader
        api_workflow["5"] = {
            "class_type": "WanVideoModelLoader",
            "inputs": {
                "block_swap_args": ["4", 0],
                "model": "WanVideo/Wan2_1-T2V-14B_fp8_e4m3fn.safetensors",
                "base_precision": "fp16",
                "load_device": "main_device",
                "quantization": "disabled"
            }
        }
        
        # 6. VAE Loader
        api_workflow["6"] = {
            "class_type": "WanVideoVAELoader",
            "inputs": {
                "model_name": "wan_2.1_vae.safetensors"
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
                "cache_device": "offload_device"
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
                "steps": steps,
                "cfg": 6.0,
                "seed": seed if seed is not None else int(time.time() * 1000) % (2**32),
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
                "enable_vae_tiling": True
            }
        }
        
        # 10. Video Combiner
        api_workflow["10"] = {
            "class_type": "VHS_VideoCombine",
            "inputs": {
                "images": ["9", 0],
                "frame_rate": fps,
                "loop_count": 0,
                "filename_prefix": "video_output",
                "format": "video/h264-mp4",
                "pingpong": False,
                "save_output": True
            }
        }
        
        # Replace the workflow nodes with our API-compatible nodes
        updated_workflow = {
            "nodes": api_workflow
        }
        
        return updated_workflow
    
    def queue_workflow(self, workflow: Dict[str, Any]) -> Optional[str]:
        """Queue a workflow for execution"""
        try:
            logger.info("🚀 Queueing workflow")
            
            # Extract the workflow nodes for API compatibility
            api_prompt = workflow.get("nodes", workflow)
            
            # Create the final payload
            payload = {
                "prompt": api_prompt,
                "client_id": self.client_id
            }
            
            # If the original workflow had extra_data, include it
            if "extra_data" in workflow:
                payload["extra_data"] = workflow["extra_data"]
            
            # For debugging - Save the payload to a file
            debug_dir = os.path.join(os.getcwd(), "debug")
            os.makedirs(debug_dir, exist_ok=True)
            debug_file = os.path.join(debug_dir, f"workflow_payload_{int(time.time())}.json")
            with open(debug_file, 'w') as f:
                json.dump(payload, f, indent=2)
            logger.debug(f"Wrote payload to {debug_file}")
            
            # Add a small delay before API call to prevent rate limiting
            time.sleep(1)
            
            # Retry mechanism for API call
            max_retries = 3
            retry_delay = 2
            
            for retry in range(max_retries):
                try:
                    logger.debug(f"Attempt {retry + 1} of {max_retries} to queue workflow")
                    
                    response = self.session.post(
                        f"{self.server_url}/prompt",
                        json=payload,
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
    
    def get_history(self, prompt_id: str) -> Optional[Dict[str, Any]]:
        """Get the history of a prompt execution"""
        try:
            url = f"{self.server_url}/history/{prompt_id}"
            response = self.session.get(url)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"❌ Failed to get history: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error getting history: {str(e)}")
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
            response = self.session.get(url)
            
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
                executing_nodes = set()
                
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
                
                # Also check for nodes currently executing
                if "executing" in history_data:
                    for node_id in history_data["executing"]:
                        if not node_id.startswith('$'):
                            executing_nodes.add(node_id)
                
                # Check for output node 10 (VHS_VideoCombine in our workflow)
                is_complete = "10" in executed_nodes
                
                # Log status details for debugging
                if executing_nodes:
                    for node_id in executing_nodes:
                        # Calculate progress for this node if available
                        node_progress = None
                        if "progress" in history_data:
                            node_progress = history_data["progress"].get(node_id)
                        
                        if node_progress:
                            logger.debug(f"🔄 Executing node {node_id}: {node_progress:.1f}% complete")
                        else:
                            logger.debug(f"🔄 Executing node {node_id}")
                
                if is_complete:
                    logger.info("✅ Workflow execution complete")
                elif executed_nodes:
                    logger.debug(f"🔄 Progress: {len(executed_nodes)}/{len(nodes_in_prompt)} nodes completed")
                
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
    
    def get_video_url(self, filename: str, subfolder: str = "") -> str:
        """Get the direct URL to a video file"""
        base_url = f"{self.server_url}/view_video"
        params = {"filename": filename}
        if subfolder:
            params["subfolder"] = subfolder
        
        # Create URL with query parameters
        return f"{base_url}?{urlencode(params)}"
    
    def prepare_video_for_viewing(self, video_url: str) -> str:
        """
        Prepare a video for viewing by sending a request to the server first
        This helps establish authentication
        """
        try:
            # First, make a HEAD request to establish authentication
            response = self.session.head(
                video_url,
                headers=self._get_video_headers()
            )
            
            if response.status_code < 300:
                logger.debug(f"✅ Successfully prepared video URL: {video_url}")
                return video_url
            else:
                logger.warning(f"⚠️ Failed to prepare video URL: {response.status_code}")
                return video_url
                
        except Exception as e:
            logger.error(f"❌ Error preparing video URL: {str(e)}")
            return video_url
    
    def download_file(self, filename: str, output_dir: str, subfolder: str = "") -> Optional[str]:
        """Download a file from the ComfyUI server"""
        try:
            # Determine the file type
            is_video = filename.lower().endswith(('.mp4', '.avi', '.mov', '.webm'))
            
            # Set the download URL
            if is_video:
                download_url = self.get_video_url(filename, subfolder)
            else:
                # For other file types, use the view endpoint
                base_url = f"{self.server_url}/view"
                params = {"filename": filename}
                if subfolder:
                    params["subfolder"] = subfolder
                download_url = f"{base_url}?{urlencode(params)}"
                
            logger.info(f"📥 Downloading file: {filename}{' (subfolder: ' + subfolder + ')' if subfolder else ''}")
            
            # Try the two-step approach for downloading
            # Step 1: Prepare authentication
            if is_video:
                self.prepare_video_for_viewing(download_url)
            
            # Step 2: Download the file
            response = self.session.get(
                download_url,
                headers=self._get_video_headers() if is_video else self._get_headers(),
                stream=True
            )
            
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
                
                # Try a different approach - direct download with API key in both headers and URL
                logger.info("🔄 Trying direct download with API key...")
                direct_url = f"{download_url}&api_key={self.api_key}"
                direct_response = requests.get(
                    direct_url,
                    headers=self._get_video_headers() if is_video else self._get_headers(),
                    stream=True
                )
                
                if direct_response.status_code == 200:
                    # Ensure output directory exists
                    os.makedirs(output_dir, exist_ok=True)
                    
                    # Define output path
                    output_path = os.path.join(output_dir, filename)
                    
                    # Save the file
                    with open(output_path, 'wb') as f:
                        for chunk in direct_response.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                    
                    logger.info(f"✅ Downloaded file to: {output_path} (direct method)")
                    return output_path
                else:
                    logger.error(f"❌ Direct download also failed: {direct_response.status_code}")
                    return None
                
        except Exception as e:
            logger.error(f"❌ Error downloading file: {str(e)}")
            return None
    
    def get_queue_status(self, prompt_id: str) -> Dict[str, Any]:
        """
        Get the queue status of a workflow from the ComfyUI API
        
        Returns:
            Dict with queue information including position and progress
        """
        try:
            url = f"{self.server_url}/prompt"
            response = self.session.get(url)
            
            queue_info = {
                "queue_position": None,
                "queue_remaining": None,
                "queue_size": 0,
                "queue_running": False,
                "queue_details": {}
            }
            
            if response.status_code == 200:
                queue_data = response.json()
                
                # Parse queue data to find our prompt
                if "queue_running" in queue_data:
                    queue_info["queue_running"] = queue_data["queue_running"]
                
                # Get queue size
                if "queue" in queue_data:
                    queue = queue_data["queue"]
                    queue_info["queue_size"] = len(queue)
                    
                    # Find our prompt's position
                    for idx, item in enumerate(queue):
                        if item[1] == prompt_id:
                            queue_info["queue_position"] = idx
                            queue_info["queue_remaining"] = idx
                            break
                
                # Get executing prompt details
                if "executing" in queue_data and queue_data["executing"]:
                    executing = queue_data["executing"]
                    # If our prompt is currently executing
                    if executing[1] == prompt_id:
                        queue_info["queue_position"] = 0
                        queue_info["queue_running"] = True
                        
                        # Check if there's execution progress info 
                        if "progress" in queue_data and queue_data["progress"] is not None:
                            progress_data = queue_data["progress"]
                            if "value" in progress_data:
                                queue_info["queue_details"]["progress"] = progress_data["value"]
                            if "max" in progress_data:
                                queue_info["queue_details"]["max_progress"] = progress_data["max"]
                            if "node" in progress_data:
                                queue_info["queue_details"]["current_node"] = progress_data["node"]
                
                logger.debug(f"Queue status: {queue_info}")
                return queue_info
            else:
                logger.error(f"❌ Failed to get queue status: {response.status_code} - {response.text}")
                return queue_info
                
        except Exception as e:
            logger.error(f"❌ Error getting queue status: {str(e)}")
            return queue_info

    def wait_for_workflow_completion(self, prompt_id: str, timeout_minutes: int = 120, 
                                     status_callback=None) -> bool:
        """
        Wait for workflow completion with timeout and optional status callback
        
        Args:
            prompt_id: The ID of the prompt to wait for
            timeout_minutes: Maximum time to wait in minutes
            status_callback: Optional callback function to report status
            
        Returns:
            bool: True if workflow completed successfully, False otherwise
        """
        logger.info(f"⏳ Waiting for workflow to complete (max {timeout_minutes} minutes)...")
        
        # Calculate timeout
        timeout_seconds = timeout_minutes * 60
        start_time = time.time()
        check_interval = 10.0  # Start with 10 seconds between checks
        
        # Wait a moment before first check
        time.sleep(2)
        
        # For tracking which nodes have completed
        known_executed_nodes = set()
        total_nodes = 10  # Our text-to-video workflow has 10 nodes
        
        # Expected node sequence for reporting
        node_descriptions = {
            "1": "Loading T5 encoder model",
            "2": "Encoding text prompt",
            "3": "Preparing latent space",
            "4": "Setting up block swap",
            "5": "Loading video model",
            "6": "Loading VAE model",
            "7": "Configuring tea cache",
            "8": "Generating frames with sampler",
            "9": "Decoding video frames",
            "10": "Combining frames into video"
        }
        
        while True:
            # Check for timeout
            elapsed_time = time.time() - start_time
            if elapsed_time > timeout_seconds:
                logger.error(f"⏰ Workflow processing timed out after {timeout_minutes} minutes")
                return False
            
            # First check queue status to see if we're still queued
            queue_info = self.get_queue_status(prompt_id)
            queue_position = queue_info.get("queue_position")
            
            # If we're in the queue but not executing yet
            if queue_position is not None and queue_position > 0:
                queue_size = queue_info.get("queue_size", 0)
                if status_callback:
                    status = f"0% - Queued: Position {queue_position+1} of {queue_size}"
                    status_callback(status)
                logger.info(f"⌛ Prompt queued at position {queue_position+1} of {queue_size}")
                time.sleep(check_interval)
                continue
            
            # Check status with history
            is_complete, history_data, error_msg = self.check_workflow_status(prompt_id)
            
            # Track executed nodes for progress reporting
            executed_nodes = set()
            current_node = None
            execution_progress = 0
            
            # Process history data for detailed progress if available
            if history_data and "outputs" in history_data:
                for node_id in history_data["outputs"]:
                    if node_id.isdigit():  # Only track numbered nodes
                        executed_nodes.add(node_id)
                
                # Calculate progress
                execution_progress = min(95, int((len(executed_nodes) / total_nodes) * 100))
                
                # Find the highest node number being executed (that's not complete)
                in_progress_node = None
                node_progress_value = None
                
                if "executing" in history_data:
                    executing_nodes = history_data.get("executing", {})
                    for node_id in executing_nodes:
                        if node_id.isdigit() and node_id not in executed_nodes:
                            if in_progress_node is None or int(node_id) > int(in_progress_node):
                                in_progress_node = node_id
                
                # Get node-specific progress if available
                if in_progress_node and "progress" in history_data:
                    progress_data = history_data.get("progress", {})
                    if in_progress_node in progress_data:
                        node_progress_value = progress_data[in_progress_node]
                
                # Find the current node being processed based on completed nodes
                if in_progress_node:
                    current_node = in_progress_node
                else:
                    # If no node is currently executing, the current node is the next one after the highest executed
                    highest_executed = 0
                    for node_id in executed_nodes:
                        if node_id.isdigit() and int(node_id) > highest_executed:
                            highest_executed = int(node_id)
                    
                    # Next node would be highest + 1 if it's not at the end
                    if highest_executed < total_nodes:
                        current_node = str(highest_executed + 1)
                
                # Also check if there's queue progress information
                queue_node = queue_info.get("queue_details", {}).get("current_node")
                queue_progress = queue_info.get("queue_details", {}).get("progress")
                
                if queue_progress is not None and queue_node and queue_node.isdigit():
                    # If queue info has more specific progress, use it
                    if current_node == queue_node:
                        node_progress_value = queue_progress
                
                # Report newly executed nodes
                new_executed = executed_nodes - known_executed_nodes
                for node_id in sorted(new_executed, key=int):
                    desc = node_descriptions.get(node_id, f"Step {node_id}")
                    logger.info(f"✅ Completed: {desc}")
                
                # Update known executed nodes
                known_executed_nodes = executed_nodes
            else:
                # Fallback to time-based progress if no history data
                execution_progress = min(95, int((elapsed_time / timeout_seconds) * 100))
            
            # If there's a callback, call it with status details
            if status_callback:
                if error_msg:
                    status = f"{execution_progress}% - Error: {error_msg}"
                elif current_node and current_node in node_descriptions:
                    status_msg = node_descriptions[current_node]
                    if node_progress_value is not None:
                        # Add node-specific progress percentage if available
                        node_progress_pct = min(99, int(node_progress_value * 100))
                        status_msg = f"{status_msg} ({node_progress_pct}% done)"
                    status = f"{execution_progress}% - {status_msg}"
                elif current_node:
                    status = f"{execution_progress}% - Processing step {current_node}"
                else:
                    status = f"{execution_progress}% - Processing"
                
                # Log both to console and callback
                logger.debug(f"Progress update: {status}")
                status_callback(status)
            
            # If complete, return success
            if is_complete:
                if status_callback:
                    status_callback("100% - Complete")
                logger.info("✅ Workflow completed successfully")
                return error_msg is None  # Return True only if there's no error
            
            # Adaptive waiting: increase interval gradually to reduce polling frequency
            check_interval = min(60, check_interval * 1.2)  # Cap at 60 seconds
            time.sleep(check_interval) 