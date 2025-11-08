const { ROLES } = require('./constants');

module.exports = {
  [ROLES.COORDINATOR]: '/coordinator-dashboard',
  [ROLES.MARKER]: '/marker-dashboard',
  default: '/'
};