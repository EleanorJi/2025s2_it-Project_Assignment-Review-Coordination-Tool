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

// 创建反馈 /api/feedback
router.post('/', async (req, res) => {
    const { assignment_id, marker_id, content, title, created_by } = req.body;

    // 验证必需字段
    if (!assignment_id || !marker_id || !content) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields: assignment_id, marker_id, content'
        });
    }

    try {
        // 验证assignment是否存在
        const assignmentCheck = await db.query(
            'SELECT assignment_id FROM assignment WHERE assignment_id = $1',
            [assignment_id]
        );

        if (assignmentCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Assignment not found'
            });
        }

        // 验证marker是否存在
        const markerCheck = await db.query(
            'SELECT user_id FROM app_user WHERE user_id = $1',
            [marker_id]
        );

        if (markerCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Marker not found'
            });
        }

        // 创建反馈
        const feedbackResult = await db.query(
            `INSERT INTO feedback (assignment_id, marker_id, content, title, created_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING feedback_id, assignment_id, marker_id, content, title, created_by, created_at`,
            [assignment_id, marker_id, content, title || null, created_by || null]
        );

        const newFeedback = feedbackResult.rows[0];

        console.log(`✅ Feedback created successfully: feedback_id=${newFeedback.feedback_id}`);

        res.status(201).json({
            success: true,
            message: 'Feedback created successfully',
            data: {
                id: newFeedback.feedback_id,
                assignment_id: newFeedback.assignment_id,
                marker_id: newFeedback.marker_id,
                content: newFeedback.content,
                title: newFeedback.title,
                created_by: newFeedback.created_by,
                created_at: newFeedback.created_at
            }
        });

    } catch (error) {
        console.error('Error creating feedback:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while creating feedback.'
        });
    }
});

// 获取所有反馈（按assignment分组） /api/feedback/assignment/:assignmentId
router.get('/assignment/:assignmentId', async (req, res) => {
    const { assignmentId } = req.params;

    try {
        const feedbackResult = await db.query(
            `SELECT f.feedback_id AS id, f.assignment_id, f.marker_id, f.content, f.title, 
                    f.created_by, f.created_at, u.name as marker_name, u2.name as created_by_name
             FROM feedback f
             LEFT JOIN app_user u ON f.marker_id = u.user_id
             LEFT JOIN app_user u2 ON f.created_by = u2.user_id
             WHERE f.assignment_id = $1
             ORDER BY f.created_at DESC`,
            [assignmentId]
        );

        res.json({
            success: true,
            data: feedbackResult.rows
        });
    } catch (error) {
        console.error('Error fetching feedback by assignment:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while fetching feedback.'
        });
    }
});


module.exports = router;