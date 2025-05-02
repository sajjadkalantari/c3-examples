import os
import requests
import json
import time
import logging
import uuid
from typing import Optional, Dict, Any, List, Tuple
from PIL import Image

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
            with open(workflow_path, 'r') as f:
                workflow = json.load(f)
            return workflow
        except Exception as e:
            logger.error(f"❌ Error loading workflow from {workflow_path}: {str(e)}")
            raise
    
    def update_workflow(self, workflow: Dict[str, Any], image_name: str) -> Dict[str, Any]:
        """Update the workflow with image information for image-to-video conversion"""
        # Make a copy of the workflow to avoid modifying the original
        updated_workflow = json.loads(json.dumps(workflow))
        
        # Get the full path to check image dimensions
        input_dir = os.path.join(os.getcwd(), "input")
        possible_paths = [
            os.path.join(input_dir, image_name),
            image_name  # Direct path if absolute
        ]
        
        image_path = None
        for path in possible_paths:
            if os.path.exists(path):
                image_path = path
                break
        
        # Get optimal dimensions for the image if the file exists
        width, height = 624, 624  # Default dimensions
        if image_path:
            width, height = self.get_image_dimensions(image_path)
            logger.info(f"🔍 Image dimensions: {width}x{height}")
        
        # Update the workflow nodes
        for node_id, node in updated_workflow["nodes"].items():
            # Update LoadImage node
            if node.get("type") == "LoadImage":
                for widget_value in node.get("widgets_values", []):
                    if isinstance(widget_value, str) and widget_value.endswith((".png", ".jpg", ".jpeg")):
                        widget_index = node["widgets_values"].index(widget_value)
                        node["widgets_values"][widget_index] = image_name
                        logger.info(f"🖼️ Updated LoadImage node with image: {image_name}")
                        break
            
            # Update ImageResizeKJ node dimensions if found
            if node.get("type") == "ImageResizeKJ":
                if "widgets_values" in node and len(node["widgets_values"]) >= 2:
                    node["widgets_values"][0] = width
                    node["widgets_values"][1] = height
                    logger.info(f"📐 Updated image resize dimensions to: {width}x{height}")
            
            # Update any specific parameters for the WanVideoTorchCompileSettings node
            if node.get("type") == "WanVideoTorchCompileSettings":
                # Keeping default values as they are likely optimized already
                logger.info(f"⚙️ Using default WanVideo torch compile settings")
        
        return updated_workflow
    
    def get_image_dimensions(self, image_path: str) -> Tuple[int, int]:
        """Get dimensions of an image and return optimized size for processing"""
        try:
            with Image.open(image_path) as img:
                width, height = img.size
                logger.info(f"📐 Original image dimensions: {width}x{height}")
                
                # Calculate aspect ratio
                aspect_ratio = width / height
                
                # Return optimized dimensions based on aspect ratio
                # Ensure dimensions are multiples of 8 for better GPU processing
                if aspect_ratio > 1.5:  # Wide landscape
                    return 832, 480
                elif aspect_ratio < 0.67:  # Tall portrait
                    return 480, 832
                else:  # Square-ish
                    return 624, 624
                
        except Exception as e:
            logger.error(f"❌ Error getting image dimensions: {str(e)}")
            return 624, 624  # Default to square if we can't process the image
    
    def queue_workflow(self, workflow: Dict[str, Any]) -> Optional[str]:
        """Queue a workflow for execution"""
        try:
            logger.info("🚀 Queueing workflow")
            
            # Structure the payload
            payload = {
                "prompt": workflow,
                "client_id": self.client_id
            }
            
            response = requests.post(
                f"{self.server_url}/prompt",
                json=payload,
                headers=self._get_headers()
            )
            
            if response.status_code == 200:
                result = response.json()
                prompt_id = result.get("prompt_id")
                logger.info(f"✅ Workflow queued with ID: {prompt_id}")
                return prompt_id
            else:
                logger.error(f"❌ Failed to queue workflow: {response.status_code} - {response.text}")
                return None
        
        except Exception as e:
            logger.error(f"❌ Error queueing workflow: {str(e)}")
            return None
    
    def get_history(self, prompt_id: str) -> Optional[Dict[str, Any]]:
        """Get execution history for a prompt"""
        try:
            response = requests.get(
                f"{self.server_url}/history/{prompt_id}",
                headers=self._get_headers()
            )
            
            if response.status_code != 200:
                logger.warning(f"⚠️ Failed to get history: {response.status_code}")
                return None
            
            history_data = response.json()
            return history_data
            
        except Exception as e:
            logger.error(f"❌ Error getting history: {e}")
            return None
    
    def check_workflow_status(self, prompt_id: str) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """
        Check if a workflow has completed or encountered an error
        Returns: (is_complete, history_data, error_message)
        """
        try:
            # Get history data
            history_data = self.get_history(prompt_id)
            
            if not history_data:
                return False, None, None
            
            # Check for error status
            if "status" in history_data:
                status = history_data["status"]
                
                # Check if there's an error
                if status.get("status_str") == "error":
                    error_message = "Workflow execution failed"
                    
                    # Try to get detailed error information
                    for msg in status.get("messages", []):
                        if msg[0] == "execution_error" and len(msg) > 1:
                            error_details = msg[1]
                            node_id = error_details.get("node_id", "unknown")
                            node_type = error_details.get("node_type", "unknown")
                            exception = error_details.get("exception_message", "Unknown error")
                            error_message = f"Error in node {node_id} ({node_type}): {exception}"
                    
                    logger.error(f"❌ {error_message}")
                    return False, history_data, error_message
                
                # Check for successful completion
                if status.get("completed") == True:
                    return True, history_data, None
            
            # Check if workflow has outputs
            if "outputs" not in history_data:
                return False, history_data, None
            
            # Check for VHS_VideoCombine output in any node
            has_videos = False
            for node_id, node_output in history_data["outputs"].items():
                if "videos" in node_output and node_output["videos"]:
                    has_videos = True
                    break
                if "gifs" in node_output and node_output["gifs"]:
                    has_videos = True
                    break
            
            # Check if workflow is still in a queue
            queue_response = requests.get(
                f"{self.server_url}/queue",
                headers=self._get_headers()
            )
            if queue_response.status_code == 200:
                queue_data = queue_response.json()
                
                # Check if our prompt is in the queue
                running_prompts = [item.get("prompt_id") for item in queue_data.get("queue_running", [])]
                pending_prompts = [item.get("prompt_id") for item in queue_data.get("queue_pending", [])]
                
                if prompt_id in running_prompts or prompt_id in pending_prompts:
                    return False, history_data, None
                
                # If we have videos and we're not in any queue, consider it complete
                if has_videos:
                    return True, history_data, None
            
            # Final determination based on available information
            if has_videos or history_data.get("executed", False):
                return True, history_data, None
            
            return False, history_data, None
        
        except Exception as e:
            logger.error(f"❌ Error checking workflow status: {str(e)}")
            return False, None, str(e)
    
    def get_output_files(self, prompt_id: str) -> List[Dict[str, Any]]:
        """Get output files from a completed workflow"""
        history_data = self.get_history(prompt_id)
        
        if not history_data or "outputs" not in history_data:
            return []
        
        outputs = []
        
        # Extract node outputs
        for node_id, node_output in history_data["outputs"].items():
            # Check for videos
            if "videos" in node_output:
                for video_info in node_output["videos"]:
                    file_info = {
                        "node_id": node_id,
                        "type": "video",
                        "filename": video_info.get("filename", ""),
                        "subfolder": video_info.get("subfolder", ""),
                        "fullpath": video_info.get("fullpath", "")
                    }
                    outputs.append(file_info)
                    logger.info(f"📹 Found video: {file_info['filename']}")
            
            # Check for gifs (sometimes used for videos)
            if "gifs" in node_output:
                for gif_info in node_output["gifs"]:
                    file_info = {
                        "node_id": node_id,
                        "type": "video",
                        "filename": gif_info.get("filename", ""),
                        "subfolder": gif_info.get("subfolder", ""),
                        "fullpath": gif_info.get("fullpath", "")
                    }
                    outputs.append(file_info)
                    logger.info(f"📹 Found video: {file_info['filename']}")
        
        return outputs
    
    def download_file(self, filename: str, output_dir: str, subfolder: str = "") -> Optional[str]:
        """Download a file from the server"""
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        # Construct the URL
        params = {"filename": filename}
        
        if subfolder:
            params["subfolder"] = subfolder
        
        import urllib.parse
        url_with_params = f"{self.server_url}/view?{urllib.parse.urlencode(params)}"
        logger.info(f"📥 Downloading: {filename}")
        
        try:
            response = requests.get(
                url_with_params,
                stream=True,
                headers=self._get_headers()
            )
            
            if response.status_code != 200:
                logger.error(f"❌ Download failed: {response.status_code}")
                return None
            
            # Save the file to the output directory
            output_path = os.path.join(output_dir, filename)
            with open(output_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            logger.info(f"💾 File saved to: {output_path}")
            return output_path
        except Exception as e:
            logger.error(f"❌ Error downloading file: {str(e)}")
            return None
    
    def wait_for_workflow_completion(self, prompt_id: str, timeout_minutes: int = 25) -> bool:
        """Wait for a workflow to complete, with progress updates"""
        logger.info(f"⏳ Waiting for workflow to complete (timeout: {timeout_minutes} minutes)")
        
        start_time = time.time()
        timeout_seconds = timeout_minutes * 60
        
        # Give the workflow a little time to start
        logger.info(f"⏱️ Initial wait period (5 seconds)...")
        time.sleep(5)
        
        attempt = 1
        while time.time() - start_time < timeout_seconds:
            elapsed_minutes = (time.time() - start_time) / 60
            logger.info(f"🔄 Check attempt #{attempt} (elapsed: {elapsed_minutes:.1f} minutes)")
            
            is_complete, _, error_message = self.check_workflow_status(prompt_id)
            
            if error_message:
                logger.error(f"❌ Workflow failed with error: {error_message}")
                return False
            
            if is_complete:
                logger.info("✅ Workflow completed successfully!")
                return True
            
            # Wait before checking again
            remaining_time = int(timeout_seconds - (time.time() - start_time))
            logger.info(f"⏳ Still in progress... Checking again in 30s (timeout in {remaining_time}s)")
            
            time.sleep(30)
            attempt += 1
        
        logger.error(f"⏰ Workflow did not complete within timeout of {timeout_minutes} minutes")
        return False 