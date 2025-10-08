require('dotenv').config({ path: 'backend/.env' });

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const apiRoutes = require('./routes/index');
const pageRoutes = require('./routes/page');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const port = process.env.PORT || 3000;
//新增
const coordinatorPath = path.join(process.cwd(), 'frontend/Coordinator');
console.log("📂 Serving /Coordinator from:", coordinatorPath);

app.use('/Coordinator', express.static(coordinatorPath));

app.get('/test-static', (req, res) => {
  const filePath = path.join(process.cwd(), 'frontend/Coordinator/feedback.html');
  console.log("📂 Sending file:", filePath);
  res.sendFile(filePath);
});



app.get('/dashboard/coordinator/feedback', (req, res) => {
  const filePath = path.join(process.cwd(), 'frontend/Coordinator/feedback.html');
  console.log("📂 Sending file (dashboard route):", filePath);
  res.sendFile(filePath);
});

//

app.use(express.json());
app.use(cookieParser());

// Static file service
//app.use(express.static(path.join(__dirname, '../../frontend'))); // Frontend static files
// Serve frontend static files新增

app.use('/static', express.static(path.join(__dirname, '../../uploads')));

// Routes
app.use('/api', apiRoutes);
app.use('/', pageRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use(errorHandler);


// Add test route in app.js
app.get('/test-cookie', (req, res) => {
  console.log('Received Cookies:', req.cookies);
  res.json({ cookies: req.cookies });
});

app.listen(port, () => {
  console.log(`✅ Server is running on http://localhost:${port}`);
  console.log('📋 Available endpoints:');
  console.log('   POST /api/auth/login          - User login');
  console.log('   GET  /api/auth/me             - Get current user info');
  console.log('   POST /api/invitations         - Invite new marker');
  console.log('   GET  /api/invitations/verify  - Verify invitation token');
  console.log('   POST /api/invitations/complete-signup - Complete registration');
  console.log('   GET  /api/health              - Health check');
  console.log('\n🔒 Authentication: Using cookies for user authentication');});

module.exports = app;