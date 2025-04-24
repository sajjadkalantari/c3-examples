// Configuration settings
const config = {
  // Comput3 API configuration
  C3_API_KEY: process.env.REACT_APP_C3_API_KEY || '',
  C3_API_URL: '/api/v0/workloads',

  // Default paths
  DEFAULT_OUTPUT_DIR: 'output',
  WORKFLOW_TEMPLATE_PATH: '/workflows/avatar_generator.json',

  // ComfyUI configuration
  DEFAULT_TIMEOUT_MINUTES: 30,
  CHECK_INTERVAL_SECONDS: 30,
  INITIAL_WAIT_SECONDS: 5
};

export default config; 