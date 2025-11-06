const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const db = require('../config/database');
const { parseRubricFile } = require('../utils/fileParser');

const router = express.Router();

// Directory setup
const TEMP_DIR = path.join(__dirname, '../../temp_uploads');
const PERM_ROOT = path.join(__dirname, '../../uploads');
fs.mkdirSync(TEMP_DIR, { recursive: true });
fs.mkdirSync(PERM_ROOT, { recursive: true });


// ---------- Draft Upload ----------
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEMP_DIR),
  filename: (req, file, cb) => {
    const ext = mime.extension(file.mimetype) || 'bin';
    cb(null, `${uuidv4()}.${ext}`);
  }
});
const draftUpload = multer({
  storage: tempStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

// 1) Draft upload: /api/uploads/drafts  (form-data: file, slot)
router.post('/drafts', draftUpload.single('file'), async (req, res) => {
  try {
    // slot: 'assignment1' | 'assignment2' | 'rubric' (sent by frontend to know which window's file)
    const slot = req.body.slot;
    if (!['assignment1','assignment2','rubric'].includes(slot)) {
      await fsp.unlink(req.file.path).catch(()=>{});
      return res.status(400).json({ error: 'invalid slot' });
    }
    
    // Validate file type
    const fileType = req.file.mimetype;
    
    // Debug: output detected MIME type
    console.log(`📋 File debug info:`, {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      slot: slot
    });
    
    // Assignment can only upload PDF
    if (slot === 'assignment1' || slot === 'assignment2') {
      if (fileType !== 'application/pdf') {
        await fsp.unlink(req.file.path).catch(()=>{});
        return res.status(400).json({ 
          error: 'Assignments only accept PDF files',
          detected_type: fileType 
        });
      }
    }
    
    // Rubric can upload multiple formats, but not PDF
    if (slot === 'rubric') {
      const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // DOCX
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        // XLSX
        'text/csv',                                                                  // CSV
        'application/vnd.ms-excel',                                                  // XLS (legacy format)
        'application/msword',                                                        // DOC (legacy format)
        'application/octet-stream'                                                   // Generic binary format (temporarily allowed)
      ];
      
      if (!allowedMimeTypes.includes(fileType)) {
        await fsp.unlink(req.file.path).catch(()=>{});
        return res.status(400).json({ 
          error: 'Rubric files must be DOCX, XLSX, or CSV format (PDF not allowed)',
          detected_type: fileType,
          allowed_types: allowedMimeTypes
        });
      }
    }
    const draft = {
      draft_id: uuidv4(),
      slot,
      original_name: req.file.originalname,
      mime_type: req.file.mimetype,
      size: req.file.size,
      temp_name: path.basename(req.file.path),
      // Set expiry time, backend periodically cleans up
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString()
    };
    // Store draft info in memory is not feasible; return simply here, frontend keeps draft_id+temp_name.
    // If backend memory is needed, can save draft to Redis/DB temp table, simplified here with frontend passing back temp_name.
    res.json(draft);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'draft upload failed' });
  }
});

// 2) Delete Draft: /api/uploads/drafts/:tempName
router.delete('/drafts/:tempName', async (req, res) => {
  try {
    const abs = path.join(TEMP_DIR, path.basename(req.params.tempName));
    await fsp.unlink(abs);
    res.json({ ok: true });
  } catch (e) {
    return res.status(404).json({ error: 'draft not found' });
  }
});

