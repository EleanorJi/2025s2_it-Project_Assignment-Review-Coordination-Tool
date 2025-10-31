const express = require('express');
const path = require('path');
const db = require('../config/database');
const EmailService = require('../services/emailService');

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

    // Derive effective creator id: body.created_by -> req.user.id -> cookie userId
    const cookieUserId = req.cookies && req.cookies.userId ? parseInt(req.cookies.userId) : null;
    const effectiveCreatedBy = created_by || (req.user && req.user.id) || cookieUserId || null;

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
            [assignment_id, marker_id, content, title || null, effectiveCreatedBy]
        );

        const newFeedback = feedbackResult.rows[0];

        console.log(`✅ Feedback created successfully: feedback_id=${newFeedback.feedback_id}`);

        // Send email notification to marker
        try {
            console.log(`🔍 Debug email sending - marker_id: ${marker_id}, created_by: ${effectiveCreatedBy}, assignment_id: ${assignment_id}`);
            
            // Get marker and coordinator information for email
            const markerInfo = await db.query(
                'SELECT name, email FROM app_user WHERE user_id = $1',
                [marker_id]
            );
            console.log(`🔍 Marker info query result:`, markerInfo.rows);
            
            const coordinatorInfo = await db.query(
                'SELECT name, email FROM app_user WHERE user_id = $1',
                [effectiveCreatedBy]
            );
            console.log(`🔍 Coordinator info query result:`, coordinatorInfo.rows);
            
            const assignmentInfo = await db.query(`
                SELECT a.assignment_id, a.name as assignment_name, a.project_id, p.name as project_name
                FROM assignment a
                JOIN project p ON a.project_id = p.project_id
                WHERE a.assignment_id = $1
            `, [assignment_id]);
            console.log(`🔍 Assignment info query result:`, assignmentInfo.rows);

            if (markerInfo.rows.length > 0 && coordinatorInfo.rows.length > 0 && assignmentInfo.rows.length > 0) {
                const marker = markerInfo.rows[0];
                const coordinator = coordinatorInfo.rows[0];
                const assignment = assignmentInfo.rows[0];

                await EmailService.sendFeedbackNotificationEmail(
                    marker.email,
                    marker.name,
                    coordinator.name,
                    assignment.assignment_name,
                    assignment.project_name,
                    assignment.project_id,
                    assignment.assignment_id,
                    coordinator.email // 传入协调员邮箱用于from/replyTo
                );
                
                console.log(`📧 Feedback notification email sent to: ${marker.email}`);
            } else {
                console.warn('⚠️ Could not send feedback notification email: missing user or assignment information');
            }
        } catch (emailError) {
            console.error('❌ Failed to send feedback notification email:', emailError);
            // Don't fail the feedback creation if email sending fails
        }

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
                    f.created_by, f.created_at, COALESCE(u.nickname, u.name) as marker_name, u2.name as created_by_name
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