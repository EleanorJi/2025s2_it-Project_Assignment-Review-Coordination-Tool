const express = require('express');
const router = express.Router();
const invitationController = require('../controllers/invitationController');
const authenticate = require('../middleware/auth');
const { requireCoordinator } = require('../middleware/roleAuth');

router.post('/', authenticate, requireCoordinator, invitationController.inviteMarker);
router.get('/verify', invitationController.verifyInvite);
router.post('/complete-signup', invitationController.completeSignup);

module.exports = router;