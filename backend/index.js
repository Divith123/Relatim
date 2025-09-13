const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Import routes
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const contactRoutes = require('./src/routes/contacts');
const messageRoutes = require('./src/routes/messages');
const aiRoutes = require('./src/routes/ai');
const callRoutes = require('./src/routes/calls');
const pushNotificationRoutes = require('./src/routes/pushNotifications');
const dashboardRoutes = require('./src/routes/dashboard');

// Import middleware
const { apiLimiter } = require('./src/middleware/rateLimiter');

// Import server setup for Vercel
const { initializeForVercel } = require('./src/server-setup');

const app = express();

// Initialize for Vercel serverless deployment
initializeForVercel(app);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving - removed for production (using S3 storage)
// app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Rate limiting for API routes
app.use('/api', apiLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/push-notifications', pushNotificationRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404 handler for API routes
app.use('/api*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server Error:', error);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    error: isDevelopment ? error.message : 'Internal server error',
    ...(isDevelopment && { stack: error.stack }),
    timestamp: new Date().toISOString()
  });
});

// Export for Vercel
module.exports = app;