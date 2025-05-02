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
    
    def update_workflow(self, workflow: Dict[str, Any], input_image_name: str, 
                        prompt: str, negative_prompt: str = "", 
                        strength: float = 0.75) -> Dict[str, Any]:
        """Update the workflow with input image and prompt information"""
        # Make a copy of the workflow to avoid modifying the original
        updated_workflow = json.loads(json.dumps(workflow))
        
        # Get the original image path for dimension calculations
        original_image_path = None
        
        # Try various paths to find the original image
        input_dir = os.path.join(os.getcwd(), "input")
        if os.path.exists(input_dir):
            possible_path = os.path.join(input_dir, input_image_name)
            if os.path.exists(possible_path):
                original_image_path = possible_path
        
        # Get optimal dimensions for the image if the file exists
        if original_image_path and os.path.exists(original_image_path):
            img_width, img_height = self.get_image_dimensions(original_image_path)
            logger.info(f"🔍 Image dimensions: {img_width}x{img_height}")
        else:
            # Default dimensions if we can't find the image
            img_width, img_height = 512, 512
            logger.warning(f"⚠️ Could not find original image to determine dimensions, using default: {img_width}x{img_height}")
        
        # Update the workflow nodes
        for node_id, node in updated_workflow.items():
            # Update LoadImage node
            if node.get("class_type") == "LoadImage":
                node["inputs"]["image"] = input_image_name
                logger.info(f"🖼️ Updated LoadImage node with image: {input_image_name}")
            
            # Update KSampler node parameters (for denoising strength)
            if node.get("class_type") == "KSampler" and "denoise" in node["inputs"]:
                node["inputs"]["denoise"] = strength
                logger.info(f"🎛️ Set denoising strength to {strength}")
            
            # Update CLIPTextEncode nodes for prompt and negative prompt
            if node.get("class_type") == "CLIPTextEncode":
                if "positive" in node_id.lower() or node.get("inputs", {}).get("text", "").startswith("positive"):
                    node["inputs"]["text"] = prompt
                    logger.info(f"✍️ Set positive prompt: {prompt[:50]}...")
                elif "negative" in node_id.lower() or node.get("inputs", {}).get("text", "").startswith("negative"):
                    node["inputs"]["text"] = negative_prompt
                    logger.info(f"✍️ Set negative prompt: {negative_prompt[:50]}...")
            
            # Update image dimensions if necessary
            if "width" in node.get("inputs", {}) and "height" in node.get("inputs", {}):
                node["inputs"]["width"] = img_width
                node["inputs"]["height"] = img_height
                logger.info(f"📐 Updated dimensions to {img_width}x{img_height}")
        
        return updated_workflow
    
    def get_image_dimensions(self, image_path: str) -> Tuple[int, int]:
        """Get dimensions of an image"""
        try:
            with Image.open(image_path) as img:
                width, height = img.size
                return width, height
        except Exception as e:
            logger.error(f"❌ Error getting image dimensions: {str(e)}")
            return 512, 512  # Default fallback
    
    def queue_workflow(self, workflow: Dict[str, Any]) -> Optional[str]:
        """Queue a workflow for execution on ComfyUI"""
        try:
            prompt_url = f"{self.server_url}/prompt"
            
            # Setup the prompt data
            prompt_data = {
                "prompt": workflow,
                "client_id": self.client_id
            }
            
            response = requests.post(
                prompt_url, 
                json=prompt_data,
                headers=self._get_headers()
            )
            
            if response.status_code == 200:
                prompt_id = response.json().get("prompt_id")
                logger.info(f"✅ Workflow queued with prompt ID: {prompt_id}")
                return prompt_id
            else:
                logger.error(f"❌ Failed to queue workflow: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            logger.error(f"❌ Error queueing workflow: {str(e)}")
            return None
    
    def get_history(self, prompt_id: str) -> Optional[Dict[str, Any]]:
        """Get the execution history for a specific prompt ID"""
        try:
            history_url = f"{self.server_url}/history"
            response = requests.get(history_url, headers=self._get_headers())
            
            if response.status_code == 200:
                history = response.json()
                return history.get(prompt_id)
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
        - is_complete: Whether the workflow has completed
        - execution_data: The execution data if complete (None otherwise)
        - error_message: Error message if failed (None otherwise)
        """
        history = self.get_history(prompt_id)
        
        if not history:
            return False, None, "Failed to get history data"
        
        # Extract nodes that executed successfully
        executed_nodes = []
        for node_id, node_output in history.get("outputs", {}).items():
            if node_output:  # If there's output data
                executed_nodes.append(node_id)
        
        # Get total nodes from the execution data
        execution_data = history.get("prompt", {})
        total_nodes = len(execution_data) if execution_data else 0
        
        # Check if there are errors
        errors = history.get("errors", {})
        if errors:
            error_msgs = []
            for node_id, error in errors.items():
                if error:
                    error_msgs.append(f"Error in node {node_id}: {error}")
            return False, execution_data, "; ".join(error_msgs)
        
        # When checking for completion, look for at least one SaveImage node with output
        save_image_nodes = [node_id for node_id, node in execution_data.items() 
                           if node.get("class_type") in ["SaveImage", "PreviewImage"]]
        
        # Check if all nodes executed or at least the SaveImage nodes executed
        all_nodes_executed = len(executed_nodes) == total_nodes
        save_nodes_executed = any(node_id in executed_nodes for node_id in save_image_nodes)
        
        # If we have execution data and either all nodes executed or save nodes executed
        if execution_data and (all_nodes_executed or save_nodes_executed):
            return True, execution_data, None
        
        # If we have execution data but not all nodes have executed
        if execution_data and not all_nodes_executed:
            num_executed = len(executed_nodes)
            percentage = (num_executed / total_nodes) * 100 if total_nodes > 0 else 0
            return False, execution_data, f"Processing: {num_executed}/{total_nodes} nodes ({percentage:.1f}%)"
        
        # If we don't have execution data
        return False, None, "Workflow is queued or no data available"
    
    def get_output_files(self, prompt_id: str) -> List[Dict[str, Any]]:
        """Get a list of output files from a completed workflow"""
        history = self.get_history(prompt_id)
        
        if not history:
            logger.error(f"❌ No history data found for prompt ID: {prompt_id}")
            return []
        
        # Extract output files from the history
        output_files = []
        for node_id, outputs in history.get("outputs", {}).items():
            for output_type, output_data in outputs.items():
                # Handle image outputs
                if output_type == "images" and isinstance(output_data, list):
                    for image_data in output_data:
                        if isinstance(image_data, dict):
                            output_files.append({
                                "type": "image",
                                "filename": image_data.get("filename", ""),
                                "subfolder": image_data.get("subfolder", ""),
                                "node_id": node_id
                            })
        
        return output_files
    
    def download_file(self, filename: str, output_dir: str, subfolder: str = "") -> Optional[str]:
        """Download a file from ComfyUI server"""
        try:
            # Create output directory if it doesn't exist
            os.makedirs(output_dir, exist_ok=True)
            
            # Determine the file path on the server
            file_path = f"{subfolder}/{filename}" if subfolder else filename
            
            # Construct the download URL
            download_url = f"{self.server_url}/view"
            params = {"filename": file_path}
            
            # Make the request
            response = requests.get(download_url, params=params, headers=self._get_headers())
            
            if response.status_code != 200:
                logger.error(f"❌ Failed to download file: {response.status_code} - {response.text}")
                return None
            
            # Save the file
            output_path = os.path.join(output_dir, filename)
            with open(output_path, 'wb') as f:
                f.write(response.content)
            
            logger.info(f"✅ Downloaded file to: {output_path}")
            return output_path
        except Exception as e:
            logger.error(f"❌ Error downloading file: {str(e)}")
            return None
    
    def wait_for_workflow_completion(self, prompt_id: str, timeout_minutes: int = 25) -> bool:
        """Wait for a workflow to complete, with a timeout"""
        logger.info(f"⏳ Waiting for workflow to complete (max {timeout_minutes} minutes)...")
        
        # Convert timeout to seconds
        timeout = timeout_minutes * 60
        
        # Initial wait to allow the server to process the request
        time.sleep(5)
        
        # Wait for completion with timeout
        start_time = time.time()
        while time.time() - start_time < timeout:
            is_complete, _, error_msg = self.check_workflow_status(prompt_id)
            
            if is_complete:
                logger.info("✅ Workflow completed successfully")
                return True
            
            # Log status message if available
            if error_msg:
                if "Processing" in error_msg:
                    logger.info(f"⏳ {error_msg}")
                else:
                    logger.warning(f"⚠️ {error_msg}")
            
            # Wait before checking again
            time.sleep(10)
        
        # If we get here, the workflow timed out
        logger.error(f"❌ Workflow timed out after {timeout_minutes} minutes")
        return False 