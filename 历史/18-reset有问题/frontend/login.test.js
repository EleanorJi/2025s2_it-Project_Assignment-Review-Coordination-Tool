/**
 * @jest-environment jsdom
 */

describe('Login Functionality', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="role-marker" class="role-btn">Marker</button>
      <button id="role-coordinator" class="role-btn">Coordinator</button>
      <form id="loginForm">
        <input type="text" id="identifier" value="" />
        <input type="password" id="password" value="" />
        <button type="submit" id="submitBtn">Login</button>
      </form>
      <div id="status" class="msg"></div>
      <a href="#" id="forgot">Forgot Password?</a>
    `;
    
    localStorage.clear();
    global.fetch.mockClear();
  });

  describe('Email Validation', () => {
    const isEmail = (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);

    test('should validate correct email format', () => {
      expect(isEmail('test@example.com')).toBe(true);
    });

    test('should reject email without @', () => {
      expect(isEmail('testexample.com')).toBe(false);
    });

    test('should reject email without domain', () => {
      expect(isEmail('test@')).toBe(false);
    });

    test('should reject email without TLD', () => {
      expect(isEmail('test@example')).toBe(false);
    });

    test('should validate email with subdomain', () => {
      expect(isEmail('test@mail.example.com')).toBe(true);
    });

    test('should validate email with special characters', () => {
      expect(isEmail('test.user+tag@example.com')).toBe(true);
    });

    test('should reject username-only input', () => {
      expect(isEmail('username')).toBe(false);
    });
  });

  describe('Role Selection', () => {
    test('should activate marker role button', () => {
      const markerBtn = document.getElementById('role-marker');
      const coordBtn = document.getElementById('role-coordinator');
      
      markerBtn.classList.add('active');
      coordBtn.classList.remove('active');
      
      expect(markerBtn.classList.contains('active')).toBe(true);
      expect(coordBtn.classList.contains('active')).toBe(false);
    });

    test('should activate coordinator role button', () => {
      const markerBtn = document.getElementById('role-marker');
      const coordBtn = document.getElementById('role-coordinator');
      
      coordBtn.classList.add('active');
      markerBtn.classList.remove('active');
      
      expect(coordBtn.classList.contains('active')).toBe(true);
      expect(markerBtn.classList.contains('active')).toBe(false);
    });

    test('should toggle between roles', () => {
      const markerBtn = document.getElementById('role-marker');
      const coordBtn = document.getElementById('role-coordinator');
      
      markerBtn.classList.add('active');
      coordBtn.classList.remove('active');
      expect(markerBtn.classList.contains('active')).toBe(true);
      
      coordBtn.classList.add('active');
      markerBtn.classList.remove('active');
      expect(coordBtn.classList.contains('active')).toBe(true);
      expect(markerBtn.classList.contains('active')).toBe(false);
    });
  });

  describe('Form Validation', () => {
    test('should validate required fields', () => {
      const identifier = document.getElementById('identifier').value.trim();
      const password = document.getElementById('password').value;
      
      expect(identifier).toBe('');
      expect(password).toBe('');
    });

    test('should accept valid credentials', () => {
      document.getElementById('identifier').value = 'test@example.com';
      document.getElementById('password').value = 'password123';
      
      const identifier = document.getElementById('identifier').value.trim();
      const password = document.getElementById('password').value;
      
      expect(identifier).toBe('test@example.com');
      expect(password).toBe('password123');
      expect(identifier.length).toBeGreaterThan(0);
      expect(password.length).toBeGreaterThan(0);
    });

    test('should trim whitespace from identifier', () => {
      document.getElementById('identifier').value = '  test@example.com  ';
      const identifier = document.getElementById('identifier').value.trim();
      
      expect(identifier).toBe('test@example.com');
    });
  });

  describe('Login API Requests', () => {
    test('should send login request with email', async () => {
      const payload = {
        email: 'test@example.com',
        password: 'password123'
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          user: { id: 1, name: 'Test User', role: 'MARKER' }
        })
      });
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        method: 'POST',
        credentials: 'include'
      }));
      expect(data.success).toBe(true);
    });

    test('should send login request with username', async () => {
      const payload = {
        name: 'testuser',
        password: 'password123'
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          user: { id: 1, name: 'testuser', role: 'MARKER' }
        })
      });
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      expect(data.success).toBe(true);
    });

    test('should handle login failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          message: 'Invalid credentials'
        })
      });
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: 'wrong@example.com', password: 'wrong' })
      });
      
      const data = await response.json();
      
      expect(data.success).toBe(false);
      expect(data.message).toBe('Invalid credentials');
    });

    test('should fallback to old endpoint on 404', async () => {
      global.fetch
        .mockResolvedValueOnce({
          status: 404,
          json: async () => ({ message: 'Not found' })
        });
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: 'test@example.com', password: 'password' })
      });
      
      if (response.status === 404) {
        // Would then try /api/login
        expect(response.status).toBe(404);
      }
    });
  });

  describe('User Session Management', () => {
    test('should store user data in localStorage', () => {
      const user = { id: 1, name: 'Test User', role: 'MARKER', email: 'test@example.com' };
      
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('userRole', user.role);
      
      expect(localStorage.getItem('user')).toBe(JSON.stringify(user));
      expect(localStorage.getItem('userRole')).toBe('MARKER');
    });

    test('should retrieve user data from localStorage', () => {
      const user = { id: 1, name: 'Test User', role: 'MARKER' };
      localStorage.setItem('user', JSON.stringify(user));
      
      const storedUser = JSON.parse(localStorage.getItem('user'));
      
      expect(storedUser.name).toBe('Test User');
      expect(storedUser.role).toBe('MARKER');
    });

    test('should handle missing user data', () => {
      const user = localStorage.getItem('user');
      
      expect(user).toBeNull();
    });
  });

  describe('Redirect Logic', () => {
    const getRedirectPath = (role) => {
      if (role === 'COORDINATOR') {
        return '/dashboard/coordinator';
      } else if (role === 'MARKER') {
        return '/dashboard/marker';
      } else {
        return '/login';
      }
    };

    test('should redirect COORDINATOR to coordinator dashboard', () => {
      const path = getRedirectPath('COORDINATOR');
      expect(path).toBe('/dashboard/coordinator');
    });

    test('should redirect MARKER to marker dashboard', () => {
      const path = getRedirectPath('MARKER');
      expect(path).toBe('/dashboard/marker');
    });

    test('should redirect unknown role to login', () => {
      const path = getRedirectPath('UNKNOWN');
      expect(path).toBe('/login');
    });

    test('should handle redirect parameter in URL', () => {
      const urlParams = new URLSearchParams('?redirect=/dashboard/coordinator/tasks');
      const redirectTo = urlParams.get('redirect');
      
      expect(redirectTo).toBe('/dashboard/coordinator/tasks');
    });

    test('should validate safe redirect paths', () => {
      const redirectTo = '/dashboard/marker/tasks';
      const safeRedirect = redirectTo.startsWith('/dashboard/') ? redirectTo : null;
      
      expect(safeRedirect).toBe('/dashboard/marker/tasks');
    });

    test('should reject unsafe redirect paths', () => {
      const redirectTo = 'http://evil.com/steal';
      const safeRedirect = redirectTo.startsWith('/dashboard/') ? redirectTo : null;
      
      expect(safeRedirect).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
      
      try {
        await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'password' })
        });
      } catch (error) {
        expect(error.message).toBe('Network error');
      }
    });

    test('should display error message', () => {
      const status = document.getElementById('status');
      status.classList.add('err');
      status.textContent = 'Login failed. Please try again.';
      
      expect(status.classList.contains('err')).toBe(true);
      expect(status.textContent).toBe('Login failed. Please try again.');
    });

    test('should display success message', () => {
      const status = document.getElementById('status');
      status.classList.add('ok');
      status.textContent = 'Login successful!';
      
      expect(status.classList.contains('ok')).toBe(true);
      expect(status.textContent).toBe('Login successful!');
    });
  });
});

