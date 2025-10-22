const auth = require('./auth');
const db = require('../config/database');

jest.mock('../config/database');

describe('Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let nextFunction;

  beforeEach(() => {
    mockReq = {
      cookies: {},
      originalUrl: '/dashboard/marker',
      path: '/marker'
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      redirect: jest.fn()
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  test('should redirect to login if userId cookie is missing', async () => {
    mockReq.cookies = {};
    
    await auth(mockReq, mockRes, nextFunction);
    
    expect(mockRes.redirect).toHaveBeenCalledWith(expect.stringContaining('/login?redirect='));
    expect(nextFunction).not.toHaveBeenCalled();
  });

  test('should return 401 if user not found in database', async () => {
    mockReq.cookies.userId = '999';
    
    db.query.mockResolvedValue({ rows: [] });
    
    await auth(mockReq, mockRes, nextFunction);
    
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid user or account not active.'
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  test('should call next() with valid userId', async () => {
    mockReq.cookies.userId = '1';
    
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      name: 'Test User',
      password_hash: 'hash',
      role: 'MARKER',
      status: true,
      last_login: new Date()
    };
    
    db.query.mockResolvedValue({ rows: [mockUser] });
    
    await auth(mockReq, mockRes, nextFunction);
    
    expect(mockReq.user).toEqual(mockUser);
    expect(nextFunction).toHaveBeenCalled();
  });

  test('should handle database errors', async () => {
    mockReq.cookies.userId = '1';
    
    db.query.mockRejectedValue(new Error('Database error'));
    
    await auth(mockReq, mockRes, nextFunction);
    
    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      message: 'Authentication error.'
    });
    expect(nextFunction).not.toHaveBeenCalled();
  });
});