// ---------- Commit (Save to DB) ----------
function ensurePermDir() {
  const now = new Date();
  const dir = path.join(PERM_ROOT, `${now.getFullYear()}`, `${String(now.getMonth()+1).padStart(2,'0')}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Note: Single commit feature has been removed, only batch commit is supported
// Original commit route has been disabled, please use /api/uploads/batch-commit

// 4) Download: /api/uploads/:id/download  (only available after commit)
router.get('/:id/download', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT file_name, storage_path, mime_type FROM upload WHERE upload_id=$1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    const file = rows[0];
    const abs = path.join(PERM_ROOT, file.storage_path);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.download(abs, file.file_name);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'download failed' });
  }
});

// 4.5) Batch commit: /api/uploads/batch-commit (redesigned)
// Create a complete submission at once, including 1 rubric and 2 assignments
router.post('/batch-commit', async (req, res) => {
  const client = await db.connect();
  try {
    const { 
      rubric_temp_name, 
      assignment1_temp_name, 
      assignment1_due_date,
      assignment2_temp_name, 
      assignment2_due_date,
      course_offering_id,
      owner_id 
    } = req.body || {};

    // Validate all required parameters
    const requiredFields = [
      { name: 'rubric_temp_name', value: rubric_temp_name },
      { name: 'assignment1_temp_name', value: assignment1_temp_name },
      { name: 'assignment1_due_date', value: assignment1_due_date },
      { name: 'assignment2_temp_name', value: assignment2_temp_name },
      { name: 'assignment2_due_date', value: assignment2_due_date },
      { name: 'course_offering_id', value: course_offering_id }
    ];

    for (const field of requiredFields) {
      if (!field.value) {
        return res.status(400).json({ 
          error: `Missing required field: ${field.name}` 
        });
      }
    }

    // Validate all temporary files exist
    const tempFiles = [
      { name: 'rubric', temp_name: rubric_temp_name },
      { name: 'assignment1', temp_name: assignment1_temp_name },
      { name: 'assignment2', temp_name: assignment2_temp_name }
    ];

    console.log('🔍 Validating temporary files...');
    for (const file of tempFiles) {
      const tempAbs = path.join(TEMP_DIR, file.temp_name); // Use complete temp_name directly
      console.log(`Checking file: ${file.name} -> ${tempAbs}`);
      
      const stat = await fsp.stat(tempAbs).catch((error) => {
        console.log(`File check failed: ${error.message}`);
        return null;
      });
      
      if (!stat) {
        return res.status(404).json({ 
          error: `Draft file not found: ${file.name} (${file.temp_name})`,
          checked_path: tempAbs
        });
      }
      console.log(`✅ File exists: ${file.name}, size: ${stat.size} bytes`);
    }

    // Validate due date format and order
    const assignment1DueDate = new Date(assignment1_due_date);
    const assignment2DueDate = new Date(assignment2_due_date);

    if (isNaN(assignment1DueDate.getTime())) {
      return res.status(400).json({ error: 'Invalid assignment1_due_date format' });
    }
    if (isNaN(assignment2DueDate.getTime())) {
      return res.status(400).json({ error: 'Invalid assignment2_due_date format' });
    }
    if (assignment2DueDate < assignment1DueDate) {
      return res.status(400).json({ 
        error: 'Assignment 2 due date must be after or equal to Assignment 1 due date' 
      });
    }

    await client.query('BEGIN');

    // Validate if course_offering_id exists
    const offeringCheck = await client.query(
      'SELECT offering_id FROM course_offering WHERE offering_id = $1',
      [course_offering_id]
    );
    if (offeringCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid course_offering_id' });
    }

    // Step 1: Set existing submissions to inactive, then create new active submission
    console.log('📄 Setting existing submissions to inactive...');
    await client.query(
      `UPDATE submission SET active = false WHERE course_offering_id = $1 AND active = true`,
      [course_offering_id]
    );
    
    console.log('📄 Creating new submission record...');
    const submissionResult = await client.query(
      `INSERT INTO submission (course_offering_id, active) 
       VALUES ($1, true) 
       RETURNING submission_id`,
      [course_offering_id]
    );
    const submissionId = submissionResult.rows[0].submission_id;
    console.log(`✅ Submission created successfully: submission_id=${submissionId}`);

    // Step 2: Create rubric record
    console.log('📋 Creating rubric record...');
    const rubricResult = await client.query(
      `INSERT INTO rubric (uploaded_by, submission_id) 
       VALUES ($1, $2) 
       RETURNING rubric_id`,
      [owner_id || 1, submissionId] // Use default owner_id=1 if not provided
    );
    const rubricId = rubricResult.rows[0].rubric_id;
    console.log(`✅ Rubric created successfully: rubric_id=${rubricId}`);

    // Step 3: Create two assignment records (round 1 and round 2)
    console.log('📅 Creating assignment records...');
    const assignment1Result = await client.query(
      `INSERT INTO assignment (offering_id, name, description, due_at, round, submission_id) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING assignment_id`,
      [
        course_offering_id,
        'Moderation 1',
        'First assignment for moderation',
        assignment1_due_date,
        1,
        submissionId
      ]
    );
    const assignment1Id = assignment1Result.rows[0].assignment_id;
    
    const assignment2Result = await client.query(
      `INSERT INTO assignment (offering_id, name, description, due_at, round, submission_id) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING assignment_id`,
      [
        course_offering_id,
        'Moderation 2', 
        'Second assignment for moderation',
        assignment2_due_date,
        2,
        submissionId
      ]
    );
    const assignment2Id = assignment2Result.rows[0].assignment_id;
    console.log(`✅ Assignments created successfully: assignment1_id=${assignment1Id}, assignment2_id=${assignment2Id}`);

    const uploadResults = [];

    // Process all files
    console.log('📁 Starting file processing...');
    for (const file of tempFiles) {
      try {
        console.log(`\nProcessing file: ${file.name}`);
        const tempAbs = path.join(TEMP_DIR, file.temp_name); // Use complete temp_name directly
        console.log(`Temporary file path: ${tempAbs}`);
        
        // Read file information
        const ext = path.extname(tempAbs).replace('.','') || 'pdf';
        const mimeType = mime.lookup(ext) || 'application/pdf';
        const originalName = `${file.name}.${ext}`;
        console.log(`File info: ext=${ext}, mimeType=${mimeType}, originalName=${originalName}`);

        // Move to permanent directory
        const permDir = ensurePermDir();
        const finalName = `${uuidv4()}.${ext}`;
        const permAbs = path.join(permDir, finalName);
        const storagePath = path.relative(PERM_ROOT, permAbs).replace(/\\/g,'/');
        console.log(`Target path: ${permAbs}`);
        console.log(`Storage path: ${storagePath}`);

        // Determine file type and association
        let fileType, targetAssignmentId, targetRubricId;
        if (file.name === 'rubric') {
          fileType = 'RUBRIC';
          targetAssignmentId = null;
          targetRubricId = rubricId;
        } else if (file.name === 'assignment1') {
          fileType = 'ASSIGNMENT';
          targetAssignmentId = assignment1Id;
          targetRubricId = null;
        } else if (file.name === 'assignment2') {
          fileType = 'ASSIGNMENT';
          targetAssignmentId = assignment2Id;
          targetRubricId = null;
        }
        console.log(`File type: ${fileType}, assignment_id=${targetAssignmentId}, rubric_id=${targetRubricId}`);

        // Insert database record
        console.log('💾 Inserting database record...');
        console.log(`Insert parameters: owner_id=${owner_id || null}, assignment_id=${targetAssignmentId}, rubric_id=${targetRubricId}`);
        
        const { rows } = await client.query(
          `INSERT INTO upload (owner_id, assignment_id, rubric_id,
                               file_name, mime_type, file_type, storage_path)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING *`,
          [
            owner_id || null,
            targetAssignmentId || null,
            targetRubricId || null,
            originalName,
            mimeType,
            fileType,
            storagePath
          ]
        );
        console.log(`✅ Database record inserted successfully: upload_id=${rows[0].upload_id}`);

        // Move file - use copyFile + unlink instead of rename to solve cross filesystem issues
        console.log('📂 Moving file...');
        await fsp.copyFile(tempAbs, permAbs);
        await fsp.unlink(tempAbs);
        console.log(`✅ File moved successfully: ${tempAbs} -> ${permAbs}`);

        uploadResults.push({
          file_type: file.name,
          upload_record: rows[0],
          preview_url: `/static/${rows[0].storage_path}`,
          download_url: `/api/uploads/${rows[0].upload_id}/download`
        });
      } catch (fileError) {
        console.error(`❌ Error processing file ${file.name}:`, fileError);
        throw fileError; // Re-throw error to trigger rollback
      }
    }

    await client.query('COMMIT');
    console.log('✅ All operations completed, transaction committed successfully!');

    // Parse rubric file and update row/column count
    try {
      console.log('📊 Starting rubric file parsing...');
      const rubricFile = uploadResults.find(file => file.file_type === 'rubric');
      if (rubricFile) {
        const rubricPath = path.join(PERM_ROOT, rubricFile.upload_record.storage_path);
        console.log(`📍 Rubric file path: ${rubricPath}`);
        console.log(`📄 Rubric file MIME type: ${rubricFile.upload_record.mime_type}`);

        // Check if file exists
        const fileExists = await fsp.stat(rubricPath).catch(() => null);
        if (!fileExists) {
          console.error('❌ Rubric file does not exist:', rubricPath);
          return;
        }
        console.log(`✅ Rubric file exists, size: ${fileExists.size} bytes`);

        const { rows, columns } = await parseRubricFile(rubricPath, rubricFile.upload_record.mime_type);
        console.log(`🎯 Parsing result: ${rows} rows x ${columns} columns`);

        // Update row and column fields in rubric table
        await db.query(
          'UPDATE rubric SET "row" = $1, "column" = $2 WHERE rubric_id = $3',
          [rows, columns, rubricId]
        );

        console.log(`✅ Rubric table info updated: ${rows} rows x ${columns} columns`);

        // Include table info in return result
        uploadResults.forEach(file => {
          if (file.file_type === 'rubric') {
            file.table_info = { rows, columns };
          }
        });
      } else {
        console.log('⚠️ No rubric file found');
      }
    } catch (parseError) {
      console.error('❌ Failed to parse rubric file, but does not affect main process:', parseError);
      console.error('❌ Error stack:', parseError.stack);
    }

    res.json({
      message: 'Batch commit successful - Complete submission created',
      submission_id: submissionId,
      rubric_id: rubricId,
      assignment1_id: assignment1Id,
      assignment2_id: assignment2Id,
      uploaded_files: uploadResults,
      assignment1_due_date: assignment1DueDate.toISOString(),
      assignment2_due_date: assignment2DueDate.toISOString(),
      course_offering_id: course_offering_id
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Batch commit error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    });
    res.status(500).json({
      error: 'Batch commit failed',
      details: error.message,
      code: error.code
    });
  } finally {
    client.release();
  }
});

// 4.9) Debug: Check temp files
router.get('/debug/temp-files', async (req, res) => {
  try {
    const files = await fsp.readdir(TEMP_DIR);
    const fileDetails = [];

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stat = await fsp.stat(filePath);
      fileDetails.push({
        name: file,
        size: stat.size,
        created: stat.birthtime,
        modified: stat.mtime
      });
    }

    res.json({
      temp_directory: TEMP_DIR,
      files: fileDetails
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5) Get active submission: /api/uploads/active-submission
router.get('/active-submission/:offering_id', async (req, res) => {
  try {
    const { offering_id } = req.params;
    if (!offering_id) {
      return res.status(400).json({ error: 'offering_id is required' });
    }

    // Get active submission and its related information
    const { rows } = await db.query(`
      SELECT
        s.submission_id,
        s.course_offering_id,
        s.active,
        r.rubric_id,
        a1.assignment_id as assignment1_id,
        a1.name as assignment1_name,
        a1.due_at as assignment1_due_date,
        a2.assignment_id as assignment2_id,
        a2.name as assignment2_name,
        a2.due_at as assignment2_due_date
      FROM submission s
      LEFT JOIN rubric r ON r.submission_id = s.submission_id
      LEFT JOIN assignment a1 ON a1.submission_id = s.submission_id AND a1.round = 1
      LEFT JOIN assignment a2 ON a2.submission_id = s.submission_id AND a2.round = 2
      WHERE s.course_offering_id = $1 AND s.active = true
      LIMIT 1
    `, [offering_id]);

    if (!rows.length) {
      return res.status(404).json({
        error: 'No active submission found for this course offering'
      });
    }

    const submission = rows[0];
    res.json({
      submission_id: submission.submission_id,
      course_offering_id: submission.course_offering_id,
      rubric_id: submission.rubric_id,
      assignment1: {
        id: submission.assignment1_id,
        name: submission.assignment1_name,
        due_date: submission.assignment1_due_date
      },
      assignment2: {
        id: submission.assignment2_id,
        name: submission.assignment2_name,
        due_date: submission.assignment2_due_date
      }
    });

  } catch (error) {
    console.error('Get active submission error:', error);
    res.status(500).json({ error: 'Failed to get active submission' });
  }
});

// 6) Publish validation: /api/uploads/publish
router.post('/publish', async (req, res) => {
  try {
    const { assignment_id } = req.body;
    if (!assignment_id) {
      return res.status(400).json({ error: 'assignment_id is required' });
    }

    // Check if assignment has due_date
    const { rows } = await db.query(
      'SELECT assignment_id, due_at, name FROM assignment WHERE assignment_id = $1',
      [assignment_id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const assignment = rows[0];
    if (!assignment.due_at) {
      return res.status(400).json({
        error: 'Cannot publish: Assignment must have a due date before publishing'
      });
    }

    // More publish logic can be added here, such as updating status
    // await db.query('UPDATE assignment SET status = $1 WHERE assignment_id = $2', ['PUBLISHED', assignment_id]);

    res.json({
      message: 'Assignment published successfully',
      assignment: {
        id: assignment.assignment_id,
        name: assignment.name,
        due_date: assignment.due_at
      }
    });

  } catch (error) {
    console.error('Publish error:', error);
    res.status(500).json({ error: 'Failed to publish assignment' });
  }
});

module.exports = router;