import os
import requests
import json
import time
import logging
import uuid
import base64
from urllib.parse import urlencode, urlparse, parse_qs
from typing import Optional, Dict, Any, List, Tuple, Union
from PIL import Image

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
        self.last_uploaded_image = None  # Store the last uploaded image name
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
    
    def _get_image_headers(self) -> Dict[str, str]:
        """Get headers specifically for image requests"""
        return {
            "X-C3-API-KEY": self.api_key,
            "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "sec-fetch-dest": "image",
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
        
        upload_url = f"{self.server_url}/upload/image"
        
        try:
            with open(file_path, 'rb') as f:
                files = {'image': (filename, f)}
                data = {'type': file_type}
                
                response = self.session.post(upload_url, files=files, data=data)
                
                if response.status_code == 200:
                    response_data = response.json()
                    uploaded_name = response_data.get('name')
                    logger.info(f"✅ File uploaded successfully: {uploaded_name}")
                    self.last_uploaded_image = uploaded_name  # Store the uploaded image name
                    return uploaded_name
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
    
    def validate_workflow(self, workflow: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate that a workflow has the required structure and nodes
        """
        errors = []
        warnings = []
        
        if not workflow:
            errors.append('Workflow is null or undefined')
            return {"valid": False, "errors": errors, "warnings": warnings}
        
        # Check different workflow formats
        has_nodes_array = isinstance(workflow, dict) and 'nodes' in workflow and isinstance(workflow['nodes'], list)
        has_node_dict = isinstance(workflow, dict) and any(isinstance(workflow.get(key), dict) and 
                                                         'class_type' in workflow.get(key, {})
                                                         for key in workflow)
        
        # Both formats are invalid
        if not has_nodes_array and not has_node_dict:
            errors.append(f'Workflow has invalid structure: neither nodes array nor node dictionary found')
            return {"valid": False, "errors": errors, "warnings": warnings}
        
        # For image-to-image workflow, we need at least a LoadImage node
        load_image_found = False
        clip_encode_found = False
        sampler_found = False
        
        if has_nodes_array:
            # Format: workflow with 'nodes' list (ComfyUI visual editor format)
            for node in workflow['nodes']:
                if isinstance(node, dict):
                    node_type = node.get('type', '')
                    if node_type == "LoadImage":
                        load_image_found = True
                    elif node_type == "CLIPTextEncode":
                        clip_encode_found = True
                    elif node_type == "KSampler":
                        sampler_found = True
        else:
            # Format: node_id -> node dictionary (API format)
            for node_id, node in workflow.items():
                if isinstance(node, dict):
                    class_type = node.get("class_type", "")
                    if class_type == "LoadImage":
                        load_image_found = True
                    elif class_type == "CLIPTextEncode":
                        clip_encode_found = True
                    elif class_type == "KSampler":
                        sampler_found = True
        
        if not load_image_found:
            errors.append('Missing LoadImage node for input image')
        
        if not clip_encode_found:
            errors.append('Missing CLIPTextEncode node for prompts')
        
        if not sampler_found:
            errors.append('Missing KSampler node for image generation')
        
        # Return validation result
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
    
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
        
        # Check workflow format
        if 'nodes' in updated_workflow and isinstance(updated_workflow['nodes'], list):
            # Format: workflow with 'nodes' list (ComfyUI visual editor format)
            logger.info("Updating workflow in visual editor format (nodes array)")
            
            for node in updated_workflow['nodes']:
                if not isinstance(node, dict):
                    continue
                
                # Update LoadImage node
                if node.get('type') == 'LoadImage':
                    # Check if widgets_values exists and fix the image name
                    if 'widgets_values' in node and isinstance(node['widgets_values'], list) and len(node['widgets_values']) > 0:
                        node['widgets_values'][0] = input_image_name
                        logger.info(f"🖼️ Updated LoadImage node widgets_values with image: {input_image_name}")
                    
                    # Also update inputs if they exist
                    if 'inputs' in node and isinstance(node['inputs'], dict):
                        node['inputs']['image'] = input_image_name
                        logger.info(f"🖼️ Updated LoadImage node inputs with image: {input_image_name}")
                
                # Update KSampler node parameters (for denoising strength)
                if node.get('type') == 'KSampler':
                    # Find the denoise parameter in widgets_values
                    if 'widgets_values' in node and isinstance(node['widgets_values'], list):
                        # Typical KSampler widgets: seed, steps, cfg, sampler, scheduler, denoise
                        denoise_index = 6  # Assuming denoise is at index 6, adapt as needed
                        if len(node['widgets_values']) > denoise_index:
                            node['widgets_values'][denoise_index] = strength
                            logger.info(f"🎛️ Set denoising strength to {strength} in widgets_values")
                    
                    # Also update inputs if they exist
                    if 'inputs' in node and isinstance(node['inputs'], dict) and 'denoise' in node['inputs']:
                        node['inputs']['denoise'] = strength
                        logger.info(f"🎛️ Set denoising strength to {strength} in inputs")
                
                # Update CLIPTextEncode nodes for prompt and negative prompt
                if node.get('type') == 'CLIPTextEncode':
                    if node.get('title') == 'Positive Prompt' and 'widgets_values' in node:
                        node['widgets_values'][0] = prompt
                        logger.info(f"✍️ Set positive prompt in widgets_values: {prompt[:50]}...")
                    elif node.get('title') == 'Negative Prompt' and 'widgets_values' in node:
                        node['widgets_values'][0] = negative_prompt
                        logger.info(f"✍️ Set negative prompt in widgets_values: {negative_prompt[:50]}...")
                    
                    # Also update inputs if they exist
                    if 'inputs' in node and isinstance(node['inputs'], dict) and 'text' in node['inputs']:
                        if node.get('title') == 'Positive Prompt':
                            node['inputs']['text'] = prompt
                            logger.info(f"✍️ Set positive prompt in inputs: {prompt[:50]}...")
                        elif node.get('title') == 'Negative Prompt':
                            node['inputs']['text'] = negative_prompt
                            logger.info(f"✍️ Set negative prompt in inputs: {negative_prompt[:50]}...")
                
                # Update image dimensions if necessary
                if ('width' in node.get('inputs', {}) and 'height' in node.get('inputs', {})):
                    node['inputs']['width'] = img_width
                    node['inputs']['height'] = img_height
                    logger.info(f"📐 Updated dimensions to {img_width}x{img_height}")
                
                # Update ImageResize+ or ImageScale nodes if present
                if node.get('type') in ['ImageResize+', 'ImageScale']:
                    if 'inputs' in node:
                        if 'width' in node['inputs']:
                            node['inputs']['width'] = img_width
                        if 'height' in node['inputs']:
                            node['inputs']['height'] = img_height
                        logger.info(f"📐 Updated {node.get('type')} dimensions to {img_width}x{img_height}")
        else:
            # Format: node_id -> node dictionary (API format)
            logger.info("Updating workflow in API format (node dictionary)")
            
            for node_id, node in updated_workflow.items():
                if not isinstance(node, dict):
                    continue
                
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
                    # Try to identify positive/negative prompt nodes by various means
                    is_positive = False
                    is_negative = False
                    
                    # Check node ID (common pattern: positive has lower ID than negative)
                    if "positive" in node_id.lower() or (node.get("_meta", {}).get("title", "")).lower() == "positive prompt":
                        is_positive = True
                    elif "negative" in node_id.lower() or (node.get("_meta", {}).get("title", "")).lower() == "negative prompt":
                        is_negative = True
                    # Try to determine based on current text content
                    elif node.get("inputs", {}).get("text", "").startswith("positive"):
                        is_positive = True
                    elif node.get("inputs", {}).get("text", "").startswith("negative"):
                        is_negative = True
                    
                    if is_positive:
                        node["inputs"]["text"] = prompt
                        logger.info(f"✍️ Set positive prompt: {prompt[:50]}...")
                    elif is_negative:
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
    
    def _transform_workflow_to_api_format(self, workflow: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform a workflow from visual editor format (with nodes array) to API format (node ID → node config)
        """
        # Check if the workflow is already in API format
        if not ('nodes' in workflow and isinstance(workflow['nodes'], list)):
            logger.info("Workflow already in API format, no transformation needed")
            return workflow
        
        logger.info("Transforming workflow from visual format to API format")
        
        # Create the API format prompt (node ID → node config)
        api_format = {}
        
        for node in workflow['nodes']:
            # Skip Note nodes as they're not supported by the API
            if node.get('type') == 'Note':
                logger.info(f"Skipping Note node with ID {node.get('id')} as it's not supported by the API")
                continue
            
            # Get the node ID (ensure it's a string)
            node_id = str(node.get('id'))
            
            # Create the correct node format for the API
            node_config = {
                "class_type": node.get('class_type') or node.get('type'),  # Use class_type property or fallback to type
                "inputs": {},
            }
            
            # Add a _meta field with title if available
            if node.get('title'):
                node_config["_meta"] = {
                    "title": node.get('title')
                }
            
            # Process widget values (parameters) - always call this to ensure required parameters are set
            self._process_widget_values(node, node_config)
            
            # Process connections from links
            if 'inputs' in node and isinstance(node['inputs'], list):
                for input_data in node['inputs']:
                    input_name = input_data.get('name')
                    link_id = input_data.get('link')
                    
                    if input_name and link_id is not None:
                        # Find the corresponding link in the workflow
                        if 'links' in workflow and isinstance(workflow['links'], list):
                            for link in workflow['links']:
                                if link[0] == link_id:  # link[0] is the link ID
                                    source_node_id = str(link[1])  # link[1] is the source node ID
                                    output_index = link[2]  # link[2] is the output index
                                    node_config["inputs"][input_name] = [source_node_id, output_index]
                                    break
            
            # Add the node to the API format
            api_format[node_id] = node_config
        
        # Special handling for LoadImage nodes (ensure they have the correct image input)
        for node_id, node_config in api_format.items():
            if node_config["class_type"] == "LoadImage" and "image" not in node_config["inputs"]:
                # If we know the image name, set it
                if hasattr(self, 'last_uploaded_image') and self.last_uploaded_image:
                    node_config["inputs"]["image"] = self.last_uploaded_image
                else:
                    # Fallback to the default image
                    node_config["inputs"]["image"] = "example.png"
                logger.info(f"Added missing image input to LoadImage node {node_id}")
        
        logger.info(f"Transformed workflow: {len(workflow['nodes'])} nodes → {len(api_format)} API nodes")
        return api_format
    
    def _process_widget_values(self, node: Dict[str, Any], node_config: Dict[str, Any]):
        """Process widget values based on node type"""
        node_type = node.get('type') or node.get('class_type')
        widgets = node.get('widgets_values', [])
        
        # Ensure widgets is a list
        if not isinstance(widgets, list):
            widgets = []
        
        # Handle specific node types
        if node_type == 'LoadImage':
            # For LoadImage, use last_uploaded_image if available
            if hasattr(self, 'last_uploaded_image') and self.last_uploaded_image:
                node_config["inputs"]["image"] = self.last_uploaded_image
            elif len(widgets) > 0:
                node_config["inputs"]["image"] = widgets[0]
            else:
                node_config["inputs"]["image"] = "example.png"
        elif node_type == 'CLIPTextEncode':
            # Extract text from widgets if available
            if len(widgets) > 0:
                node_config["inputs"]["text"] = widgets[0]
            else:
                # Use an empty string as default for text inputs
                node_config["inputs"]["text"] = ""
        elif node_type == 'KSampler':
            # Typical KSampler widgets: seed, steps, cfg, sampler_name, scheduler, denoise
            try:
                node_config["inputs"]["seed"] = int(widgets[0]) if widgets and widgets[0] != "randomize" else 0
            except (IndexError, ValueError):
                node_config["inputs"]["seed"] = 0
            
            try:
                node_config["inputs"]["steps"] = int(widgets[1]) if len(widgets) > 1 and widgets[1] != "randomize" else 20
            except (IndexError, ValueError):
                node_config["inputs"]["steps"] = 20
            
            try:
                node_config["inputs"]["cfg"] = float(widgets[2]) if len(widgets) > 2 else 7.0
            except (IndexError, ValueError):
                node_config["inputs"]["cfg"] = 7.0
            
            # Ensure sampler_name is in the allowed list
            allowed_samplers = ["euler", "euler_ancestral", "heun", "dpm_2", "dpm_2_ancestral", 
                               "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral", 
                               "dpmpp_sde", "dpmpp_sde_gpu", "dpmpp_2m", "dpmpp_2m_sde", 
                               "dpmpp_3m_sde", "ddpm", "lcm", "ddim", "uni_pc", "uni_pc_bh2"]
            try:
                sampler = widgets[3] if len(widgets) > 3 and widgets[3] in allowed_samplers else "euler_ancestral"
            except (IndexError, ValueError):
                sampler = "euler_ancestral"
            node_config["inputs"]["sampler_name"] = sampler
            
            # Ensure scheduler is in the allowed list
            allowed_schedulers = ['normal', 'karras', 'exponential', 'sgm_uniform', 
                                 'simple', 'ddim_uniform', 'beta', 'linear_quadratic', 'kl_optimal']
            try:
                scheduler = widgets[4] if len(widgets) > 4 and widgets[4] in allowed_schedulers else "normal"
            except (IndexError, ValueError):
                scheduler = "normal"
            node_config["inputs"]["scheduler"] = scheduler
            
            try:
                node_config["inputs"]["denoise"] = float(widgets[6]) if len(widgets) > 6 else 1.0
            except (IndexError, ValueError):
                node_config["inputs"]["denoise"] = 1.0
        elif node_type == 'EmptyLatentImage':
            try:
                node_config["inputs"]["width"] = int(widgets[0]) if len(widgets) > 0 else 512
            except (IndexError, ValueError):
                node_config["inputs"]["width"] = 512
                
            try:
                node_config["inputs"]["height"] = int(widgets[1]) if len(widgets) > 1 else 512
            except (IndexError, ValueError):
                node_config["inputs"]["height"] = 512
                
            try:
                node_config["inputs"]["batch_size"] = int(widgets[2]) if len(widgets) > 2 else 1
            except (IndexError, ValueError):
                node_config["inputs"]["batch_size"] = 1
        elif node_type == 'SaveImage':
            # Ensure filename_prefix is set (required parameter)
            timestamp = time.strftime("%Y%m%d-%H%M%S")
            try:
                node_config["inputs"]["filename_prefix"] = widgets[0] if widgets else f"image_{timestamp}"
            except (IndexError, ValueError):
                node_config["inputs"]["filename_prefix"] = f"image_{timestamp}"
        elif node_type == 'VAELoader':
            # Set required parameters for VAELoader
            try:
                node_config["inputs"]["vae_name"] = widgets[0] if widgets else "sd3_vae.safetensors"
            except (IndexError, ValueError):
                node_config["inputs"]["vae_name"] = "sd3_vae.safetensors"
        elif node_type == 'QuadrupleCLIPLoader':
            # Set required parameters for QuadrupleCLIPLoader
            default_clip = "CLIP-ViT-H-16-laion2B-s32B-b79K.safetensors"
            try:
                node_config["inputs"]["clip_name1"] = widgets[0] if len(widgets) > 0 else default_clip
            except (IndexError, ValueError):
                node_config["inputs"]["clip_name1"] = default_clip
                
            try:
                node_config["inputs"]["clip_name2"] = widgets[1] if len(widgets) > 1 else default_clip
            except (IndexError, ValueError):
                node_config["inputs"]["clip_name2"] = default_clip
                
            try:
                node_config["inputs"]["clip_name3"] = widgets[2] if len(widgets) > 2 else default_clip
            except (IndexError, ValueError):
                node_config["inputs"]["clip_name3"] = default_clip
                
            try:
                node_config["inputs"]["clip_name4"] = widgets[3] if len(widgets) > 3 else default_clip
            except (IndexError, ValueError):
                node_config["inputs"]["clip_name4"] = default_clip
        elif node_type == 'UNETLoader':
            # Set required parameters for UNETLoader
            try:
                node_config["inputs"]["unet_name"] = widgets[0] if widgets else "sd3_unet.safetensors"
            except (IndexError, ValueError):
                node_config["inputs"]["unet_name"] = "sd3_unet.safetensors"
                
            try:
                node_config["inputs"]["weight_dtype"] = widgets[1] if len(widgets) > 1 else "default"
            except (IndexError, ValueError):
                node_config["inputs"]["weight_dtype"] = "default"
        elif node_type == 'ModelSamplingSD3':
            # Set required parameters for ModelSamplingSD3
            try:
                node_config["inputs"]["shift"] = int(widgets[0]) if widgets else 5
            except (IndexError, ValueError):
                node_config["inputs"]["shift"] = 5
        elif node_type == 'ImageResize+':
            # Set required parameters for ImageResize+
            try:
                node_config["inputs"]["width"] = int(widgets[0]) if len(widgets) > 0 else 512
            except (IndexError, ValueError):
                node_config["inputs"]["width"] = 512
                
            try:
                node_config["inputs"]["height"] = int(widgets[1]) if len(widgets) > 1 else 512
            except (IndexError, ValueError):
                node_config["inputs"]["height"] = 512
                
            # Fixed parameters - use correct values from allowed list
            node_config["inputs"]["method"] = "keep proportion"  # Allowed: 'stretch', 'keep proportion', 'fill / crop', 'pad'
            node_config["inputs"]["interpolation"] = "nearest"  # This seems to be allowed
            node_config["inputs"]["condition"] = "always"  # This seems to be allowed
            node_config["inputs"]["multiple_of"] = 2  # This seems to be allowed
        elif node_type == 'VAEDecode' or node_type == 'VAEEncode':
            # These nodes typically don't need additional parameters
            pass
        else:
            # For unknown node types, log a warning
            logger.warning(f"No specific handler for node type {node_type}, widgets may not be properly processed")

    def queue_workflow(self, workflow: Dict[str, Any]) -> Optional[str]:
        """Queue a workflow for execution on ComfyUI"""
        try:
            prompt_url = f"{self.server_url}/prompt"
            
            # Transform workflow to API format if needed
            api_workflow = self._transform_workflow_to_api_format(workflow)
            
            # Setup the prompt data
            prompt_data = {
                "prompt": api_workflow,
                "client_id": self.client_id
            }
            
            response = self.session.post(
                prompt_url, 
                json=prompt_data
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
            history_url = f"{self.server_url}/history/{prompt_id}"
            response = self.session.get(history_url)
            
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
        - is_complete: Whether the workflow has completed
        - execution_data: The execution data if complete (None otherwise)
        - error_message: Error message if failed (None otherwise)
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
            
            # Extract nodes that executed successfully
            executed_nodes = []
            for node_id, node_output in outputs.items():
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
                            "type": "image",  # For image-to-image workflow, all outputs are images
                            "subfolder": output.get("subfolder", ""),
                            "url": self.get_image_url(output["filename"], output.get("subfolder", ""))
                        }
                        output_files.append(output_file)
            
            logger.info(f"📋 Found {len(output_files)} output files")
            return output_files
            
        except Exception as e:
            logger.error(f"❌ Error getting output files: {str(e)}")
            return []
    
    def get_image_url(self, filename: str, subfolder: str = "") -> str:
        """
        Get the direct URL for an image
        This returns a URL with the type=output parameter
        """
        params = {
            "filename": f"{subfolder}/{filename}" if subfolder else filename,
            "type": "output"
        }
        url = f"{self.server_url}/view?{urlencode(params)}"
        return url
    
    def get_clean_image_url(self, filename: str, subfolder: str = "") -> str:
        """
        Get a direct URL for an image without the type=output parameter
        This is similar to the cleanDirectUrl in the JS implementation
        """
        params = {
            "filename": f"{subfolder}/{filename}" if subfolder else filename
        }
        url = f"{self.server_url}/view?{urlencode(params)}"
        return url
    
    def prepare_image_for_viewing(self, image_url: str) -> str:
        """
        Two-step approach to prepare an image for viewing
        
        Step 1: First make a request through the session to set up cookies/authentication
        Step 2: Return the direct URL that should now work with the established session
        """
        if not image_url:
            logger.error("❌ No image URL provided")
            return ""
            
        try:
            logger.info(f"🔍 Preparing image for viewing: {image_url}")
            
            # Step 1: First access the URL to set cookies/authentication
            response = self.session.get(
                image_url,
                headers=self._get_headers(),
                stream=True  # Don't download the entire file, just establish session
            )
            
            # Close the response without reading the entire content
            response.close()
            
            if response.status_code == 200:
                logger.info("✅ Image URL accessed successfully, authentication prepared")
                return image_url
            else:
                logger.warning(f"⚠️ Failed to access image: {response.status_code}")
                return image_url
                
        except Exception as e:
            logger.error(f"❌ Error preparing image: {str(e)}")
            return image_url
    
    def download_file(self, filename: str, output_dir: str, subfolder: str = "") -> Optional[str]:
        """
        Download a file from the ComfyUI server using a two-step approach
        Returns the path to the downloaded file
        """
        try:
            logger.info(f"📥 Downloading file: {filename}")
            
            # Ensure output directory exists
            os.makedirs(output_dir, exist_ok=True)
            
            # Get both URL formats for robustness
            image_url = self.get_image_url(filename, subfolder)
            clean_url = self.get_clean_image_url(filename, subfolder)
            
            # Output file path
            output_path = os.path.join(output_dir, filename)
            
            # Try the two-step approach with the standard URL
            success = self._download_with_two_step_approach(image_url, output_path)
            
            # If that fails, try the clean URL
            if not success:
                logger.info("🔄 Trying alternate URL format...")
                success = self._download_with_two_step_approach(clean_url, output_path)
            
            # If both approaches fail, try a direct download with API key in headers
            if not success:
                logger.info("🔄 Trying direct download with API key in headers...")
                success = self._download_direct_with_api_key(clean_url, output_path)
            
            if success:
                logger.info(f"✅ Successfully downloaded to: {output_path}")
                return output_path
            else:
                logger.error("❌ All download attempts failed")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error downloading file: {str(e)}")
            return None
    
    def _download_with_two_step_approach(self, url: str, output_path: str) -> bool:
        """
        Download a file using the two-step approach for authentication
        Step 1: Access the URL with session to establish authentication
        Step 2: Download the file using the same session
        """
        try:
            # Step 1: Prepare authentication by accessing the URL first
            self.prepare_image_for_viewing(url)
            
            # Step 2: Now download the file using the same session
            response = self.session.get(
                url,
                headers=self._get_image_headers(),
                stream=True
            )
            
            if response.status_code == 200:
                with open(output_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                return True
            else:
                logger.warning(f"⚠️ Two-step download failed with status: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error in two-step download: {str(e)}")
            return False
    
    def _download_direct_with_api_key(self, url: str, output_path: str) -> bool:
        """Direct download with API key in both headers and cookies"""
        try:
            # Create a new request with both header and cookie authentication
            headers = self._get_image_headers()
            
            # Try a completely fresh session with cookies
            session = requests.Session()
            session.cookies.set("c3_api_key", self.api_key, domain=urlparse(url).netloc)
            
            response = session.get(
                url,
                headers=headers,
                stream=True
            )
            
            if response.status_code == 200:
                with open(output_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                return True
            else:
                logger.warning(f"⚠️ Direct download failed with status: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error in direct download: {str(e)}")
            return False
    
    def download_and_encode_base64(self, filename: str, subfolder: str = "") -> Optional[str]:
        """
        Download a file and encode it as base64 for caching or embedding
        Returns the base64-encoded string
        """
        try:
            # Get both URL formats for robustness
            image_url = self.get_image_url(filename, subfolder)
            
            # First establish authentication
            self.prepare_image_for_viewing(image_url)
            
            # Now download the file
            response = self.session.get(
                image_url,
                headers=self._get_image_headers()
            )
            
            if response.status_code == 200:
                # Convert to base64
                base64_data = base64.b64encode(response.content).decode('utf-8')
                mime_type = response.headers.get('content-type', 'image/png')
                data_url = f"data:{mime_type};base64,{base64_data}"
                return data_url
            else:
                logger.error(f"❌ Failed to download for base64 encoding: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error downloading for base64 encoding: {str(e)}")
            return None
    
    def wait_for_workflow_completion(self, prompt_id: str, timeout_minutes: int = 15, 
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
        check_interval = 5.0  # Start with 5 seconds between checks
        
        # Wait a moment before first check
        time.sleep(2)
        
        while True:
            # Check for timeout
            elapsed_time = time.time() - start_time
            if elapsed_time > timeout_seconds:
                logger.error(f"⏰ Workflow processing timed out after {timeout_minutes} minutes")
                return False
            
            # Calculate percentage completion based on time
            percent_complete = min(95, int((elapsed_time / timeout_seconds) * 100))
            
            # Check status
            is_complete, history, error_msg = self.check_workflow_status(prompt_id)
            
            # If there's a callback, call it
            if status_callback:
                status = f"{percent_complete}% - {error_msg}" if error_msg else f"{percent_complete}%"
                status_callback(status)
            
            # If complete, return success
            if is_complete:
                if status_callback:
                    status_callback("100% - Complete")
                logger.info("✅ Workflow completed successfully")
                return True
            
            # If there's an error, return failure
            if error_msg and "Error:" in error_msg:
                logger.error(f"❌ Workflow failed: {error_msg}")
                return False
            
            # Adaptive waiting: increase interval gradually to reduce polling frequency
            check_interval = min(30, check_interval * 1.2)  # Cap at 30 seconds
            time.sleep(check_interval)
    
    def cache_image_to_file(self, image_url: str, cache_dir: str, filename: str) -> Optional[str]:
        """
        Cache an image to a local file for later use
        """
        try:
            # Create cache directory if it doesn't exist
            os.makedirs(cache_dir, exist_ok=True)
            
            # Generate a clean cache path
            cache_path = os.path.join(cache_dir, f"cache_{filename}")
            
            # Download and save the file
            success = self._download_with_two_step_approach(image_url, cache_path)
            
            if success:
                logger.info(f"✅ Image cached to: {cache_path}")
                return cache_path
            else:
                logger.error("❌ Failed to cache image")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error caching image: {str(e)}")
            return None 