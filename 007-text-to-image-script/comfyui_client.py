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
    
    def load_workflow(self, workflow_path: str) -> Dict[str, Any]:
        """Load a workflow from a JSON file"""
        try:
            with open(workflow_path, 'r') as f:
                workflow = json.load(f)
            return workflow
        except Exception as e:
            logger.error(f"❌ Error loading workflow from {workflow_path}: {str(e)}")
            raise
    
    def update_workflow(self, workflow: Dict[str, Any], positive_prompt: str, negative_prompt: str, 
                         width: int = 1024, height: int = 1024, seed: int = None, steps: int = 35) -> Dict[str, Any]:
        """Update the workflow with prompts and generation parameters"""
        # Make a copy of the workflow to avoid modifying the original
        updated_workflow = json.loads(json.dumps(workflow))
        
        # Find nodes by their titles (as shown in the workflow)
        positive_node = None
        negative_node = None
        sampler_node = None
        latent_node = None
        
        for node in updated_workflow["nodes"]:
            # Identify nodes by their type and title
            if node["type"] == "CLIPTextEncode" and "title" in node and node["title"] == "Positive Prompt":
                positive_node = node
            elif node["type"] == "CLIPTextEncode" and "title" in node and node["title"] == "Negative Prompt":
                negative_node = node
            elif node["type"] == "KSampler":
                sampler_node = node
            elif node["type"] == "EmptySD3LatentImage":
                latent_node = node
        
        # Update the prompts and parameters
        if positive_node and "widgets_values" in positive_node:
            positive_node["widgets_values"][0] = positive_prompt
            logger.info(f"✅ Updated positive prompt")
        
        if negative_node and "widgets_values" in negative_node:
            negative_node["widgets_values"][0] = negative_prompt
            logger.info(f"✅ Updated negative prompt")
        
        if sampler_node and "widgets_values" in sampler_node:
            if seed is not None:
                sampler_node["widgets_values"][0] = seed
            sampler_node["widgets_values"][2] = steps  # Steps value
            logger.info(f"⚙️ Updated sampler parameters: steps={steps}" + (f", seed={seed}" if seed else ""))
        
        if latent_node and "widgets_values" in latent_node:
            latent_node["widgets_values"][0] = width
            latent_node["widgets_values"][1] = height
            logger.info(f"📐 Updated image dimensions to {width}x{height}")
        
        return updated_workflow
    
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
        Check the status of a workflow
        
        Returns:
        - bool: Whether the workflow is complete
        - Dict: The execution history data if available, None otherwise
        - str: Error message if there was an error, None otherwise
        """
        try:
            history = self.get_history(prompt_id)
            
            if not history:
                return False, None, "No history found"
            
            # Check if the history has any outputs
            outputs = history.get("outputs", {})
            if not outputs:
                return False, history, "No outputs yet"
            
            # Check for any errors in the history
            if history.get("error", None):
                error = history.get("error", "Unknown error")
                return False, history, f"Error: {error}"
            
            # Find the SaveImage node output (typically node ID 9 in our workflow)
            save_image_outputs = outputs.get("9", [])
            
            # If there's at least one image in the SaveImage node, we consider it complete
            if save_image_outputs and len(save_image_outputs) > 0:
                return True, history, None
            
            # Otherwise, still processing
            return False, history, "Still processing"
            
        except Exception as e:
            logger.error(f"❌ Error checking workflow status: {str(e)}")
            return False, None, str(e)
    
    def get_output_files(self, prompt_id: str) -> List[Dict[str, Any]]:
        """Get a list of output files from a completed workflow"""
        try:
            history = self.get_history(prompt_id)
            
            if not history or not history.get("outputs"):
                logger.error(f"❌ No outputs found for prompt ID: {prompt_id}")
                return []
            
            outputs = history.get("outputs", {})
            output_files = []
            
            # Process each node's outputs
            for node_id, node_outputs in outputs.items():
                for output in node_outputs:
                    # Check if this is a file output (has a filename)
                    if "filename" in output:
                        output_file = {
                            "node_id": node_id,
                            "filename": output["filename"],
                            "type": "image",  # For text-to-image workflow, all outputs are images
                            "subfolder": output.get("subfolder", "")
                        }
                        output_files.append(output_file)
            
            logger.info(f"📋 Found {len(output_files)} output files")
            return output_files
            
        except Exception as e:
            logger.error(f"❌ Error getting output files: {str(e)}")
            return []
    
    def download_file(self, filename: str, output_dir: str, subfolder: str = "") -> Optional[str]:
        """Download a file from the ComfyUI server"""
        try:
            logger.info(f"📥 Downloading file: {filename}")
            
            # Ensure output directory exists
            os.makedirs(output_dir, exist_ok=True)
            
            # Construct the file URL
            file_url = f"{self.server_url}/view"
            if subfolder:
                file_url = f"{file_url}?filename={subfolder}/{filename}"
            else:
                file_url = f"{file_url}?filename={filename}"
            
            # Download the file
            response = requests.get(file_url, headers=self._get_headers())
            
            if response.status_code != 200:
                logger.error(f"❌ Failed to download file: {response.status_code} - {response.text}")
                return None
            
            # Save the file locally
            output_path = os.path.join(output_dir, filename)
            with open(output_path, 'wb') as f:
                f.write(response.content)
            
            logger.info(f"✅ File downloaded to: {output_path}")
            return output_path
            
        except Exception as e:
            logger.error(f"❌ Error downloading file: {str(e)}")
            return None
    
    def wait_for_workflow_completion(self, prompt_id: str, timeout_minutes: int = 15) -> bool:
        """
        Wait for a workflow to complete, with timeout
        
        Args:
            prompt_id: The prompt ID to monitor
            timeout_minutes: Maximum time to wait in minutes
            
        Returns:
            bool: True if workflow completed successfully, False otherwise
        """
        import time
        from config import INITIAL_WAIT_SECONDS, CHECK_INTERVAL_SECONDS
        
        logger.info(f"⏳ Waiting for workflow to complete (max {timeout_minutes} minutes)...")
        
        # Initial wait to let the workflow start processing
        time.sleep(INITIAL_WAIT_SECONDS)
        
        # Calculate timeout in seconds
        timeout_seconds = timeout_minutes * 60
        start_time = time.time()
        
        # Check status periodically
        while (time.time() - start_time) < timeout_seconds:
            is_complete, history, error = self.check_workflow_status(prompt_id)
            
            if is_complete:
                logger.info("✅ Workflow completed successfully!")
                return True
            
            if error and "Error:" in error:
                logger.error(f"❌ Workflow failed with error: {error}")
                return False
            
            # Wait before checking again
            time.sleep(CHECK_INTERVAL_SECONDS)
            
            # Log progress periodically (every 30 seconds)
            elapsed_seconds = int(time.time() - start_time)
            if elapsed_seconds % 30 == 0:
                logger.info(f"⏳ Still waiting... ({elapsed_seconds // 60}m {elapsed_seconds % 60}s elapsed)")
        
        # If we get here, we've timed out
        logger.error(f"⏰ Timeout after {timeout_minutes} minutes")
        return False 