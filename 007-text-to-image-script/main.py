#!/usr/bin/env python3
"""
🎨 Comput3 Text-to-Image Generator

This script generates images from text prompts using ComfyUI through the Comput3 platform.
It leverages a powerful text-to-image model to create high-quality images based on your descriptions.
"""

import os
import argparse
import sys
import logging
import random
from typing import Optional, Dict, List, Any

from config import C3_API_KEY, DEFAULT_OUTPUT_DIR, WORKFLOW_TEMPLATE_PATH
from comput3_api import Comput3API
from comfyui_client import ComfyUIClient

def parse_arguments():
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(description="Generate images from text prompts using Comput3")
    parser.add_argument("--prompt", "-p", type=str, required=True, 
                        help="Positive text prompt describing what you want in the image")
    parser.add_argument("--negative-prompt", "-n", type=str, default="blurry, low quality, distorted, deformed",
                        help="Negative text prompt describing what you don't want in the image")
    parser.add_argument("--width", "-W", type=int, default=1024,
                        help="Width of the generated image (default: 1024)")
    parser.add_argument("--height", "-H", type=int, default=1024,
                        help="Height of the generated image (default: 1024)")
    parser.add_argument("--steps", "-s", type=int, default=35,
                        help="Number of sampling steps (default: 35)")
    parser.add_argument("--seed", type=int, default=None,
                        help="Random seed for reproducible results (default: random)")
    parser.add_argument("--output-dir", "-o", type=str, default=DEFAULT_OUTPUT_DIR, 
                        help=f"Directory to save output files (default: {DEFAULT_OUTPUT_DIR})")
    parser.add_argument("--timeout", "-t", type=int, default=15,
                        help="Timeout in minutes (default: 15)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    
    return parser.parse_args()

def setup_logging(verbose: bool = False):
    """Set up logging configuration"""
    log_level = logging.DEBUG if verbose else logging.INFO
    
    # Ensure output directory exists
    os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)
    log_file = os.path.join(DEFAULT_OUTPUT_DIR, "text_to_image.log")
    
    # Configure logging
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(levelname)s - %(message)s",
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler()
        ]
    )
    
    logging.info(f"📝 Logging to: {log_file}")

def check_requirements():
    """Check if all requirements are met"""
    # Check for API key
    if not C3_API_KEY:
        logging.error("🔑 C3 API key not found. Please set the C3_API_KEY environment variable or add it to .env file.")
        logging.error("🌐 Get your API key from https://launch.comput3.ai")
        return False
    
    # Check if workflow template exists
    if not os.path.exists(WORKFLOW_TEMPLATE_PATH):
        logging.error(f"🔍 Workflow template not found at {WORKFLOW_TEMPLATE_PATH}")
        return False
    
    return True

def main():
    """Main entry point"""
    # Parse arguments
    args = parse_arguments()
    setup_logging(args.verbose)
    
    print("=" * 60)
    print("🎨 Comput3 Text-to-Image Generator")
    print("=" * 60)
    
    # Check requirements
    if not check_requirements():
        return 1
    
    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)
    
    # Generate a random seed if not provided
    seed = args.seed if args.seed is not None else random.randint(0, 2**31 - 1)
    logging.info(f"🎲 Using seed: {seed}")
    
    # Initialize Comput3 API client
    logging.info("🚀 Initializing Comput3 API client...")
    c3_client = Comput3API(C3_API_KEY)
    
    # Get ComfyUI URL from running instance
    comfyui_url = c3_client.get_comfyui_url()
    if not comfyui_url:
        logging.error("❌ No running media instance found.")
        logging.error("💡 Please launch a media instance first at https://launch.comput3.ai")
        return 1
    
    logging.info(f"🖥️ Using ComfyUI instance at: {comfyui_url}")
    
    # Initialize ComfyUI client
    comfy_client = ComfyUIClient(comfyui_url, C3_API_KEY)
    
    # Step 1: Load and update workflow
    logging.info("📋 Loading workflow template...")
    try:
        workflow = comfy_client.load_workflow(WORKFLOW_TEMPLATE_PATH)
    except Exception as e:
        logging.error(f"❌ Failed to load workflow template: {str(e)}")
        return 1
    
    # Update workflow with prompts and parameters
    logging.info("🔄 Updating workflow with inputs...")
    updated_workflow = comfy_client.update_workflow(
        workflow,
        positive_prompt=args.prompt,
        negative_prompt=args.negative_prompt,
        width=args.width,
        height=args.height,
        seed=seed,
        steps=args.steps
    )
    
    # Step 2: Queue workflow
    logging.info("🚀 Queueing workflow...")
    prompt_id = comfy_client.queue_workflow(updated_workflow)
    
    if not prompt_id:
        logging.error("❌ Failed to queue workflow. Exiting.")
        return 1
    
    # Step 3: Wait for workflow to complete
    logging.info(f"⏳ Waiting for workflow to complete (max {args.timeout} minutes)...")
    if not comfy_client.wait_for_workflow_completion(prompt_id, args.timeout):
        logging.error("❌ Workflow processing failed or timed out.")
        logging.error("💡 Common reasons for failure:")
        logging.error("   • Server resources insufficient for processing")
        logging.error("   • Server timeout or network issues")
        return 1
    
    # Step 4: Get output files
    logging.info("🔍 Getting output files...")
    output_files = comfy_client.get_output_files(prompt_id)
    
    if not output_files:
        logging.error("❌ No output files found. Exiting.")
        return 1
    
    # Get images from outputs
    images = [f for f in output_files if f["type"] == "image"]
    
    if not images:
        logging.error("❌ No images found in output.")
        return 1
    
    # Step 5: Download output files
    logging.info(f"📥 Downloading output images to: {args.output_dir}")
    
    # SaveImage node output is typically in node 9
    node_9_images = [img for img in images if img["node_id"] == "9"]
    
    if node_9_images:
        # Download the most recent image (last in the list)
        latest_image = node_9_images[-1]
        logging.info(f"🖼️ Downloading image: {latest_image['filename']}")
        output_path = comfy_client.download_file(
            latest_image["filename"], 
            args.output_dir,
            latest_image["subfolder"]
        )
        
        if output_path:
            print("\n" + "=" * 60)
            print(f"✨ Image generation complete! ✨")
            print(f"📁 Output saved to: {output_path}")
            print("=" * 60)
        else:
            logging.error("❌ Failed to download image.")
            return 1
    else:
        # If no images from node 9, try to download any images found
        success = False
        for image in images:
            output_path = comfy_client.download_file(
                image["filename"],
                args.output_dir,
                image["subfolder"]
            )
            if output_path:
                success = True
                print("\n" + "=" * 60)
                print(f"✨ Image generation complete! ✨")
                print(f"📁 Output saved to: {output_path}")
                print("=" * 60)
                break
        
        if not success:
            logging.error("❌ Failed to download any images.")
            return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 