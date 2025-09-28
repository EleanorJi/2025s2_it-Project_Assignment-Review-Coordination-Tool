const express = require('express');
const router = express.Router();
const path = require('path');

const dashboardRoutes = require('./dashboard');

router.use('/dashboard', dashboardRoutes);

router.get('/login', (req, res) => {
  // Return HTML page for browser rendering (keep route hidden)
  res.sendFile(path.join(__dirname, '../../frontend/login.html'));
});

module.exports = router;