const authController = require('./authController');
const db = require('../config/database');
const EmailService = require('../services/emailService');

// Mock dependencies
jest.mock('../config/database');
jest.mock('../services/emailService');

describe('Auth Controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockReq = {
      body: {},
      user: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('login', () => {
    test('should return 400 if email/name and password are missing', async () => {
      mockReq.body = {};
      
      await authController.login(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please provide either email or name, and password.'
      });
    });

    test('should return 400 if both email and name are provided', async () => {
      mockReq.body = {
        email: 'test@example.com',
        name: 'testuser',
        password: 'password123'
      };
      
      await authController.login(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please provide either email or name, not both.'
      });
    });

    test('should return 401 if user not found by email', async () => {
      mockReq.body = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      db.query.mockResolvedValue({ rows: [] });
      
      await authController.login(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('Authentication failed')
      });
    });

    test('should return 401 if account is not active', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      db.query.mockResolvedValue({
        rows: [{
          id: 1,
          email: 'test@example.com',
          name: 'Test User',
          password_hash: 'password123',
          role: 'MARKER',
          status: false
        }]
      });
      
      await authController.login(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Account is not active. Please complete your registration.'
      });
    });

    test('should return 401 if password is incorrect', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      db.query.mockResolvedValue({
        rows: [{
          id: 1,
          email: 'test@example.com',
          name: 'Test User',
          password_hash: 'password123',
          role: 'MARKER',
          status: true
        }]
      });
      
      await authController.login(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication failed. Invalid password.'
      });
    });

    test('should successfully login with email', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            email: 'test@example.com',
            name: 'Test User',
            password_hash: 'password123',
            role: 'MARKER',
            status: true,
            last_login: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: [] });
      
      await authController.login(mockReq, mockRes);
      
      expect(mockRes.cookie).toHaveBeenCalledWith('userId', 1, expect.any(Object));
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful!',
        user: expect.objectContaining({
          id: 1,
          email: 'test@example.com',
          name: 'Test User',
          role: 'MARKER'
        })
      });
    });

    test('should successfully login with name', async () => {
      mockReq.body = {
        name: 'testuser',
        password: 'password123'
      };

      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 2,
            email: 'test@example.com',
            name: 'testuser',
            password_hash: 'password123',
            role: 'COORDINATOR',
            status: true,
            last_login: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: [] });
      
      await authController.login(mockReq, mockRes);
      
      expect(mockRes.cookie).toHaveBeenCalledWith('userId', 2, expect.any(Object));
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Login successful!',
        user: expect.objectContaining({
          id: 2,
          name: 'testuser',
          role: 'COORDINATOR'
        })
      });
    });

    test('should handle database errors', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      db.query.mockRejectedValue(new Error('Database connection failed'));
      
      await authController.login(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Internal server error.'
      });
    });
  });

  describe('logout', () => {
    test('should clear cookie and return success', () => {
      authController.logout(mockReq, mockRes);
      
      expect(mockRes.clearCookie).toHaveBeenCalledWith('userId');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logged out successfully'
      });
    });
  });

  describe('getCurrentUser', () => {
    test('should return current user information', async () => {
      mockReq.user = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: 'MARKER',
        last_login: new Date()
      };
      
      await authController.getCurrentUser(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        user: {
          id: 1,
          email: 'test@example.com',
          name: 'Test User',
          role: 'MARKER',
          last_login: mockReq.user.last_login
        }
      });
    });
  });

  describe('forgotPassword', () => {
    test('should return 400 if email is not provided', async () => {
      mockReq.body = {};
      
      await authController.forgotPassword(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please provide an email address.'
      });
    });

    test('should return 404 if user not found', async () => {
      mockReq.body = { email: 'nonexistent@example.com' };
      
      db.query.mockResolvedValue({ rows: [] });
      
      await authController.forgotPassword(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'User with this email address not found.'
      });
    });

    test('should return 401 if account is not active', async () => {
      mockReq.body = { email: 'test@example.com' };
      
      db.query.mockResolvedValue({
        rows: [{
          id: 1,
          email: 'test@example.com',
          name: 'Test User',
          status: false
        }]
      });
      
      await authController.forgotPassword(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Account is not active. Please complete your registration.'
      });
    });

    test('should successfully send password reset email', async () => {
      mockReq.body = { email: 'test@example.com' };
      
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            email: 'test@example.com',
            name: 'Test User',
            status: true
          }]
        })
        .mockResolvedValueOnce({ rows: [] });
      
      EmailService.sendPasswordResetEmail.mockResolvedValue(true);
      
      await authController.forgotPassword(mockReq, mockRes);
      
      expect(EmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String),
        'Test User'
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password reset email sent successfully. Please check your email.'
      });
    });
  });

  describe('resetPassword', () => {
    test('should return 400 if token or newPassword is missing', async () => {
      mockReq.body = { token: 'sometoken' };
      
      await authController.resetPassword(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Reset token and new password are required.'
      });
    });

    test('should return 400 if password is too short', async () => {
      mockReq.body = {
        token: 'sometoken',
        newPassword: '12345'
      };
      
      await authController.resetPassword(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    });

    test('should return 400 if token is invalid or expired', async () => {
      mockReq.body = {
        token: 'invalidtoken',
        newPassword: 'newpassword123'
      };
      
      db.query.mockResolvedValue({ rows: [] });
      
      await authController.resetPassword(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid or expired reset token.'
      });
    });

    test('should successfully reset password', async () => {
      mockReq.body = {
        token: 'validtoken',
        newPassword: 'newpassword123'
      };
      
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            reset_token_expiry: new Date(Date.now() + 3600000),
            status: true
          }]
        })
        .mockResolvedValueOnce({ rows: [] });
      
      await authController.resetPassword(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password reset successfully. You can now login with your new password.'
      });
    });
  });
});

