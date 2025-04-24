// CORS Proxy Server
const corsAnywhere = require('cors-anywhere');

// Configure and start the proxy server
const host = 'localhost';
const port = 8080;

// Create the server
corsAnywhere.createServer({
  originWhitelist: [], // Allow all origins
  requireHeader: ['origin', 'x-requested-with'],
  removeHeaders: ['cookie', 'cookie2']
}).listen(port, host, function() {
  console.log('CORS Anywhere proxy running on ' + host + ':' + port);
});

// Export the proxy URL to be used in the application
module.exports = {
  proxyUrl: `http://${host}:${port}/`
}; 