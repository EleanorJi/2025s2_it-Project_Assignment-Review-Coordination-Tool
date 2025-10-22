const { extractUsernameFromEmail } = require('./helpers');

describe('Helper Functions', () => {
  describe('extractUsernameFromEmail', () => {
    test('should extract username from valid email', () => {
      expect(extractUsernameFromEmail('john.doe@example.com')).toBe('john.doe');
    });

    test('should extract username from email with numbers', () => {
      expect(extractUsernameFromEmail('user123@test.com')).toBe('user123');
    });

    test('should extract username from email with special characters', () => {
      expect(extractUsernameFromEmail('user.name+tag@example.com')).toBe('user.name+tag');
    });

    test('should handle simple email', () => {
      expect(extractUsernameFromEmail('admin@domain.org')).toBe('admin');
    });

    test('should extract from email with multiple dots in domain', () => {
      expect(extractUsernameFromEmail('test@mail.example.co.uk')).toBe('test');
    });
  });
});

