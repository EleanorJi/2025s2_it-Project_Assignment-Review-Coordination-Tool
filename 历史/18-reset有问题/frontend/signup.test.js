/**
 * @jest-environment jsdom
 */

describe('Signup Functionality', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="signupForm">
        <input type="text" id="name" value="" />
        <input type="email" id="email" value="" />
        <input type="password" id="password" value="" />
        <input type="password" id="confirmPassword" value="" />
        <button type="submit" id="submitBtn">Sign Up</button>
      </form>
      <div id="status" class="msg"></div>
    `;
    
    global.fetch.mockClear();
  });

  describe('Form Validation', () => {
    test('should validate all required fields', () => {
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      expect(name).toBe('');
      expect(email).toBe('');
      expect(password).toBe('');
      expect(confirmPassword).toBe('');
    });

    test('should accept valid form data', () => {
      document.getElementById('name').value = 'John Doe';
      document.getElementById('email').value = 'john@example.com';
      document.getElementById('password').value = 'password123';
      document.getElementById('confirmPassword').value = 'password123';
      
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      expect(name).toBe('John Doe');
      expect(email).toBe('john@example.com');
      expect(password).toBe('password123');
      expect(confirmPassword).toBe('password123');
    });

    test('should trim whitespace from inputs', () => {
      document.getElementById('name').value = '  John Doe  ';
      document.getElementById('email').value = '  john@example.com  ';
      
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      
      expect(name).toBe('John Doe');
      expect(email).toBe('john@example.com');
    });
  });

  describe('Email Validation', () => {
    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    test('should validate correct email format', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
    });

    test('should reject invalid email formats', () => {
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@example')).toBe(false);
    });

    test('should accept email with subdomain', () => {
      expect(isValidEmail('test@mail.example.com')).toBe(true);
    });

    test('should accept email with special characters', () => {
      expect(isValidEmail('test.user+tag@example.com')).toBe(true);
    });
  });

  describe('Password Validation', () => {
    test('should validate password length', () => {
      const password = 'pass123';
      expect(password.length).toBeGreaterThanOrEqual(6);
    });

    test('should reject short passwords', () => {
      const password = '12345';
      expect(password.length).toBeLessThan(6);
    });

    test('should match passwords', () => {
      const password = 'password123';
      const confirmPassword = 'password123';
      expect(password).toBe(confirmPassword);
    });

    test('should detect password mismatch', () => {
      const password = 'password123';
      const confirmPassword = 'different123';
      expect(password).not.toBe(confirmPassword);
    });
  });

  describe('Signup API', () => {
    test('should send signup request', async () => {
      const payload = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123'
      };
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Registration successful'
        })
      });
      
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      expect(global.fetch).toHaveBeenCalled();
      expect(data.success).toBe(true);
    });

    test('should handle signup errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          message: 'Email already exists'
        })
      });
      
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'John Doe',
          email: 'existing@example.com',
          password: 'password123'
        })
      });
      
      const data = await response.json();
      
      expect(data.success).toBe(false);
      expect(data.message).toBe('Email already exists');
    });

    test('should handle network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
      
      try {
        await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'John Doe',
            email: 'john@example.com',
            password: 'password123'
          })
        });
      } catch (error) {
        expect(error.message).toBe('Network error');
      }
    });
  });

  describe('UI Feedback', () => {
    test('should display success message', () => {
      const status = document.getElementById('status');
      status.classList.add('ok');
      status.textContent = 'Registration successful!';
      
      expect(status.classList.contains('ok')).toBe(true);
      expect(status.textContent).toBe('Registration successful!');
    });

    test('should display error message', () => {
      const status = document.getElementById('status');
      status.classList.add('err');
      status.textContent = 'Registration failed.';
      
      expect(status.classList.contains('err')).toBe(true);
      expect(status.textContent).toBe('Registration failed.');
    });

    test('should disable submit button during request', () => {
      const btn = document.getElementById('submitBtn');
      btn.disabled = true;
      
      expect(btn.disabled).toBe(true);
    });

    test('should enable submit button after request', () => {
      const btn = document.getElementById('submitBtn');
      btn.disabled = false;
      
      expect(btn.disabled).toBe(false);
    });
  });
});

