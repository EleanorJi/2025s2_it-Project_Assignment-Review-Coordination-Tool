const { requireCoordinator } = require('./roleAuth');
const { ROLES } = require('../config/constants');

describe('Role Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let nextFunction;

  beforeEach(() => {
    mockReq = {
      user: null
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('requireCoordinator', () => {
    test('should return 401 if user is not authenticated', () => {
      mockReq.user = null;
      
      requireCoordinator(mockReq, mockRes, nextFunction);
      
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required.'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    test('should return 403 if user is not a coordinator', () => {
      mockReq.user = {
        id: 1,
        role: 'MARKER'
      };
      
      requireCoordinator(mockReq, mockRes, nextFunction);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. Coordinator role required.'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    test('should call next() if user is a coordinator', () => {
      mockReq.user = {
        id: 1,
        role: 'COORDINATOR'
      };
      
      requireCoordinator(mockReq, mockRes, nextFunction);
      
      expect(nextFunction).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});

