#!/usr/bin/env python3
"""
🎬 Image to Video Generator

This script transforms static images into dynamic videos using ComfyUI through the Comput3 platform.
It implements the WanVideo Image-to-Video workflow to create short videos from still images.
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
    parser = argparse.ArgumentParser(description="Transform still images into dynamic videos")
    parser.add_argument("--image", "-i", type=str, required=True, help="Path to image file")
    parser.add_argument("--output-dir", "-o", type=str, default=DEFAULT_OUTPUT_DIR, 
                        help=f"Directory to save output files (default: {DEFAULT_OUTPUT_DIR})")
    parser.add_argument("--prompt", "-p", type=str, 
                        default="astronauts looking around a futuristic spaceship cockpit",  
                        help="Text prompt to guide video generation (default: astronauts in spaceship)")
    parser.add_argument("--negative-prompt", "-n", type=str, 
                        default="static, blurry details, subtitles, low quality, JPEG artifacts, ugly, deformed, extra fingers",
                        help="Negative text prompt to avoid unwanted elements")
    parser.add_argument("--timeout", "-t", type=int, default=15,
                        help="Timeout in minutes (default: 15)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    
    return parser.parse_args()

def setup_logging(verbose: bool = False):
    """Set up logging configuration"""
    log_level = logging.DEBUG if verbose else logging.INFO
    
    # Ensure output directory exists
    os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)
    log_file = os.path.join(DEFAULT_OUTPUT_DIR, "img2vid_generator.log")
    
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
    print("🎬 Image to Video Generator")
    print("=" * 60)
    
    # Check requirements
    if not check_requirements():
        return 1
    
    # Check if input file exists
    if not os.path.exists(args.image):
        logging.error(f"🖼️ Image file not found: {args.image}")
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
        logging.error(f"💡 Make sure the workflow template exists at: {WORKFLOW_TEMPLATE_PATH}")
        return 1
    
    # Update workflow with image inputs
    logging.info("🔄 Updating workflow with inputs...")
    updated_workflow = comfy_client.update_workflow(workflow, image_name)
    
    # Update text prompts in the workflow
    for node_id, node in updated_workflow["nodes"].items():
        if node.get("type") == "WanVideoTextEncode" and "widgets_values" in node:
            if len(node["widgets_values"]) >= 2:
                node["widgets_values"][0] = args.prompt
                node["widgets_values"][1] = args.negative_prompt
                logging.info(f"✍️ Set prompt: {args.prompt}")
                logging.info(f"❌ Set negative prompt: {args.negative_prompt}")
    
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
        logging.error("   • Image size or format issues")
        return 1
    
    # Step 5: Get output files
    logging.info("🔍 Getting output files...")
    output_files = comfy_client.get_output_files(prompt_id)
    
    if not output_files:
        logging.error("❌ No output files found. Exiting.")
        return 1
    
    # Get videos from outputs
    videos = [f for f in output_files if f["type"] == "video"]
    
    if not videos:
        logging.error("❌ No videos found in output.")
        return 1
    
    # Step 6: Download output files
    logging.info(f"📥 Downloading output videos to: {args.output_dir}")
    
    # Find VHS_VideoCombine node output (typically the final video)
    success = False
    for video in videos:
        output_path = comfy_client.download_file(
            video["filename"],
            args.output_dir,
            video["subfolder"]
        )
        if output_path:
            success = True
            print("\n" + "=" * 60)
            print(f"✨ Video generation complete! ✨")
            print(f"📁 Output saved to: {output_path}")
            print("=" * 60)
            break
    
    if not success:
        logging.error("❌ Failed to download any videos.")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main()) 