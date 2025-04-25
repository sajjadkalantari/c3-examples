// CORS Proxy Server
const corsAnywhere = require('cors-anywhere');

// Configure and start the proxy server
const host = 'localhost';
const port = 8080;

// Create the server with more robust timeout and error handling
corsAnywhere.createServer({
  originWhitelist: [], // Allow all origins
  requireHeader: ['origin', 'x-requested-with'],
  removeHeaders: [], // Don't remove cookies as they're needed for auth
  httpProxyOptions: {
    // Increase timeouts to handle slow connections
    timeout: 60000, // 60 seconds
    proxyTimeout: 60000,
    // Add error handling
    handleUpgrade: true
  }
}).listen(port, host, function() {
  console.log('CORS Anywhere proxy running on ' + host + ':' + port);
});

// Export the proxy URL to be used in the application
module.exports = {
  proxyUrl: `http://${host}:${port}/`
}; 