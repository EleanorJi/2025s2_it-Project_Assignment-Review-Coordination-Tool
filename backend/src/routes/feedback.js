const express = require('express');
const path = require('path');
const db = require('../config/database');

const router = express.Router();

// 获取对应反馈列表 /api/feedback/:assignmentId/:markerId
router.get('/:assignmentId/:markerId', async (req, res) => {

    const { assignmentId, markerId } = req.params;

    try {
        const feedbackResult = await db.query(
        `SELECT feedback_id AS id, assignment_id, marker_id, created_by, content, created_at, title
         FROM feedback
         WHERE assignment_id = $1 AND marker_id = $2
         ORDER BY created_at DESC`,
        [assignmentId, markerId]
        );

        if (feedbackResult.rows.length === 0) {
        return res.status(404).json({
            success: false,
            message: 'No feedback found for the specified assignment and marker.'
        });
        }

        res.json({
        success: true,
        data: feedbackResult.rows
        });
    } catch (error) {
        console.error('Error fetching feedback:', error);
        res.status(500).json({
        success: false,
        message: 'An error occurred while fetching feedback.'
        });
    }
});


module.exports = router;