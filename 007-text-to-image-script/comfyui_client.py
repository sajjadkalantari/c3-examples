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
        Similar to validateWorkflow in the JavaScript version
        """
        errors = []
        warnings = []
        
        if not workflow:
            errors.append('Workflow is null or undefined')
            return {"valid": False, "errors": errors, "warnings": warnings}
        
        if not isinstance(workflow, dict):
            errors.append(f'Workflow is not an object: {type(workflow)}')
            return {"valid": False, "errors": errors, "warnings": warnings}
        
        # Check if workflow has nodes array
        if "nodes" not in workflow:
            errors.append('Workflow is missing "nodes" property')
        elif not isinstance(workflow["nodes"], list):
            errors.append(f'Workflow "nodes" is not an array: {type(workflow["nodes"])}')
        elif not workflow["nodes"]:
            errors.append('Workflow "nodes" array is empty')
        
        # If nodes exist, check for required node types
        if "nodes" in workflow and isinstance(workflow["nodes"], list):
            # Count nodes by type or title
            node_counts = {
                "positive_prompt": 0,
                "negative_prompt": 0,
                "sampler": 0,
                "latent_image": 0,
                "quadruple_clip": 0,
                "model_sampling": 0,
                "vae": 0,
                "unet": 0
            }
            
            # Log node types for debugging
            node_types = [node.get("type", "unknown") for node in workflow["nodes"]]
            logger.debug(f"Workflow node types: {', '.join(node_types)}")
            
            for node in workflow["nodes"]:
                if node["type"] == "CLIPTextEncode":
                    if node.get("title") == "Positive Prompt":
                        node_counts["positive_prompt"] += 1
                    elif node.get("title") == "Negative Prompt":
                        node_counts["negative_prompt"] += 1
                elif node["type"] in ["KSampler", "SONICSampler"]:
                    node_counts["sampler"] += 1
                elif node["type"] in ["EmptySD3LatentImage", "EmptyLatentImage"]:
                    node_counts["latent_image"] += 1
                elif node["type"] == "QuadrupleCLIPLoader":
                    node_counts["quadruple_clip"] += 1
                    # Validate QuadrupleCLIPLoader has required widget values
                    if "widgets_values" in node:
                        if len(node["widgets_values"]) < 4:
                            errors.append(f'QuadrupleCLIPLoader node {node.get("id")} missing required CLIP model values')
                elif node["type"] == "ModelSamplingSD3":
                    node_counts["model_sampling"] += 1
                    # Validate ModelSamplingSD3 has required widget values
                    if "widgets_values" in node:
                        if len(node["widgets_values"]) < 1:
                            warnings.append(f'ModelSamplingSD3 node {node.get("id")} missing shift value, will use default')
                elif node["type"] == "VAELoader":
                    node_counts["vae"] += 1
                elif node["type"] == "UNETLoader":
                    node_counts["unet"] += 1
            
            # Report missing required nodes
            if node_counts["positive_prompt"] == 0:
                errors.append('Missing positive prompt node (CLIPTextEncode with title "Positive Prompt")')
            
            if node_counts["negative_prompt"] == 0:
                errors.append('Missing negative prompt node (CLIPTextEncode with title "Negative Prompt")')
            
            if node_counts["sampler"] == 0:
                errors.append('Missing sampler node (KSampler or SONICSampler)')
            
            if node_counts["latent_image"] == 0:
                errors.append('Missing latent image node (EmptySD3LatentImage or EmptyLatentImage)')
            
            if node_counts["quadruple_clip"] == 0:
                errors.append('Missing QuadrupleCLIPLoader node')
            
            if node_counts["model_sampling"] == 0:
                warnings.append('Missing ModelSamplingSD3 node (optional)')
            
            if node_counts["vae"] == 0:
                errors.append('Missing VAELoader node')
            
            if node_counts["unet"] == 0:
                errors.append('Missing UNETLoader node')
            
            # Check for links array if we have nodes
            if "links" not in workflow:
                errors.append('Workflow is missing "links" array')
            elif not isinstance(workflow["links"], list):
                errors.append(f'Workflow "links" is not an array: {type(workflow["links"])}')
            
            # Validate node structure
            for node in workflow["nodes"]:
                if "id" not in node:
                    errors.append(f'Node missing required "id" property: {node.get("type", "unknown")}')
                if "type" not in node:
                    errors.append(f'Node missing required "type" property: {node.get("id", "unknown")}')
                if "inputs" in node and not isinstance(node["inputs"], list):
                    errors.append(f'Node "inputs" is not an array: {node.get("id", "unknown")}')
                
                # Validate widget values for specific node types
                if "widgets_values" in node:
                    if node["type"] == "QuadrupleCLIPLoader" and len(node["widgets_values"]) < 4:
                        errors.append(f'QuadrupleCLIPLoader node {node.get("id")} missing required CLIP model values')
                    elif node["type"] == "ModelSamplingSD3" and len(node["widgets_values"]) < 1:
                        warnings.append(f'ModelSamplingSD3 node {node.get("id")} missing shift value, will use default')
                    elif node["type"] == "KSampler" and len(node["widgets_values"]) < 7:
                        errors.append(f'KSampler node {node.get("id")} missing required values')
                    elif node["type"] == "EmptySD3LatentImage" and len(node["widgets_values"]) < 3:
                        errors.append(f'EmptySD3LatentImage node {node.get("id")} missing required dimension values')
        
        validation_result = {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings
        }
        
        # Log validation result
        if validation_result["valid"]:
            logger.info("✅ Workflow validation passed")
            if warnings:
                logger.warning("⚠️ Validation warnings: " + ", ".join(warnings))
            logger.debug("Node counts:", extra={"node_counts": node_counts})
        else:
            logger.error(f"❌ Workflow validation failed: {', '.join(errors)}")
            if warnings:
                logger.warning("⚠️ Validation warnings: " + ", ".join(warnings))
            logger.debug("Node counts:", extra={"node_counts": node_counts})
        
        return validation_result
    
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
        sonic_sampler_node = None
        load_audio_node = None
        
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
            elif node["type"] == "SONICSampler":
                sonic_sampler_node = node
            elif node["type"] == "LoadAudio":
                load_audio_node = node
        
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
        
        # Update SONIC sampler parameters if present
        if sonic_sampler_node:
            if seed is not None:
                if "inputs" in sonic_sampler_node and "seed" in sonic_sampler_node["inputs"]:
                    sonic_sampler_node["inputs"]["seed"] = seed
                    logger.info(f"⚙️ Updated SONIC sampler seed to {seed}")
            
            if "inputs" in sonic_sampler_node and "inference_steps" in sonic_sampler_node["inputs"]:
                sonic_sampler_node["inputs"]["inference_steps"] = steps
                logger.info(f"⚙️ Updated SONIC sampler steps to {steps}")
        
        return updated_workflow
    
    def update_text_to_image_workflow(self, workflow: Dict[str, Any], 
                                      positive_prompt: str, 
                                      negative_prompt: str, 
                                      width: int = 1024, 
                                      height: int = 1024, 
                                      seed: int = None, 
                                      steps: int = 35) -> Dict[str, Any]:
        """
        Update the workflow with text-to-image parameters
        Similar to updateTextToImageWorkflow in the JavaScript version
        """
        # Validate input workflow
        validation = self.validate_workflow(workflow)
        if not validation["valid"]:
            error_message = f"Invalid workflow: {', '.join(validation['errors'])}"
            logger.error(f"❌ {error_message}")
            raise ValueError(error_message)
        
        logger.info(f"Updating workflow with parameters: prompt={positive_prompt[:20]}..., "
                   f"negativePrompt={negative_prompt[:20]}..., width={width}, height={height}, "
                   f"seed={seed}, steps={steps}")
        
        # Make a copy of the workflow to avoid modifying the original
        updated_workflow = json.loads(json.dumps(workflow))
        
        # Log diagnostic info
        logger.info(f"Workflow contains {len(updated_workflow['nodes'])} nodes")
        
        # Track if we found and updated each required node
        nodes_updated = {
            "positive_prompt": False,
            "negative_prompt": False,
            "sampler": False,
            "latent": False
        }
        
        # Find and update nodes
        for node in updated_workflow["nodes"]:
            logger.debug(f"Inspecting node: id={node['id']}, type={node['type']}, "
                        f"title={node.get('title', 'N/A')}")
            
            # Update positive prompt
            if node["type"] == "CLIPTextEncode" and node.get("title") == "Positive Prompt":
                if "widgets_values" in node:
                    node["widgets_values"][0] = positive_prompt
                    logger.info("✅ Updated positive prompt")
                    nodes_updated["positive_prompt"] = True
            
            # Update negative prompt
            elif node["type"] == "CLIPTextEncode" and node.get("title") == "Negative Prompt":
                if "widgets_values" in node:
                    node["widgets_values"][0] = negative_prompt
                    logger.info("✅ Updated negative prompt")
                    nodes_updated["negative_prompt"] = True
            
            # Update KSampler settings
            elif node["type"] == "KSampler":
                if "widgets_values" in node:
                    logger.debug(f"Found KSampler node with widgets: {json.dumps(node['widgets_values'])}")
                    
                    # Update seed if provided
                    if seed is not None and len(node["widgets_values"]) > 0:
                        node["widgets_values"][0] = seed
                        logger.info(f"⚙️ Updated KSampler seed to {seed}")
                    
                    # Update steps
                    if len(node["widgets_values"]) > 2:
                        node["widgets_values"][2] = steps
                        logger.info(f"⚙️ Updated KSampler steps to {steps}")
                    
                    nodes_updated["sampler"] = True
            
            # Update SONICSampler settings (if present)
            elif node["type"] == "SONICSampler":
                if "widgets_values" in node:
                    logger.debug(f"Found SONICSampler node with widgets: {json.dumps(node['widgets_values'])}")
                    
                    if seed is not None:
                        # Find the seed value widget index
                        seed_index = 0  # Adjust based on actual workflow
                        if len(node["widgets_values"]) > seed_index:
                            node["widgets_values"][seed_index] = seed
                            logger.info(f"⚙️ Updated SONICSampler seed to {seed}")
                    
                    # Find the steps value widget index
                    steps_index = 1  # Adjust based on actual workflow
                    if len(node["widgets_values"]) > steps_index:
                        node["widgets_values"][steps_index] = steps
                        logger.info(f"⚙️ Updated SONICSampler steps to {steps}")
                    
                    nodes_updated["sampler"] = True
            
            # Update latent image dimensions
            elif node["type"] in ["EmptyLatentImage", "EmptySD3LatentImage"]:
                if "widgets_values" in node:
                    logger.debug(f"Found latent image node with widgets: {json.dumps(node['widgets_values'])}")
                    
                    if len(node["widgets_values"]) >= 2:
                        node["widgets_values"][0] = width
                        node["widgets_values"][1] = height
                        logger.info(f"📐 Updated image dimensions to {width}x{height}")
                        nodes_updated["latent"] = True
            
            # Update SaveImage node if present
            elif node["type"] == "SaveImage" and "widgets_values" in node:
                # Generate a unique filename based on the prompt and timestamp
                timestamp = time.strftime("%Y%m%d-%H%M%S")
                prompt_slug = ''.join(c if c.isalnum() else '_' for c in positive_prompt[:20])
                filename = f"{prompt_slug}_{timestamp}"
                
                # Update the filename widget value
                if node["widgets_values"]:
                    node["widgets_values"][0] = filename
                    logger.info(f"💾 Updated save filename to: {filename}")
        
        # Log whether all required nodes were found and updated
        logger.info(f"Required nodes updated: positive={nodes_updated['positive_prompt']}, "
                   f"negative={nodes_updated['negative_prompt']}, "
                   f"sampler={nodes_updated['sampler']}, "
                   f"latent={nodes_updated['latent']}")
        
        # Warn about any missing updates
        if not nodes_updated["positive_prompt"]:
            logger.warning("⚠️ Positive prompt node not found in workflow")
        if not nodes_updated["negative_prompt"]:
            logger.warning("⚠️ Negative prompt node not found in workflow")
        if not nodes_updated["sampler"]:
            logger.warning("⚠️ Sampler node (KSampler or SONICSampler) not found in workflow")
        if not nodes_updated["latent"]:
            logger.warning("⚠️ Latent image node not found in workflow")
        
        return updated_workflow
    
    def queue_workflow(self, workflow: Dict[str, Any]) -> Optional[str]:
        """Queue a workflow for execution"""
        try:
            logger.info("🚀 Queueing workflow")
            
            # Transform workflow to API format
            api_prompt = self._transform_workflow_to_api_format(workflow)
            
            # Create the final payload
            payload = {
                "prompt": api_prompt,
                "client_id": self.client_id
            }
            
            # If the original workflow had extra_data, include it
            if "extra_data" in workflow:
                payload["extra_data"] = workflow["extra_data"]
            
            # Log the payload structure for debugging
            logger.info(f"Sending payload with {len(api_prompt)} nodes")
            logger.debug(f"Payload structure: {json.dumps(payload, indent=2)}")
            
            response = self.session.post(
                f"{self.server_url}/prompt",
                json=payload
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
    
    def _transform_workflow_to_api_format(self, workflow: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform a visual workflow format to the API format
        Similar to the JavaScript version's transformation logic
        """
        # If it's already in API format, return as is
        if not workflow.get("nodes"):
            if workflow.get("prompt"):
                return workflow["prompt"]
            return workflow
        
        api_prompt = {}
        
        # Process each node
        for node in workflow["nodes"]:
            # Skip Note nodes as they're not supported by the API
            if node["type"] == "Note":
                logger.debug(f"Skipping Note node with ID {node['id']}")
                continue
            
            # Create the node configuration
            node_config = {
                "class_type": node.get("class_type") or node["type"],
                "inputs": {},
            }
            
            # Add title if present
            if node.get("title"):
                node_config["_meta"] = {"title": node["title"]}
            
            # Process inputs from both connections and widget values
            self._process_node_inputs(node, node_config, workflow)
            
            # Add to API prompt
            api_prompt[str(node["id"])] = node_config
        
        return api_prompt
    
    def _process_node_inputs(self, node: Dict[str, Any], node_config: Dict[str, Any], workflow: Dict[str, Any]):
        """Process node inputs from both connections and widget values"""
        # Process widget values first
        if "widgets_values" in node:
            widget_values = node["widgets_values"]
            
            # Handle different node types
            if node["type"] == "CLIPTextEncode":
                if node.get("title") == "Positive Prompt":
                    node_config["inputs"]["text"] = widget_values[0] if widget_values else ""
                elif node.get("title") == "Negative Prompt":
                    node_config["inputs"]["text"] = widget_values[0] if widget_values else ""
            
            elif node["type"] == "KSampler":
                if len(widget_values) >= 7:
                    node_config["inputs"].update({
                        "seed": widget_values[0],
                        "steps": widget_values[2],
                        "cfg": widget_values[3],
                        "sampler_name": widget_values[4],
                        "scheduler": widget_values[5],
                        "denoise": widget_values[6]
                    })
            
            elif node["type"] in ["EmptyLatentImage", "EmptySD3LatentImage"]:
                if len(widget_values) >= 3:
                    node_config["inputs"].update({
                        "width": widget_values[0],
                        "height": widget_values[1],
                        "batch_size": widget_values[2]
                    })
            
            elif node["type"] == "SaveImage":
                if widget_values:
                    node_config["inputs"]["filename_prefix"] = widget_values[0]
            
            elif node["type"] == "VAELoader":
                if widget_values:
                    node_config["inputs"]["vae_name"] = widget_values[0]
            
            elif node["type"] == "UNETLoader":
                if len(widget_values) >= 2:
                    node_config["inputs"].update({
                        "unet_name": widget_values[0],
                        "weight_dtype": widget_values[1] or "default"
                    })
            
            elif node["type"] == "QuadrupleCLIPLoader":
                if len(widget_values) >= 4:
                    node_config["inputs"].update({
                        "clip_name1": widget_values[0],  # clip_l_hidream.safetensors
                        "clip_name2": widget_values[1],  # clip_g_hidream.safetensors
                        "clip_name3": widget_values[2],  # t5xxl_fp8_e4m3fn_scaled.safetensors
                        "clip_name4": widget_values[3]   # llama_3.1_8b_instruct_fp8_scaled.safetensors
                    })
                    logger.info(f"✅ Updated QuadrupleCLIPLoader with CLIP models")
            
            elif node["type"] == "ModelSamplingSD3":
                # Handle ModelSamplingSD3 node with default values if needed
                shift_value = widget_values[0] if widget_values and len(widget_values) > 0 else 5
                node_config["inputs"]["shift"] = shift_value
                logger.info(f"✅ Updated ModelSamplingSD3 shift value: {shift_value}")
            
            elif node["type"] == "LoadWanVideoT5TextEncoder":
                if len(widget_values) >= 4:
                    node_config["inputs"].update({
                        "model_name": widget_values[0],
                        "precision": widget_values[1],
                        "load_device": widget_values[2],
                        "quantization": widget_values[3]
                    })
            
            elif node["type"] == "WanVideoVAELoader":
                if len(widget_values) >= 2:
                    node_config["inputs"].update({
                        "model_name": widget_values[0],
                        "precision": widget_values[1]
                    })
            
            elif node["type"] == "WanVideoTextEncode":
                if len(widget_values) >= 3:
                    node_config["inputs"].update({
                        "positive_prompt": widget_values[0],
                        "negative_prompt": widget_values[1],
                        "force_offload": bool(widget_values[2])
                    })
            
            elif node["type"] == "WanVideoSampler":
                if len(widget_values) >= 10:
                    node_config["inputs"].update({
                        "steps": int(widget_values[0]),
                        "cfg": float(widget_values[1]),
                        "shift": int(widget_values[2]),
                        "seed": widget_values[3],
                        "scheduler": widget_values[5] or "unipc",
                        "riflex_freq_index": int(widget_values[6] or 0),
                        "denoise_strength": 1.0,
                        "batched_cfg": bool(widget_values[8]),
                        "rope_function": widget_values[9] or "comfy",
                        "force_offload": bool(widget_values[4])
                    })
            
            elif node["type"] == "WanVideoEmptyEmbeds":
                if len(widget_values) >= 3:
                    node_config["inputs"].update({
                        "width": int(widget_values[0]),
                        "height": int(widget_values[1]),
                        "num_frames": int(widget_values[2])
                    })
            
            elif node["type"] == "WanVideoBlockSwap":
                if len(widget_values) >= 5:
                    node_config["inputs"].update({
                        "blocks_to_swap": int(widget_values[0]),
                        "offload_img_emb": bool(widget_values[1]),
                        "offload_txt_emb": bool(widget_values[2]),
                        "use_non_blocking": bool(widget_values[3]),
                        "vace_blocks_to_swap": int(widget_values[4] or 0)
                    })
            
            elif node["type"] == "WanVideoTorchCompileSettings":
                if len(widget_values) >= 7:
                    node_config["inputs"].update({
                        "backend": widget_values[0],
                        "fullgraph": bool(widget_values[1]),
                        "mode": widget_values[2],
                        "dynamic": bool(widget_values[3]),
                        "dynamo_cache_size_limit": int(widget_values[4]),
                        "compile_transformer_blocks_only": bool(widget_values[5]),
                        "dynamo_recompile_limit": int(widget_values[6] or 128)
                    })
            
            elif node["type"] == "WanVideoModelLoader":
                if len(widget_values) >= 5:
                    node_config["inputs"].update({
                        "model": widget_values[0],
                        "base_precision": widget_values[1],
                        "quantization": widget_values[2],
                        "load_device": widget_values[3],
                        "attention_mode": widget_values[4]
                    })
            
            elif node["type"] == "WanVideoDecode":
                if len(widget_values) >= 5:
                    node_config["inputs"].update({
                        "enable_vae_tiling": bool(widget_values[0]),
                        "tile_x": int(widget_values[1]),
                        "tile_y": int(widget_values[2]),
                        "tile_stride_x": int(widget_values[3]),
                        "tile_stride_y": int(widget_values[4])
                    })
            
            elif node["type"] == "VHS_VideoCombine":
                # Handle VHS_VideoCombine node with object widgets_values
                if isinstance(widget_values, dict):
                    node_config["inputs"].update({
                        "frame_rate": widget_values.get("frame_rate", 16),
                        "loop_count": widget_values.get("loop_count", 0),
                        "filename_prefix": widget_values.get("filename_prefix", "ComfyUI_output"),
                        "format": widget_values.get("format", "video/h264-mp4"),
                        "pix_fmt": widget_values.get("pix_fmt", "yuv420p"),
                        "crf": widget_values.get("crf", 19),
                        "save_metadata": bool(widget_values.get("save_metadata", False)),
                        "trim_to_audio": bool(widget_values.get("trim_to_audio", False)),
                        "pingpong": bool(widget_values.get("pingpong", False)),
                        "save_output": bool(widget_values.get("save_output", True))
                    })
                else:
                    # Handle array form of widgets_values
                    if len(widget_values) >= 10:
                        node_config["inputs"].update({
                            "frame_rate": widget_values[0],
                            "loop_count": widget_values[1],
                            "filename_prefix": widget_values[2],
                            "format": widget_values[3],
                            "pix_fmt": widget_values[4],
                            "crf": widget_values[5],
                            "save_metadata": bool(widget_values[6]),
                            "trim_to_audio": bool(widget_values[7]),
                            "pingpong": bool(widget_values[8]),
                            "save_output": bool(widget_values[9])
                        })
            
            else:
                # For unknown node types, attempt to map widget values to inputs
                # based on node inputs array if available
                if node.get("inputs") and isinstance(node["inputs"], list):
                    for i, input_data in enumerate(node["inputs"]):
                        if i < len(widget_values):
                            node_config["inputs"][input_data["name"]] = widget_values[i]
        
        # Process connections/links
        if "inputs" in node and workflow.get("links"):
            for input_data in node["inputs"]:
                input_name = input_data["name"]
                link_id = input_data.get("link")
                
                if link_id is not None:
                    # Find the corresponding link
                    for link in workflow["links"]:
                        if link[0] == link_id:  # link[0] is the link ID
                            source_node_id = str(link[1])  # link[1] is the source node ID
                            output_index = link[2]  # link[2] is the output index
                            node_config["inputs"][input_name] = [source_node_id, output_index]
                            break
        
        # Special handling for LoadImage nodes
        if node["type"] == "LoadImage":
            # Ensure image input is set
            if "image" not in node_config["inputs"]:
                node_config["inputs"]["image"] = "example.png"
                logger.warning(f"LoadImage node {node['id']} missing image input, using default")
    
    def get_history(self, prompt_id: str) -> Optional[Dict[str, Any]]:
        """Get execution history for a prompt"""
        try:
            response = self.session.get(f"{self.server_url}/history/{prompt_id}")
            
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
        Similar to prepareImageForViewing in JS
        
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
        Similar to storeImageInLocalStorage in JS
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