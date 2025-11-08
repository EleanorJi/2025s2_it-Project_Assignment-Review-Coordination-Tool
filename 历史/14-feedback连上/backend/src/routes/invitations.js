const express = require('express');
const router = express.Router();
const invitationController = require('../controllers/invitationController');
const authenticate = require('../middleware/auth');
const { requireCoordinator } = require('../middleware/roleAuth');

router.post('/', authenticate, requireCoordinator, invitationController.inviteMarker);
router.get('/verify', invitationController.verifyInvite);
router.post('/complete-signup', invitationController.completeSignup);
router.post('/batch', authenticate, requireCoordinator, invitationController.inviteMarkersBatch);
router.get('/', authenticate, requireCoordinator, invitationController.listInvitations);
router.post('/resend', authenticate, requireCoordinator, invitationController.resendInvite);
router.post('/revoke', authenticate, requireCoordinator, invitationController.revokeInvite);
router.post('/close', authenticate, requireCoordinator, invitationController.closeUser);
router.post('/reopen', authenticate, requireCoordinator, invitationController.reopenUser);
router.get('/suggest', authenticate, requireCoordinator, invitationController.getMarkerSuggestions);

module.exports = router;