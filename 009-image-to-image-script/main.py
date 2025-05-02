#!/usr/bin/env python3
"""
🎨 Comput3 Image-to-Image Generator

This script transforms input images using ComfyUI through the Comput3 platform.
It takes an input image and text prompts to generate variations.
"""

import os
import argparse
import sys
import logging
from typing import Optional, Dict, List, Any

from config import C3_API_KEY, DEFAULT_OUTPUT_DIR, WORKFLOW_TEMPLATE_PATH
from comput3_api import Comput3API
from comfyui_client import ComfyUIClient

def parse_arguments():
    """Parse command-line arguments"""
    parser = argparse.ArgumentParser(description="Transform images using ComfyUI on Comput3")
    parser.add_argument("--image", "-i", type=str, required=True, help="Path to input image file")
    parser.add_argument("--prompt", "-p", type=str, required=True, help="Positive prompt for image generation")
    parser.add_argument("--negative-prompt", "-n", type=str, default="", 
                       help="Negative prompt for image generation (what to avoid)")
    parser.add_argument("--strength", "-s", type=float, default=0.75,
                       help="Transformation strength (0.0-1.0, higher = more change)")
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
    log_file = os.path.join(DEFAULT_OUTPUT_DIR, "img2img_generator.log")
    
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
        logging.error("💡 Create a workflows directory and add your img2img_generator.json workflow file")
        return False
    
    return True

def main():
    """Main entry point"""
    # Parse arguments
    args = parse_arguments()
    setup_logging(args.verbose)
    
    print("=" * 60)
    print("🎨 Comput3 Image-to-Image Generator")
    print("=" * 60)
    
    # Check requirements
    if not check_requirements():
        return 1
    
    # Check if input files exist
    if not os.path.exists(args.image):
        logging.error(f"🖼️ Image file not found: {args.image}")
        return 1
    
    # Validate strength parameter
    if args.strength < 0.0 or args.strength > 1.0:
        logging.error(f"🎛️ Strength must be between 0.0 and 1.0, got: {args.strength}")
        return 1
    
    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)
    
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
    
    # Step 1: Upload files
    logging.info("📤 Uploading files...")
    
    # Upload image
    image_name = comfy_client.upload_file(args.image, "input")
    if not image_name:
        logging.error("❌ Failed to upload image. Exiting.")
        return 1
    
    # Step 2: Load and update workflow
    logging.info("📋 Loading workflow template...")
    try:
        workflow = comfy_client.load_workflow(WORKFLOW_TEMPLATE_PATH)
    except Exception as e:
        logging.error(f"❌ Failed to load workflow template: {str(e)}")
        return 1
    
    # Update workflow with image and prompts
    logging.info("🔄 Updating workflow with inputs...")
    updated_workflow = comfy_client.update_workflow(
        workflow, 
        image_name, 
        args.prompt, 
        args.negative_prompt,
        args.strength
    )
    
    # Step 3: Queue workflow
    logging.info("🚀 Queueing workflow...")
    prompt_id = comfy_client.queue_workflow(updated_workflow)
    
    if not prompt_id:
        logging.error("❌ Failed to queue workflow. Exiting.")
        return 1
    
    # Step 4: Wait for workflow to complete
    logging.info(f"⏳ Waiting for workflow to complete (max {args.timeout} minutes)...")
    if not comfy_client.wait_for_workflow_completion(prompt_id, args.timeout):
        logging.error("❌ Workflow processing failed or timed out.")
        logging.error("💡 Common reasons for failure:")
        logging.error("   • Server resources insufficient for processing")
        logging.error("   • Server timeout or network issues")
        return 1
    
    # Step 5: Get output files
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
    
    # Step 6: Download output files
    logging.info(f"📥 Downloading output images to: {args.output_dir}")
    
    # Find SaveImage node outputs
    save_image_outputs = [img for img in images if img.get("node_id") and 
                         "save" in img.get("node_id", "").lower()]
    
    # If no SaveImage outputs, use any output images
    target_images = save_image_outputs if save_image_outputs else images
    
    # Download each image
    success = False
    for image in target_images:
        output_path = comfy_client.download_file(
            image["filename"],
            args.output_dir,
            image["subfolder"]
        )
        if output_path:
            success = True
            print(f"✅ Downloaded: {output_path}")
    
    if success:
        print("\n" + "=" * 60)
        print(f"✨ Image transformation complete! ✨")
        print(f"📁 Output saved to: {args.output_dir}")
        print("=" * 60)
    else:
        logging.error("❌ Failed to download any images.")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 