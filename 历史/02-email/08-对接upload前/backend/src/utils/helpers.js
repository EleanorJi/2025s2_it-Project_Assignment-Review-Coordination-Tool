function extractUsernameFromEmail(email) {
  return email.split('@')[0];
}

module.exports = {
  extractUsernameFromEmail
};