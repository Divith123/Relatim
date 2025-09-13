const http = require('http');
const { setSocketService } = require('./controllers/messageController');
const SocketService = require('./services/socketService');

let socketService = null;

// Initialize Socket.IO server (for development/local use)
function initializeSocketIO(app) {
  try {
    const server = http.createServer(app);
    
    // Create Socket.IO service with Vercel-compatible settings
    socketService = SocketService.initializeServer(server);
    
    // Set the socket service in the message controller
    setSocketService(socketService);
    
    console.log('✅ Socket.IO initialized with polling transport for Vercel compatibility');
    
    return { server, socketService };
  } catch (error) {
    console.warn('⚠️ Socket.IO initialization failed, using polling fallback only:', error.message);
    return { server: http.createServer(app), socketService: null };
  }
}

// For Vercel serverless deployment, Socket.IO is limited
function initializeForVercel(app) {
  console.log('🚀 Initializing for Vercel serverless deployment');
  console.log('📡 Real-time messaging will use polling fallback');
  
  // Don't initialize Socket.IO for serverless
  setSocketService(null);
  
  return app;
}

module.exports = {
  initializeSocketIO,
  initializeForVercel,
  getSocketService: () => socketService
};