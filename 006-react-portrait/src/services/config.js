// Configuration settings
const config = {
  // Comput3 API configuration
  C3_API_KEY: process.env.REACT_APP_C3_API_KEY || '',
  C3_API_URL: '/api/v0/workloads',

  // Default paths
  DEFAULT_OUTPUT_DIR: 'output',
  WORKFLOW_TEMPLATE_PATH: '/workflows/avatar_generator.json',
  TEXT_TO_IMAGE_WORKFLOW_PATH: '/workflows/text_to_image.json',
  TEXT_TO_VIDEO_WORKFLOW_PATH: '/workflows/text_to_video.json',
  IMAGE_TO_IMAGE_WORKFLOW_PATH: '/workflows/image_to_image.json',

  // ComfyUI configuration
  DEFAULT_TIMEOUT_MINUTES: 30,
  CHECK_INTERVAL_SECONDS: 30,
  INITIAL_WAIT_SECONDS: 5
};

export default config; 