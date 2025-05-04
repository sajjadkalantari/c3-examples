#!/usr/bin/env python3
"""
🎬 Comput3 Text-to-Video Generator

This script generates videos from text prompts using ComfyUI through the Comput3 platform.
It uses the WanVideo model to produce high-quality videos based on text descriptions.
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
    parser = argparse.ArgumentParser(description="Generate videos from text prompts using Comput3")
    parser.add_argument("--prompt", "-p", type=str, required=True, 
                        help="Text prompt describing the video to generate")
    parser.add_argument("--negative-prompt", "-n", type=str, default="poor quality, blurry, pixelated, low resolution, watermark, signature, text, letters, words", 
                        help="Negative prompt to guide the generation away from unwanted content")
    parser.add_argument("--output-dir", "-o", type=str, default=DEFAULT_OUTPUT_DIR, 
                        help=f"Directory to save output files (default: {DEFAULT_OUTPUT_DIR})")
    parser.add_argument("--timeout", "-t", type=int, default=120,
                        help="Timeout in minutes (default: 120)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    
    return parser.parse_args()

def setup_logging(verbose: bool = False):
    """Set up logging configuration"""
    log_level = logging.DEBUG if verbose else logging.INFO
    
    # Ensure output directory exists
    os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)
    log_file = os.path.join(DEFAULT_OUTPUT_DIR, "text_to_video.log")
    
    # Configure logging
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(levelname)s - %(message)s",
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler()
        ]
    )
    
    # If verbose, set all loggers to DEBUG
    if verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
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
    print("🎬 Comput3 Text-to-Video Generator")
    print("=" * 60)
    
    # Check requirements
    if not check_requirements():
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
    
    # Step 1: Load and update workflow
    logging.info("📋 Loading workflow template...")
    try:
        workflow = comfy_client.load_workflow(WORKFLOW_TEMPLATE_PATH)
    except Exception as e:
        logging.error(f"❌ Failed to load workflow template: {str(e)}")
        return 1
    
    # Update workflow with text prompt
    logging.info(f"🔄 Updating workflow with prompt: {args.prompt[:50]}...")
    updated_workflow = comfy_client.update_workflow(workflow, args.prompt)
    
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
        logging.error("   • Complex prompt requiring more processing time")
        logging.error("   • Server timeout or network issues")
        return 1
    
    # Step 4: Get output files
    logging.info("🔍 Getting output files...")
    output_files = comfy_client.get_output_files(prompt_id)
    
    if not output_files:
        logging.error("❌ No output files found. Exiting.")
        return 1
    
    # Get videos from outputs
    videos = [f for f in output_files if f.get("filename", "").lower().endswith(('.mp4', '.avi', '.mov', '.webm'))]
    
    if not videos:
        logging.error("❌ No videos found in output.")
        return 1
    
    # Step 5: Download output files
    logging.info(f"📥 Downloading output videos to: {args.output_dir}")
    
    # VHS_VideoCombine node output is typically in node 30
    node_30_videos = [v for v in videos if v["node_id"] == "30"]
    
    if node_30_videos:
        # Download the most recent video (last in the list)
        latest_video = node_30_videos[-1]
        logging.info(f"📹 Downloading video: {latest_video['filename']}")
        output_path = comfy_client.download_file(
            latest_video["filename"], 
            args.output_dir,
            latest_video["subfolder"]
        )
        
        if output_path:
            print("\n" + "=" * 60)
            print(f"✨ Video generation complete! ✨")
            print(f"📁 Output saved to: {output_path}")
            print("=" * 60)
        else:
            logging.error("❌ Failed to download video.")
            return 1
    else:
        # If no videos from node 30, try to download any videos found
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