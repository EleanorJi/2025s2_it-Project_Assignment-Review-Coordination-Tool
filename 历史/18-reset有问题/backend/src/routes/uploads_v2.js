const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const mime = require('mime-types');
const db = require('../config/database');
const { parseRubricFile } = require('../utils/fileParser');
const { parseRubricWithDetails } = require('../utils/enhanced_rubric_parser');

const router = express.Router();

// Directory setup
const TEMP_DIR = path.join(__dirname, '../../temp_uploads');
const PERM_ROOT = path.join(__dirname, '../../uploads');
fs.mkdirSync(TEMP_DIR, { recursive: true });
fs.mkdirSync(PERM_ROOT, { recursive: true });

// Temporary file storage configuration (similar to original drafts)
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEMP_DIR),
  filename: (req, file, cb) => {
    const ext = mime.extension(file.mimetype) || 'bin';
    cb(null, `${uuidv4()}.${ext}`);
  }
});

const draftUpload = multer({
  storage: tempStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
});

// 1) Upload draft file: POST /api/uploads/drafts (consistent with original API)
router.post('/drafts', draftUpload.single('file'), async (req, res) => {
  try {
    const slot = req.body.slot;
    if (!['assignment1','assignment2','rubric'].includes(slot)) {
      await fsp.unlink(req.file.path).catch(()=>{});
      return res.status(400).json({ error: 'invalid slot' });
    }
    
    // Validate file type
    const fileType = req.file.mimetype;
    
    // Assignment can only be PDF
    if (slot === 'assignment1' || slot === 'assignment2') {
      if (fileType !== 'application/pdf') {
        await fsp.unlink(req.file.path).catch(()=>{});
        return res.status(400).json({ 
          error: 'Assignment files must be PDF',
          received_type: fileType 
        });
      }
    }
    
    // Rubric cannot be PDF, allow DOCX, XLSX, CSV etc.
    if (slot === 'rubric') {
      if (fileType === 'application/pdf') {
        await fsp.unlink(req.file.path).catch(()=>{});
        return res.status(400).json({ 
          error: 'Rubric files cannot be PDF (use DOCX, XLSX, CSV)',
          received_type: fileType 
        });
      }
    }

    console.log(`📋 Draft upload: ${slot}, ${req.file.originalname}, ${fileType}`);

    // Set expiry time to 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const draftInfo = {
      draft_id: uuidv4(),
      slot: slot,
      original_name: req.file.originalname,
      mime_type: fileType,
      size: req.file.size,
      temp_name: path.basename(req.file.path),
      expires_at: expiresAt.toISOString()
    };

    // Save metadata file for later parsing use
    const metadataPath = path.join(TEMP_DIR, `${draftInfo.temp_name}.metadata.json`);
    await fsp.writeFile(metadataPath, JSON.stringify(draftInfo, null, 2));

    console.log(`✅ Draft saved: ${draftInfo.temp_name}`);

    res.json(draftInfo);
    
  } catch (error) {
    console.error('❌ Draft upload failed:', error);
    await fsp.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Draft upload failed' });
  }
});

// 2) Delete draft file: DELETE /api/uploads/drafts/:tempName (consistent with original API)
router.delete('/drafts/:tempName', async (req, res) => {
  try {
    const { tempName } = req.params;
    const tempPath = path.join(TEMP_DIR, tempName);
    
    if (!fs.existsSync(tempPath)) {
      return res.status(404).json({ error: 'Draft file not found' });
    }
    
    await fsp.unlink(tempPath);
    // Try to delete metadata file
    const metadataPath = path.join(TEMP_DIR, `${tempName}.metadata.json`);
    await fsp.unlink(metadataPath).catch(() => {}); // Ignore metadata file deletion failure
    console.log(`🗑️ Draft deleted: ${tempName}`);
    
    res.json({ message: 'Draft deleted successfully' });
    
  } catch (error) {
    console.error('❌ Draft deletion failed:', error);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// 3) Single file publish: POST /api/uploads/commit (direct publish, no draft status)
router.post('/commit', async (req, res) => {
  const client = await db.connect();
  
  try {
    const { temp_name, project_id, file_type, round, due_date } = req.body;
    
    // Validate required parameters
    const requiredFields = [
      { name: 'temp_name', value: temp_name },
      { name: 'project_id', value: project_id },
      { name: 'file_type', value: file_type }
    ];

    for (const field of requiredFields) {
      if (!field.value) {
        return res.status(400).json({
          error: `Missing required field: ${field.name}`
        });
      }
    }

    if (file_type === 'assignment' && !round) {
      return res.status(400).json({ error: 'round is required for assignment files' });
    }

    // Verify temporary file exists
    const tempPath = path.join(TEMP_DIR, temp_name);
    if (!fs.existsSync(tempPath)) {
      return res.status(400).json({ error: 'draft not found' });
    }

    console.log(`🔄 Publishing file: ${file_type}, project_id=${project_id}, temp_name=${temp_name}`);

    await client.query('BEGIN');

    // Verify project exists
    const projectCheck = await client.query(
      'SELECT project_id, name FROM project WHERE project_id = $1',
      [project_id]
    );
    
    if (projectCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get file information and original filename
    const stat = await fsp.stat(tempPath);
    let mimeType = mime.lookup(tempPath) || 'application/octet-stream';
    let originalName = null;
    
    // Try to read metadata file to get original filename
    const metadataPath = path.join(TEMP_DIR, `${temp_name}.metadata.json`);
    try {
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(await fsp.readFile(metadataPath, 'utf8'));
        originalName = metadata.original_name;
        // If there is an original filename, use it to more accurately detect MIME type
        if (originalName) {
          const detectedMime = mime.lookup(originalName);
          if (detectedMime) {
            mimeType = detectedMime;
          }
        }
      }
    } catch (error) {
      console.log('⚠️ Unable to read metadata file, using default MIME type');
    }
    
    let recordId = null;
    let newVersionNumber = 1;
    let assignmentIsPublished;

    if (file_type === 'rubric') {
      // Get next version number for rubric
      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM rubric WHERE project_id = $1',
        [project_id]
      );
      newVersionNumber = versionResult.rows[0].next_version;

      // Create new rubric record
      const rubricResult = await client.query(
        `INSERT INTO rubric (uploaded_by, project_id, version) 
         VALUES ($1, $2, $3) 
         RETURNING rubric_id`,
        [1, project_id, newVersionNumber]
      );
      recordId = rubricResult.rows[0].rubric_id;
      
      console.log(`✅ Created rubric record: rubric_id=${recordId}, version=${newVersionNumber}`);

    } else if (file_type === 'assignment') {
      // Validate due_date
      if (due_date) {
        const dueDateObj = new Date(due_date);
        if (isNaN(dueDateObj.getTime())) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Invalid due_date format' });
        }
      }

      // Get next version number for assignment
      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM assignment WHERE project_id = $1 AND round = $2',
        [project_id, round]
      );
      newVersionNumber = versionResult.rows[0].next_version;

      // Create new assignment record
      const assignmentResult = await client.query(
        `INSERT INTO assignment (name, description, due_at, round, project_id, version) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING assignment_id, is_published`,
        [
          `Moderation ${round}`,
          `Assignment for round ${round}`,
          due_date ? new Date(due_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          round,
          project_id,
          newVersionNumber
        ]
      );
      recordId = assignmentResult.rows[0].assignment_id;
      assignmentIsPublished = assignmentResult.rows[0].is_published;

      console.log(`✅ Created assignment record: assignment_id=${recordId}, round=${round}, version=${newVersionNumber}, is_published=${assignmentIsPublished}`);
    }

    // Move file to permanent storage
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const permDir = path.join(PERM_ROOT, String(year), month);
    await fsp.mkdir(permDir, { recursive: true });

    const ext = path.extname(temp_name) || '.bin';
    const newFileName = `${uuidv4()}${ext}`;
    const permanentPath = path.join(permDir, newFileName);
    const storagePath = `${year}/${month}/${newFileName}`;

    // 使用copyFile + unlink 代替 rename 来解决跨文件系统问题
    await fsp.copyFile(tempPath, permanentPath);
    await fsp.unlink(tempPath);
    console.log(`📂 文件移动: ${tempPath} → ${permanentPath}`);

    // Create upload record
    const uploadResult = await client.query(
      `INSERT INTO upload (
        ${file_type === 'rubric' ? 'rubric_id' : 'assignment_id'}, 
        file_name, storage_path, file_type, owner_id, mime_type
      ) VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING upload_id`,
      [
        recordId,
        `${file_type}${round ? round : ''}${ext}`,
        storagePath,
        file_type.toUpperCase(),
        1,
        mimeType
      ]
    );

    const uploadId = uploadResult.rows[0].upload_id;
    console.log(`✅ Upload record created: upload_id=${uploadId}`);

    // If it's a rubric file, parse table information and detailed content
    let tableInfo = null;
    if (file_type === 'rubric') {
      try {
        console.log(`📊 Parsing rubric file...`);
        const { rows, columns, criteria, gradeLevels } = await parseRubricWithDetails(permanentPath, mimeType, originalName);
        
        // Update basic information in rubric table
        await client.query(
          'UPDATE rubric SET "row" = $1, "column" = $2 WHERE rubric_id = $3',
          [rows, columns, recordId]
        );
        
        console.log(`✅ Basic rubric parsing completed: ${rows} rows x ${columns} columns`);
        console.log(`📋 Extracted ${criteria.length} grading criteria`);
        console.log(`🏆 Extracted ${gradeLevels.length} grade levels`);
        
        // Save grading criteria to database
        if (criteria.length > 0) {
          console.log(`💾 Saving grading criteria to database...`);
          
          for (const criterion of criteria) {
            const criterionResult = await client.query(
              `INSERT INTO rubric_criterion (rubric_id, seq_no, title, description, max_score) 
               VALUES ($1, $2, $3, $4, $5) RETURNING criterion_id`,
              [recordId, criterion.seq_no, criterion.title, criterion.description, criterion.max_score]
            );
            
            const criterionId = criterionResult.rows[0].criterion_id;
            console.log(`  ✅ Saved criterion: ${criterion.title} (ID: ${criterionId})`);
            
            // Save grade level information for this criterion
            const criterionLevels = gradeLevels.filter(level => level.criterion_seq_no === criterion.seq_no);
            
            for (const level of criterionLevels) {
              // Ensure description is never null or empty
              const levelDescription = (level.description && level.description.trim()) || 'No description';
              
              await client.query(
                `INSERT INTO criterion_grade_level (criterion_id, level_name, min_score, max_score, description, seq_no) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [criterionId, level.level_name, level.min_score, level.max_score, levelDescription, level.seq_no]
              );
              
              console.log(`    🏆 Saved level: ${level.level_name} (${level.min_score}-${level.max_score} points)`);
            }
          }
          
          console.log(`✅ All grading criteria and levels saved to database`);
        }
        
        tableInfo = { 
          rows, 
          columns, 
          criteria_count: criteria.length, 
          grade_levels_count: gradeLevels.length 
        };
        
      } catch (parseError) {
        console.error('❌ Rubric parsing failed:', parseError);
        
        // When parsing fails, at least try basic parsing
        try {
          console.log(`🔄 Attempting basic parsing...`);
          const { rows, columns } = await parseRubricFile(permanentPath, mimeType);
          
          await client.query(
            'UPDATE rubric SET "row" = $1, "column" = $2 WHERE rubric_id = $3',
            [rows, columns, recordId]
          );
          
          tableInfo = { rows, columns, error: `Detailed parsing failed: ${parseError.message}` };
          console.log(`⚠️ Basic parsing completed: ${rows} rows x ${columns} columns`);
        } catch (basicParseError) {
          console.error('❌ Basic parsing also failed:', basicParseError);
          tableInfo = { rows: 0, columns: 0, error: `Parsing completely failed: ${basicParseError.message}` };
        }
      }
    }

    // Check if project should be automatically activated (when published assignment exists)
    let projectAutoPublished = false;
    let currentProjectStatus = 'draft';
    const projectStatusCheck = await client.query(
      'SELECT status FROM project WHERE project_id = $1',
      [project_id]
    );
    currentProjectStatus = projectStatusCheck.rows[0]?.status || 'draft';

    const publishedAssignmentCheck = await client.query(
      'SELECT 1 FROM assignment WHERE project_id = $1 AND is_published = true LIMIT 1',
      [project_id]
    );

    if (currentProjectStatus === 'draft' && publishedAssignmentCheck.rows.length > 0) {
      await client.query(
        'UPDATE project SET status = \'active\' WHERE project_id = $1',
        [project_id]
      );
      projectAutoPublished = true;
      currentProjectStatus = 'active';
      console.log(`🚀 Project automatically activated: project_id=${project_id} (has published assignment)`);
    }

    await client.query('COMMIT');

    // Clean up metadata file (temporary file has been moved to permanent location, no need to delete)
    try {
      await fsp.unlink(metadataPath);
      console.log(`🗑️ Temporary file cleanup completed: ${temp_name}, metadata file deleted`);
    } catch (cleanupError) {
      console.log(`⚠️ Metadata file cleanup failed: ${cleanupError.message}`);
    }

    const response = {
      message: 'File submitted successfully',
      upload_id: uploadId,
      file_type: file_type,
      version: newVersionNumber,
      project_id: parseInt(project_id),
      [file_type === 'rubric' ? 'rubric_id' : 'assignment_id']: recordId,
      file_info: {
        file_name: `${file_type}${round ? round : ''}${ext}`,
        mime_type: mimeType,
        storage_path: storagePath,
        download_url: `/api/uploads/${uploadId}/download`
      },
      project_status: currentProjectStatus,
      ...(projectAutoPublished && { 
        auto_published: true,
        message_note: 'Project automatically activated (published assignment exists)'
      }),
      ...(file_type === 'assignment' && typeof assignmentIsPublished !== 'undefined' && {
        assignment_status: { assignment_id: recordId, is_published: assignmentIsPublished }
      }),
      ...(tableInfo && { table_info: tableInfo }),
      ...(due_date && { due_date: new Date(due_date).toISOString() })
    };

    res.json(response);

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ File publish failed:', error);
    res.status(500).json({ 
      error: 'File commit failed',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// 4) Get project status: GET /api/uploads/project/:project_id/status
router.get('/project/:project_id/status', async (req, res) => {
  try {
    const { project_id } = req.params;
    
    console.log(`🔍 Getting project ${project_id} status...`);

    // Get project basic information
    const projectResult = await db.query(`
      SELECT 
        project_id,
        name,
        description,
        status,
        created_at
      FROM project 
      WHERE project_id = $1
    `, [project_id]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];

    // Get latest version of rubric
    const rubricResult = await db.query(`
      SELECT 
        r.rubric_id,
        r.version,
        r.row,
        r.column,
        r.created_at,
        u.upload_id,
        u.file_name,
        u.storage_path,
        u.mime_type
      FROM rubric r
      LEFT JOIN upload u ON u.rubric_id = r.rubric_id
      WHERE r.project_id = $1
      ORDER BY r.version DESC
      LIMIT 1
    `, [project_id]);

    // Get latest version of assignments
    const assignmentsResult = await db.query(`
      SELECT 
        a.assignment_id,
        a.name,
        a.round,
        a.version,
        a.due_at,
        a.created_at,
        u.upload_id,
        u.file_name,
        u.storage_path,
        u.mime_type
      FROM assignment a
      LEFT JOIN upload u ON u.assignment_id = a.assignment_id
      WHERE a.project_id = $1
      AND a.version = (
        SELECT MAX(version) 
        FROM assignment a2 
        WHERE a2.project_id = a.project_id 
        AND a2.round = a.round
      )
      ORDER BY a.round
    `, [project_id]);

    // Check project publication requirements (need rubric + at least 1 assignment)
    const hasRubric = rubricResult.rows.length > 0;
    const hasAssignments = assignmentsResult.rows.length > 0;
    const meetsPublishRequirements = hasRubric && hasAssignments;

    const projectStatus = {
      project: {
        project_id: project.project_id,
        name: project.name,
        description: project.description,
        status: project.status,
        created_at: project.created_at
      },
      rubric: rubricResult.rows.length > 0 ? {
        rubric_id: rubricResult.rows[0].rubric_id,
        version: rubricResult.rows[0].version,
        rows: rubricResult.rows[0].row,
        columns: rubricResult.rows[0].column,
        created_at: rubricResult.rows[0].created_at,
        file: rubricResult.rows[0].upload_id ? {
          upload_id: rubricResult.rows[0].upload_id,
          file_name: rubricResult.rows[0].file_name,
          download_url: `/api/uploads/${rubricResult.rows[0].upload_id}/download`
        } : null
      } : null,
      assignments: assignmentsResult.rows.map(assignment => ({
        assignment_id: assignment.assignment_id,
        name: assignment.name,
        round: assignment.round,
        version: assignment.version,
        due_at: assignment.due_at,
        created_at: assignment.created_at,
        file: assignment.upload_id ? {
          upload_id: assignment.upload_id,
          file_name: assignment.file_name,
          download_url: `/api/uploads/${assignment.upload_id}/download`
        } : null
      })),
      status_info: {
        meets_publish_requirements: hasRubric && hasAssignments,
        can_be_published: hasRubric && hasAssignments && project.status === 'draft',
        has_rubric: hasRubric,
        has_assignments: hasAssignments,
        assignment_count: assignmentsResult.rows.length,
        requirements: {
          rubric: hasRubric ? '✅' : '❌ Missing rubric',
          assignments: hasAssignments ? '✅' : '❌ Missing assignments'
        },
        note: 'Project becomes active when at least one assignment is published'
      }
    };

    console.log(`✅ Project status: meets_requirements=${meetsPublishRequirements}, rubric=${hasRubric}, assignments=${hasAssignments}`);

    res.json(projectStatus);

  } catch (error) {
    console.error('❌ Failed to get project status:', error);
    res.status(500).json({ 
      error: 'Failed to get project status',
      details: error.message 
    });
  }
});

// Get project latest rubric_id, assignment1 and assignment2 latest ids
// GET /api/uploads/project/:project_id/latest-ids
router.get('/project/:project_id/latest-ids', async (req, res) => {
  try {
    const { project_id } = req.params;

    // Latest rubric (by maximum version)
    const rubricResult = await db.query(
      `SELECT rubric_id, version
       FROM rubric WHERE project_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [project_id]
    );

    // Latest assignment round=1
    const a1Result = await db.query(
      `SELECT assignment_id, version
       FROM assignment
       WHERE project_id = $1 AND round = 1
       ORDER BY version DESC
       LIMIT 1`,
      [project_id]
    );

    // Latest assignment round=2
    const a2Result = await db.query(
      `SELECT assignment_id, version
       FROM assignment
       WHERE project_id = $1 AND round = 2
       ORDER BY version DESC
       LIMIT 1`,
      [project_id]
    );

    return res.json({
      project_id: parseInt(project_id),
      rubric: rubricResult.rows.length ? {
        rubric_id: rubricResult.rows[0].rubric_id,
        version: rubricResult.rows[0].version
      } : null,
      assignment1: a1Result.rows.length ? {
        assignment_id: a1Result.rows[0].assignment_id,
        version: a1Result.rows[0].version
      } : null,
      assignment2: a2Result.rows.length ? {
        assignment_id: a2Result.rows[0].assignment_id,
        version: a2Result.rows[0].version
      } : null
    });
  } catch (error) {
    console.error('❌ Failed to get latest-ids:', error);
    return res.status(500).json({ error: 'Failed to get latest ids', details: error.message });
  }
});

// 5) Activate project: POST /api/uploads/project/:project_id/activate (from draft to active)
router.post('/project/:project_id/activate', async (req, res) => {
  try {
    const { project_id } = req.params;
    
    console.log(`🚀 Activating project: project_id=${project_id}`);

    // Verify project exists
    const projectCheck = await db.query(
      'SELECT project_id FROM project WHERE project_id = $1',
      [project_id]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Activation condition: at least one published assignment exists
    const publishedAssignment = await db.query(
      'SELECT 1 FROM assignment WHERE project_id = $1 AND is_published = true LIMIT 1',
      [project_id]
    );

    if (publishedAssignment.rows.length === 0) {
      return res.status(400).json({ 
        error: 'Cannot activate project',
        details: {
          requirements: 'At least one published assignment is required to activate the project'
        }
      });
    }

    // Change project status from draft to active
    await db.query(
      'UPDATE project SET status = \'active\' WHERE project_id = $1',
      [project_id]
    );

    console.log(`✅ Project activated successfully: project_id=${project_id}`);

    res.json({
      message: 'Project activated successfully',
      project_id: parseInt(project_id),
      status: 'active',
      activated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Project activation failed:', error);
    res.status(500).json({ 
      error: 'Failed to activate project',
      details: error.message 
    });
  }
});

// 5b) Compatible with old route: publish project (internally redirect to activate) POST /api/uploads/project/:project_id/publish
router.post('/project/:project_id/publish', async (req, res) => {
  // For compatibility with old clients, reuse activation logic
  req.url = `/project/${req.params.project_id}/activate`;
  return router.handle(req, res);
});

// 6) File download: GET /api/uploads/:id/download (fully consistent with original API)
router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rows } = await db.query(
      'SELECT file_name, storage_path, mime_type FROM upload WHERE upload_id = $1',
      [id]
    );
    
    if (!rows.length) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const { file_name, storage_path, mime_type } = rows[0];
    const filePath = path.join(PERM_ROOT, storage_path);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }
    
    res.setHeader('Content-Type', mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file_name}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('❌ File download failed:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// 7) Create project: POST /api/uploads/project
router.post('/project', async (req, res) => {
  const client = await db.connect();
  
  try {
    const { name, description } = req.body;
    
    const projectName = (name && name.trim()) || 'New Project';
    const projectDescription = (description && description.trim()) || 'No description';
    
    console.log(`📁 Creating new project: ${projectName}`);

    await client.query('BEGIN');

    // Create new project (default draft status)
    const projectResult = await client.query(
      `INSERT INTO project (name, description, created_by, status) 
       VALUES ($1, $2, $3, 'draft') 
       RETURNING project_id, name, description, status, created_at`,
      [projectName, projectDescription, 1] // Default creator ID is 1
    );

    const newProject = projectResult.rows[0];

    await client.query('COMMIT');

    console.log(`✅ Project created successfully: project_id=${newProject.project_id}`);

    res.json({
      message: 'Project created successfully',
      project: {
        project_id: newProject.project_id,
        name: newProject.name,
        description: newProject.description,
        status: newProject.status,
        created_at: newProject.created_at
      }
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Project creation failed:', error);
    res.status(500).json({ 
      error: 'Failed to create project',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// 8) Rename project: PUT /api/uploads/project/:project_id
router.put('/project/:project_id', async (req, res) => {
  try {
    const { project_id } = req.params;
    const { name, description } = req.body;
    
    if (!name && !description) {
      return res.status(400).json({ error: 'Name or description is required' });
    }

    console.log(`📝 Updating project: project_id=${project_id}`);

    // Build update fields
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (name) {
      const trimmedName = name.trim();
      updateFields.push(`name = $${paramIndex}`);
      updateValues.push(trimmedName || 'New Project');
      paramIndex++;
    }

    if (description !== undefined) {
      const trimmedDescription = (description && description.trim()) || 'No description';
      updateFields.push(`description = $${paramIndex}`);
      updateValues.push(trimmedDescription);
      paramIndex++;
    }

    updateValues.push(project_id);

    const updateQuery = `
      UPDATE project 
      SET ${updateFields.join(', ')} 
      WHERE project_id = $${paramIndex}
      RETURNING project_id, name, description, status, created_at
    `;

    const result = await db.query(updateQuery, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updatedProject = result.rows[0];

    console.log(`✅ Project updated successfully: ${updatedProject.name}`);

    res.json({
      message: 'Project updated successfully',
      project: {
        project_id: updatedProject.project_id,
        name: updatedProject.name,
        description: updatedProject.description,
        status: updatedProject.status,
        created_at: updatedProject.created_at
      }
    });

  } catch (error) {
    console.error('❌ Project update failed:', error);
    res.status(500).json({ 
      error: 'Failed to update project',
      details: error.message 
    });
  }
});

// 9) Get all projects: GET /api/uploads/projects
router.get('/projects', async (req, res) => {
  try {
    console.log('📋 Getting all project list...');

    const result = await db.query(`
      SELECT 
        project_id,
        name,
        description,
        status,
        created_at,
        (SELECT COUNT(*) FROM rubric WHERE project_id = p.project_id) as rubric_count,
        (SELECT COUNT(*) FROM assignment WHERE project_id = p.project_id) as assignment_count
      FROM project p
      ORDER BY created_at DESC
    `);

    console.log(`✅ Found ${result.rows.length} projects`);

    res.json({
      projects: result.rows.map(project => ({
        project_id: project.project_id,
        name: project.name,
        description: project.description,
        status: project.status,
        created_at: project.created_at,
        file_counts: {
          rubric: parseInt(project.rubric_count),
          assignments: parseInt(project.assignment_count)
        }
      }))
    });

  } catch (error) {
    console.error('❌ Failed to get project list:', error);
    res.status(500).json({ 
      error: 'Failed to get projects',
      details: error.message 
    });
  }
});

// Past tasks: GET /api/uploads/past-tasks
// Returns archived projects grouped by computed semester (Australia/Melbourne),
// each project includes latest Round 1 and Round 2 assignment (by version),
// and provides target URLs for feedback and rubric pages
router.get('/past-tasks', async (req, res) => {
  try {
    console.log('📚 Getting past tasks (archived projects)...');

    // 1) Get archived projects with their latest due_at (max of assignments)
    const archivedProjects = await db.query(`
      SELECT 
        p.project_id,
        p.name,
        p.status,
        MAX(a.due_at) AS latest_due
      FROM project p
      JOIN assignment a ON a.project_id = p.project_id
      WHERE p.status IN ('archived','completed')
      GROUP BY p.project_id, p.name
      ORDER BY latest_due DESC NULLS LAST
    `);

    // 2) For all these projects, fetch latest version assignment per round (1 and 2)
    const projectIds = archivedProjects.rows.map(r => r.project_id);
    let latestAssignments = [];
    if (projectIds.length > 0) {
      const inParams = projectIds.map((_, i) => `$${i + 1}`).join(',');
      const latestSql = `
        SELECT a.* FROM assignment a
        JOIN (
          SELECT project_id, round, MAX(version) AS max_version
          FROM assignment
          WHERE project_id IN (${inParams})
          GROUP BY project_id, round
        ) t
        ON a.project_id = t.project_id AND a.round = t.round AND a.version = t.max_version
      `;
      const latestRs = await db.query(latestSql, projectIds);
      latestAssignments = latestRs.rows;
    }

    // 3) Build map: project_id -> { round1, round2 }
    const idToAssignments = new Map();
    for (const row of latestAssignments) {
      const bucket = idToAssignments.get(row.project_id) || {};
      if (row.round === 1) bucket.round1 = row;
      if (row.round === 2) bucket.round2 = row;
      idToAssignments.set(row.project_id, bucket);
    }

    // 4) Helper to compute semester in Australia/Melbourne
    const tz = 'Australia/Melbourne';
    function computeSemester(dueIso) {
      if (!dueIso) return { year: null, sem: null };
      const d = new Date(dueIso);
      // Get components in Australia/Melbourne
      const parts = new Intl.DateTimeFormat('en-AU', {
        timeZone: tz,
        year: 'numeric', month: 'numeric', day: 'numeric'
      }).formatToParts(d).reduce((acc, p) => { acc[p.type] = parseInt(p.value, 10) || acc[p.type]; return acc; }, {});
      const month = parts.month; // 1-12
      const year = parts.year;
      if (month >= 2 && month <= 6) {
        return { year, sem: 1 };
      }
      // 7..12 and 1 belong to Semester 2; year is the July year
      if (month >= 7) {
        return { year, sem: 2 };
      }
      // month === 1 => Semester 2 of previous year
      return { year: year - 1, sem: 2 };
    }

    // 5) Assemble groups { year, semester, projects: [...] }
    const groupsMap = new Map(); // key: `${year}-S${sem}`

    for (const p of archivedProjects.rows) {
      const rounds = idToAssignments.get(p.project_id) || {};
      const latestDue = p.latest_due || rounds.round2?.due_at || rounds.round1?.due_at;
      const { year, sem } = computeSemester(latestDue);
      if (!year || !sem) continue;

      const key = `${year}-S${sem}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { year, semester: `Semester ${sem}`, projects: [] });
      }

      const assignments = [];
      if (rounds.round1) {
        assignments.push({
          assignment_id: rounds.round1.assignment_id,
          title: `${rounds.round1.name} (Round 1)`,
          round: 1,
          report_url: `/dashboard/coordinator/feedback?assignment=${encodeURIComponent(rounds.round1.assignment_id)}`,
          rubric_url: `/dashboard/coordinator/rubric?project=${encodeURIComponent(p.project_id)}`
        });
      }
      if (rounds.round2) {
        assignments.push({
          assignment_id: rounds.round2.assignment_id,
          title: `${rounds.round2.name} (Round 2)`,
          round: 2,
          report_url: `/dashboard/coordinator/feedback?assignment=${encodeURIComponent(rounds.round2.assignment_id)}`,
          rubric_url: `/dashboard/coordinator/rubric?project=${encodeURIComponent(p.project_id)}`
        });
      }

      groupsMap.get(key).projects.push({
        project_id: p.project_id,
        project_name: p.name,
        status: p.status,
        assignments
      });
    }

    // 6) Sort groups by year desc then S2 before S1; projects keep DB order
    const groups = Array.from(groupsMap.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      const sa = a.semester === 'Semester 2' ? 2 : 1;
      const sb = b.semester === 'Semester 2' ? 2 : 1;
      return sb - sa;
    });

    res.json({ groups });
  } catch (error) {
    console.error('❌ Failed to get past tasks:', error);
    res.status(500).json({ error: 'Failed to get past tasks', details: error.message });
  }
});

// Update project status: PUT /api/uploads/project/:project_id/status
// Allowed transitions: active -> completed|archived, completed -> archived, archived -> completed (no draft)
router.put('/project/:project_id/status', async (req, res) => {
  const client = await db.connect();
  try {
    const { project_id } = req.params;
    const { status } = req.body || {};

    const allowed = ['completed', 'archived', 'active'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const currentRs = await client.query('SELECT status FROM project WHERE project_id = $1', [project_id]);
    if (currentRs.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const current = currentRs.rows[0].status;

    // Transition rules:
    // - No draft here
    // - active -> completed | archived
    // - completed -> archived
    // - archived -> completed
    if (current === 'archived' && !(status === 'archived' || status === 'completed')) {
      return res.status(400).json({ error: 'Archived project can only move to completed' });
    }
    if (status === 'active' && current !== 'active') {
      return res.status(400).json({ error: 'Cannot transition back to active' });
    }
    if (status === 'completed' && !['active','completed','archived'].includes(current)) {
      return res.status(400).json({ error: 'Invalid transition to completed' });
    }

    await client.query('UPDATE project SET status = $1 WHERE project_id = $2', [status, project_id]);
    return res.json({ project_id: Number(project_id), status });
  } catch (error) {
    console.error('Failed to update project status:', error);
    return res.status(500).json({ error: 'Failed to update project status' });
  } finally {
    client.release();
  }
});

// 10) Delete project: DELETE /api/uploads/project/:project_id
router.delete('/project/:project_id', async (req, res) => {
  const client = await db.connect();
  
  try {
    const { project_id } = req.params;
    
    console.log(`🗑️ Deleting project: project_id=${project_id}`);
    console.log(`🗑️ Project ID type: ${typeof project_id}`);

    await client.query('BEGIN');

    // Validate project exists and get project info
    const projectCheck = await client.query(
      'SELECT project_id, name FROM project WHERE project_id = $1',
      [project_id]
    );
    
    console.log(`🗑️ Project check result: ${projectCheck.rows.length} rows found`);
    
    if (projectCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      console.log(`🗑️ Project not found: ${project_id}`);
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectName = projectCheck.rows[0].name;

    // Get all related upload file paths
    const uploadFiles = await client.query(`
      SELECT u.storage_path 
      FROM upload u
      LEFT JOIN assignment a ON u.assignment_id = a.assignment_id
      LEFT JOIN rubric r ON u.rubric_id = r.rubric_id
      WHERE a.project_id = $1 OR r.project_id = $1
    `, [project_id]);

    // Delete physical files
    for (const file of uploadFiles.rows) {
      if (file.storage_path) {
        const filePath = path.join(PERM_ROOT, file.storage_path);
        try {
          await fsp.unlink(filePath);
          console.log(`📂 File deleted: ${file.storage_path}`);
        } catch (fileError) {
          console.log(`⚠️ File deletion failed (may not exist): ${file.storage_path}`);
        }
      }
    }

    // Delete related records in correct order to avoid foreign key constraints
    // Get all assignment IDs and rubric IDs for this project first
    const assignmentIds = await client.query(
      'SELECT assignment_id FROM assignment WHERE project_id = $1',
      [project_id]
    );
    
    const rubricIds = await client.query(
      'SELECT rubric_id FROM rubric WHERE project_id = $1',
      [project_id]
    );
    
    // 1. Delete upload records first (they reference both assignment and rubric)
    if (assignmentIds.rows.length > 0) {
      const assignmentIdList = assignmentIds.rows.map(row => row.assignment_id);
      const assignmentPlaceholders = assignmentIdList.map((_, i) => `$${i + 1}`).join(',');
      await client.query(`
        DELETE FROM upload 
        WHERE assignment_id IN (${assignmentPlaceholders})
      `, assignmentIdList);
    }
    
    if (rubricIds.rows.length > 0) {
      const rubricIdList = rubricIds.rows.map(row => row.rubric_id);
      const rubricPlaceholders = rubricIdList.map((_, i) => `$${i + 1}`).join(',');
      await client.query(`
        DELETE FROM upload 
        WHERE rubric_id IN (${rubricPlaceholders})
      `, rubricIdList);
    }
    
    // 2. Delete other related records that reference assignments
    if (assignmentIds.rows.length > 0) {
      const ids = assignmentIds.rows.map(row => row.assignment_id);
      
      // Delete baseline_score records
      if (ids.length > 0) {
        const baselinePlaceholders = ids.map((_, i) => `$${i + 1}`).join(',');
        await client.query(`
          DELETE FROM baseline_score 
          WHERE assignment_id IN (${baselinePlaceholders})
        `, ids);
      }
      
      // Delete feedback records
      if (ids.length > 0) {
        const feedbackPlaceholders = ids.map((_, i) => `$${i + 1}`).join(',');
        await client.query(`
          DELETE FROM feedback 
          WHERE assignment_id IN (${feedbackPlaceholders})
        `, ids);
      }
      
      // Delete marker_score records
      if (ids.length > 0) {
        const markerPlaceholders = ids.map((_, i) => `$${i + 1}`).join(',');
        await client.query(`
          DELETE FROM marker_score 
          WHERE assignment_id IN (${markerPlaceholders})
        `, ids);
      }
    }
    
    // 3. Finally delete the project (this will CASCADE delete assignments and rubrics)
    await client.query('DELETE FROM project WHERE project_id = $1', [project_id]);

    await client.query('COMMIT');

    console.log(`✅ Project deleted successfully: ${projectName} (project_id=${project_id})`);

    res.json({
      message: 'Project deleted successfully',
      deleted_project: {
        project_id: parseInt(project_id),
        name: projectName
      },
      files_deleted: uploadFiles.rows.length
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Project deletion failed:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to delete project',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// 11) Delete project by name: DELETE /api/uploads/project/by-name/:name
router.delete('/project/by-name/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    console.log(`🔍 Finding project: name=${name}`);

    // Find project
    const projectResult = await db.query(
      'SELECT project_id, name FROM project WHERE name = $1',
      [name]
    );
    
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found with this name' });
    }

    if (projectResult.rows.length > 1) {
      return res.status(400).json({ 
        error: 'Multiple projects found with this name',
        projects: projectResult.rows,
        suggestion: 'Use DELETE /api/uploads/project/:project_id instead'
      });
    }

    const project = projectResult.rows[0];
    
    // Redirect to delete by ID
    console.log(`🔄 Redirecting to delete by ID: project_id=${project.project_id}`);
    
    // Directly call delete logic
    req.params.project_id = project.project_id;
    return router.handle(
      Object.assign(req, { method: 'DELETE', url: `/project/${project.project_id}` }), 
      res
    );

  } catch (error) {
    console.error('❌ Failed to delete project by name:', error);
    res.status(500).json({ 
      error: 'Failed to delete project by name',
      details: error.message 
    });
  }
});

// 12) Batch cleanup temporary files: DELETE /api/uploads/debug/temp-files
router.delete('/debug/temp-files', async (req, res) => {
  try {
    const { older_than_hours, force } = req.query;
    
    console.log('🧹 Cleaning temporary files...');
    
    const files = await fsp.readdir(TEMP_DIR);
    let deletedFiles = [];
    let skippedFiles = [];
    
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stat = await fsp.stat(filePath);
      
      // If time limit is specified
      if (older_than_hours && !force) {
        const hoursOld = (Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60);
        if (hoursOld < parseFloat(older_than_hours)) {
          skippedFiles.push({
            name: file,
            reason: `Only ${hoursOld.toFixed(1)} hours old`
          });
          continue;
        }
      }
      
      try {
        await fsp.unlink(filePath);
        deletedFiles.push({
          name: file,
          size: stat.size,
          age_hours: ((Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60)).toFixed(1)
        });
        console.log(`🗑️ Deleted temp file: ${file}`);
      } catch (unlinkError) {
        skippedFiles.push({
          name: file,
          reason: `Delete failed: ${unlinkError.message}`
        });
      }
    }

    console.log(`✅ Temp files cleanup completed: deleted ${deletedFiles.length}, skipped ${skippedFiles.length}`);

    res.json({
      message: 'Temp files cleanup completed',
      deleted_count: deletedFiles.length,
      skipped_count: skippedFiles.length,
      deleted_files: deletedFiles,
      ...(skippedFiles.length > 0 && { skipped_files: skippedFiles })
    });

  } catch (error) {
    console.error('❌ Temp files cleanup failed:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup temp files',
      details: error.message 
    });
  }
});

// 13) Debug tool: GET /api/uploads/debug/temp-files (consistent with original API)
router.get('/debug/temp-files', async (req, res) => {
  try {
    const files = await fsp.readdir(TEMP_DIR);
    const fileDetails = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(TEMP_DIR, file);
        const stat = await fsp.stat(filePath);
        return {
          name: file,
          size: stat.size,
          created: stat.birthtime,
          modified: stat.mtime
        };
      })
    );
    
    res.json({
      temp_directory: TEMP_DIR,
      file_count: files.length,
      files: fileDetails
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    res.status(500).json({ error: 'Debug failed' });
  }
});

// 16) Manually update score range: PUT /api/uploads/grade-level/:grade_level_id
router.put('/grade-level/:grade_level_id', async (req, res) => {
  try {
    const { grade_level_id } = req.params;
    const { min_score, max_score, level_name, description } = req.body;
    
    console.log(`🔧 Manually updating score range: grade_level_id=${grade_level_id}`);
    
    // Validate required parameters
    if (min_score === undefined || max_score === undefined) {
      return res.status(400).json({ 
        error: 'min_score and max_score are required' 
      });
    }
    
    // Validate score range reasonableness
    const minScore = parseFloat(min_score);
    const maxScore = parseFloat(max_score);
    
    if (isNaN(minScore) || isNaN(maxScore)) {
      return res.status(400).json({ 
        error: 'min_score and max_score must be valid numbers' 
      });
    }
    
    if (minScore < 0) {
      return res.status(400).json({ 
        error: 'min_score must be >= 0' 
      });
    }
    
    if (maxScore <= minScore) {
      return res.status(400).json({ 
        error: 'max_score must be greater than min_score' 
      });
    }
    
    // Check if level exists
    const existingLevel = await db.query(
      'SELECT * FROM criterion_grade_level WHERE grade_level_id = $1',
      [grade_level_id]
    );
    
    if (existingLevel.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Grade level not found' 
      });
    }
    
    const currentLevel = existingLevel.rows[0];
    
    // Build update statement
    const updateFields = [];
    const updateValues = [];
    let valueIndex = 1;
    
    updateFields.push(`min_score = $${valueIndex++}`);
    updateValues.push(minScore);
    
    updateFields.push(`max_score = $${valueIndex++}`);
    updateValues.push(maxScore);
    
    if (level_name !== undefined) {
      updateFields.push(`level_name = $${valueIndex++}`);
      updateValues.push(level_name);
    }
    
    if (description !== undefined) {
      updateFields.push(`description = $${valueIndex++}`);
      updateValues.push(description);
    }
    
    updateValues.push(grade_level_id);
    
    const updateQuery = `
      UPDATE criterion_grade_level 
      SET ${updateFields.join(', ')} 
      WHERE grade_level_id = $${valueIndex}
      RETURNING *
    `;
    
    const result = await db.query(updateQuery, updateValues);
    const updatedLevel = result.rows[0];
    
    console.log(`✅ Score range updated successfully:`);
    console.log(`  Original: ${currentLevel.level_name} (${currentLevel.min_score}-${currentLevel.max_score})`);
    console.log(`  Updated: ${updatedLevel.level_name} (${updatedLevel.min_score}-${updatedLevel.max_score})`);
    
    res.json({
      message: 'Grade level updated successfully',
      grade_level_id: parseInt(grade_level_id),
      previous: {
        level_name: currentLevel.level_name,
        min_score: parseFloat(currentLevel.min_score),
        max_score: parseFloat(currentLevel.max_score),
        description: currentLevel.description
      },
      updated: {
        level_name: updatedLevel.level_name,
        min_score: parseFloat(updatedLevel.min_score),
        max_score: parseFloat(updatedLevel.max_score),
        description: updatedLevel.description
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to update score range:', error);
    res.status(500).json({ 
      error: 'Failed to update grade level',
      details: error.message 
    });
  }
});

// 17) Get all grading criteria and levels: GET /api/uploads/rubric/:rubric_id/details
router.get('/rubric/:rubric_id/details', async (req, res) => {
  try {
    const { rubric_id } = req.params;
    
    console.log(`📋 Getting rubric details: rubric_id=${rubric_id}`);
    
    // Get rubric basic information
    const rubricInfo = await db.query(
      'SELECT * FROM rubric WHERE rubric_id = $1',
      [rubric_id]
    );
    
    if (rubricInfo.rows.length === 0) {
      return res.status(404).json({ error: 'Rubric not found' });
    }
    
    // Get all grading criteria
    const criteria = await db.query(`
      SELECT 
        rc.criterion_id,
        rc.seq_no,
        rc.title,
        rc.description,
        rc.max_score
      FROM rubric_criterion rc
      WHERE rc.rubric_id = $1
      ORDER BY rc.seq_no
    `, [rubric_id]);
    
    // Get all grade levels
    const gradeLevels = await db.query(`
      SELECT 
        cgl.grade_level_id,
        cgl.criterion_id,
        cgl.level_name,
        cgl.min_score,
        cgl.max_score,
        cgl.description,
        cgl.seq_no,
        rc.title as criterion_title
      FROM criterion_grade_level cgl
      JOIN rubric_criterion rc ON cgl.criterion_id = rc.criterion_id
      WHERE rc.rubric_id = $1
      ORDER BY rc.seq_no, cgl.seq_no
    `, [rubric_id]);
    
    // Organize data structure
    const criteriaWithLevels = criteria.rows.map(criterion => ({
      criterion_id: criterion.criterion_id,
      seq_no: criterion.seq_no,
      title: criterion.title,
      description: criterion.description,
      max_score: parseFloat(criterion.max_score),
      grade_levels: gradeLevels.rows
        .filter(level => level.criterion_id === criterion.criterion_id)
        .map(level => ({
          grade_level_id: level.grade_level_id,
          level_name: level.level_name,
          min_score: parseFloat(level.min_score),
          max_score: parseFloat(level.max_score),
          description: level.description,
          seq_no: level.seq_no
        }))
    }));
    
    console.log(`✅ Returning ${criteria.rows.length} criteria, ${gradeLevels.rows.length} levels`);
    
    res.json({
      rubric: {
        rubric_id: parseInt(rubric_id),
        rows: rubricInfo.rows[0].row,
        columns: rubricInfo.rows[0].column,
        version: rubricInfo.rows[0].version,
        created_at: rubricInfo.rows[0].created_at
      },
      criteria: criteriaWithLevels,
      summary: {
        criteria_count: criteria.rows.length,
        grade_levels_count: gradeLevels.rows.length
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to get rubric details:', error);
    res.status(500).json({ 
      error: 'Failed to get rubric details',
      details: error.message 
    });
  }
});

// Grade modification function: find corresponding grade level based on criterion and score
router.post('/score-lookup', async (req, res) => {
  try {
    const { criterion_id, score } = req.body;
    
    if (!criterion_id || score === undefined || score === null) {
      return res.status(400).json({ 
        error: 'Missing required fields: criterion_id and score' 
      });
    }
    
    const scoreValue = parseFloat(score);
    if (isNaN(scoreValue)) {
      return res.status(400).json({ 
        error: 'Invalid score value. Must be a number.' 
      });
    }
    
    console.log(`🔍 Finding grade for score ${scoreValue} in criterion ${criterion_id}...`);
    
    // First validate if criterion exists
    const criterionCheck = await db.query(
      'SELECT criterion_id, title, max_score FROM rubric_criterion WHERE criterion_id = $1',
      [criterion_id]
    );
    
    if (criterionCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Criterion not found' 
      });
    }
    
    const criterion = criterionCheck.rows[0];
    
    // Check if score is within valid range
    if (scoreValue < 0 || scoreValue > criterion.max_score) {
      return res.status(400).json({ 
        error: `Score ${scoreValue} is out of range. Valid range: 0 - ${criterion.max_score}`,
        criterion_info: {
          criterion_id: criterion.criterion_id,
          title: criterion.title,
          max_score: criterion.max_score
        }
      });
    }
    
    // Find corresponding grade level (score between min_score and max_score)
    const gradeLevelQuery = await db.query(`
      SELECT 
        grade_level_id,
        level_name,
        min_score,
        max_score,
        description,
        seq_no
      FROM criterion_grade_level 
      WHERE criterion_id = $1 
        AND $2 >= min_score 
        AND $2 <= max_score
      ORDER BY seq_no
    `, [criterion_id, scoreValue]);
    
    if (gradeLevelQuery.rows.length === 0) {
      // If no exact match, find the closest level
      const nearestQuery = await db.query(`
        SELECT 
          grade_level_id,
          level_name,
          min_score,
          max_score,
          description,
          seq_no,
          ABS($2 - (min_score + max_score) / 2) as distance
        FROM criterion_grade_level 
        WHERE criterion_id = $1
        ORDER BY distance ASC, seq_no ASC
        LIMIT 1
      `, [criterion_id, scoreValue]);
      
      if (nearestQuery.rows.length > 0) {
        const nearestLevel = nearestQuery.rows[0];
        return res.json({
          match_type: 'nearest',
          message: `No exact match found. Showing nearest grade level.`,
          criterion_info: {
            criterion_id: criterion.criterion_id,
            title: criterion.title,
            max_score: criterion.max_score
          },
          input_score: scoreValue,
          grade_level: {
            grade_level_id: nearestLevel.grade_level_id,
            level_name: nearestLevel.level_name,
            min_score: parseFloat(nearestLevel.min_score),
            max_score: parseFloat(nearestLevel.max_score),
            description: nearestLevel.description,
            seq_no: nearestLevel.seq_no,
            distance: parseFloat(nearestLevel.distance)
          }
        });
      } else {
        return res.status(404).json({ 
          error: 'No grade levels found for this criterion' 
        });
      }
    }
    
    // Return exact match result
    const gradeLevel = gradeLevelQuery.rows[0];
    
    console.log(`✅ Found matching level: ${gradeLevel.level_name} (${gradeLevel.min_score}-${gradeLevel.max_score} points)`);
    
    res.json({
      match_type: 'exact',
      message: 'Exact match found',
      criterion_info: {
        criterion_id: criterion.criterion_id,
        title: criterion.title,
        max_score: criterion.max_score
      },
      input_score: scoreValue,
      grade_level: {
        grade_level_id: gradeLevel.grade_level_id,
        level_name: gradeLevel.level_name,
        min_score: parseFloat(gradeLevel.min_score),
        max_score: parseFloat(gradeLevel.max_score),
        description: gradeLevel.description,
        seq_no: gradeLevel.seq_no
      }
    });
    
  } catch (error) {
    console.error('❌ Score lookup failed:', error);
    res.status(500).json({ 
      error: 'Failed to lookup score',
      details: error.message 
    });
  }
});

// ============== Scoring APIs ==============

/**
 * Generic function to match grade level range by score
 */
async function findGradeLevelByScore(criterion_id, score) {
  const result = await db.query(
    `SELECT cgl.*, rc.title as criterion_title, rc.max_score as criterion_max_score
     FROM criterion_grade_level cgl
     JOIN rubric_criterion rc ON cgl.criterion_id = rc.criterion_id
     WHERE cgl.criterion_id = $1 
       AND $2 >= cgl.min_score 
       AND $2 <= cgl.max_score
     ORDER BY cgl.seq_no
     LIMIT 1`,
    [criterion_id, score]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const level = result.rows[0];
  return {
    grade_level_id: level.grade_level_id,
    criterion_id: level.criterion_id,
    criterion_title: level.criterion_title,
    criterion_max_score: parseFloat(level.criterion_max_score),
    level_name: level.level_name,
    min_score: parseFloat(level.min_score),
    max_score: parseFloat(level.max_score),
    description: level.description,
    seq_no: level.seq_no
  };
}

/**
 * Coordinator exclusive - set/update baseline score
 * POST /api/uploads/scoring/baseline
 */
router.post('/scoring/baseline', async (req, res) => {
  try {
    const { assignment_id, criterion_id, score, comment } = req.body;

    // Validate required fields
    if (!assignment_id || !criterion_id || score === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: assignment_id, criterion_id, score'
      });
    }

    const scoreValue = parseFloat(score);
    if (isNaN(scoreValue) || scoreValue < 0) {
      return res.status(400).json({
        error: 'Score must be a non-negative number'
      });
    }

    // Validate assignment exists and is latest version
    const assignmentCheck = await db.query(
      `SELECT a.assignment_id, a.project_id, a.version, a.round
       FROM assignment a
       WHERE a.assignment_id = $1
         AND a.version = (
           SELECT MAX(version) 
           FROM assignment 
           WHERE project_id = a.project_id AND round = a.round
         )`,
      [assignment_id]
    );

    if (assignmentCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Assignment not found or not latest version',
        message: 'Only the latest version of assignment can be scored'
      });
    }

    const projectId = assignmentCheck.rows[0].project_id;

    // Verify criterion exists and belongs to the latest rubric version of the project
    const criterionCheck = await db.query(
      `SELECT rc.criterion_id, rc.max_score, r.rubric_id, r.version
       FROM rubric_criterion rc
       JOIN rubric r ON rc.rubric_id = r.rubric_id
       WHERE rc.criterion_id = $1 
         AND r.project_id = $2
         AND r.version = (
           SELECT MAX(version) 
           FROM rubric 
           WHERE project_id = $2
         )`,
      [criterion_id, projectId]
    );

    if (criterionCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Criterion not found or not in latest rubric version',
        message: 'Only criteria from the latest rubric version can be scored'
      });
    }

    const maxScore = parseFloat(criterionCheck.rows[0].max_score);
    if (scoreValue > maxScore) {
      return res.status(400).json({
        error: `Score (${scoreValue}) exceeds criterion maximum (${maxScore})`
      });
    }

    // Find matching grade level range
    const gradeLevel = await findGradeLevelByScore(criterion_id, scoreValue);
    if (!gradeLevel) {
      return res.status(400).json({
        error: `Score ${scoreValue} does not match any grade level for this criterion`
      });
    }

    // Insert or update baseline_score
    const upsertResult = await db.query(
      `INSERT INTO baseline_score (assignment_id, criterion_id, score, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (assignment_id, criterion_id)
       DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment
       RETURNING *`,
      [assignment_id, criterion_id, scoreValue, comment || null]
    );

    const baselineScore = upsertResult.rows[0];

    console.log(`✅ Baseline score set successfully: assignment_id=${assignment_id}, criterion_id=${criterion_id}, score=${scoreValue}`);

    res.json({
      message: 'Baseline score set successfully',
      baseline_score: {
        baseline_id: baselineScore.baseline_id,
        assignment_id: baselineScore.assignment_id,
        criterion_id: baselineScore.criterion_id,
        score: parseFloat(baselineScore.score),
        comment: baselineScore.comment
      },
      matched_grade_level: gradeLevel
    });

  } catch (error) {
    console.error('❌ Failed to set baseline score:', error);
    res.status(500).json({
      error: 'Failed to set baseline score',
      details: error.message
    });
  }
});

/**
 * Marker exclusive - set/update marker score
 * POST /api/uploads/scoring/marker
 */
router.post('/scoring/marker', async (req, res) => {
  try {
    const { assignment_id, criterion_id, marker_id, score, comment } = req.body;

    // Validate required fields
    if (!assignment_id || !criterion_id || !marker_id || score === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: assignment_id, criterion_id, marker_id, score'
      });
    }

    const scoreValue = parseFloat(score);
    if (isNaN(scoreValue) || scoreValue < 0) {
      return res.status(400).json({
        error: 'Score must be a non-negative number'
      });
    }

    // Verify assignment exists and is the latest version
    const assignmentCheck = await db.query(
      `SELECT a.assignment_id, a.project_id, a.version, a.round
       FROM assignment a
       WHERE a.assignment_id = $1
         AND a.version = (
           SELECT MAX(version) 
           FROM assignment 
           WHERE project_id = a.project_id AND round = a.round
         )`,
      [assignment_id]
    );

    if (assignmentCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Assignment not found or not latest version',
        message: 'Only the latest version of assignment can be scored'
      });
    }

    const projectId = assignmentCheck.rows[0].project_id;

    // Verify criterion exists and belongs to the latest rubric version of the project
    const criterionCheck = await db.query(
      `SELECT rc.criterion_id, rc.max_score, r.rubric_id, r.version
       FROM rubric_criterion rc
       JOIN rubric r ON rc.rubric_id = r.rubric_id
       WHERE rc.criterion_id = $1 
         AND r.project_id = $2
         AND r.version = (
           SELECT MAX(version) 
           FROM rubric 
           WHERE project_id = $2
         )`,
      [criterion_id, projectId]
    );

    if (criterionCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Criterion not found or not in latest rubric version',
        message: 'Only criteria from the latest rubric version can be scored'
      });
    }

    const markerCheck = await db.query(
      'SELECT user_id FROM app_user WHERE user_id = $1',
      [marker_id]
    );

    if (markerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Marker not found' });
    }

    const maxScore = parseFloat(criterionCheck.rows[0].max_score);
    if (scoreValue > maxScore) {
      return res.status(400).json({
        error: `Score (${scoreValue}) exceeds criterion maximum (${maxScore})`
      });
    }

    // Find matching grade level range
    const gradeLevel = await findGradeLevelByScore(criterion_id, scoreValue);
    if (!gradeLevel) {
      return res.status(400).json({
        error: `Score ${scoreValue} does not match any grade level for this criterion`
      });
    }

    // Insert or update marker_score
    const upsertResult = await db.query(
      `INSERT INTO marker_score (assignment_id, criterion_id, marker_id, score, comment, submitted_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (assignment_id, criterion_id, marker_id)
       DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment, submitted_at = NOW()
       RETURNING *`,
      [assignment_id, criterion_id, marker_id, scoreValue, comment || null]
    );

    const markerScore = upsertResult.rows[0];

    console.log(`✅ Marker score set successfully: assignment_id=${assignment_id}, criterion_id=${criterion_id}, marker_id=${marker_id}, score=${scoreValue}`);

    res.json({
      message: 'Marker score set successfully',
      marker_score: {
        marker_score_id: markerScore.marker_score_id,
        assignment_id: markerScore.assignment_id,
        criterion_id: markerScore.criterion_id,
        marker_id: markerScore.marker_id,
        score: parseFloat(markerScore.score),
        comment: markerScore.comment,
        submitted_at: markerScore.submitted_at,
        finalized: markerScore.finalized
      },
      matched_grade_level: gradeLevel
    });

  } catch (error) {
    console.error('❌ Failed to set marker score:', error);
    res.status(500).json({
      error: 'Failed to set marker score',
      details: error.message
    });
  }
});

/**
 * Get all baseline scores for assignment
 * GET /api/uploads/scoring/baseline/:assignment_id
 */
router.get('/scoring/baseline/:assignment_id', async (req, res) => {
  try {
    const { assignment_id } = req.params;

    const result = await db.query(
      `SELECT bs.*, rc.title as criterion_title, rc.max_score as criterion_max_score,
              cgl.level_name, cgl.min_score as level_min_score, cgl.max_score as level_max_score,
              cgl.description as level_description
       FROM baseline_score bs
       JOIN rubric_criterion rc ON bs.criterion_id = rc.criterion_id
       LEFT JOIN criterion_grade_level cgl ON rc.criterion_id = cgl.criterion_id
         AND bs.score >= cgl.min_score AND bs.score <= cgl.max_score
       WHERE bs.assignment_id = $1
       ORDER BY rc.seq_no`,
      [assignment_id]
    );

    console.log(`✅ Baseline score set successfully: assignment_id=${assignment_id}, count=${result.rows.length}`);

    res.json({
      assignment_id: parseInt(assignment_id),
      baseline_scores: result.rows.map(row => ({
        baseline_id: row.baseline_id,
        criterion_id: row.criterion_id,
        criterion_title: row.criterion_title,
        criterion_max_score: parseFloat(row.criterion_max_score),
        score: parseFloat(row.score),
        comment: row.comment,
        finalized: row.finalized || false, // Add finalized field
        matched_level: row.level_name ? {
          level_name: row.level_name,
          min_score: parseFloat(row.level_min_score),
          max_score: parseFloat(row.level_max_score),
          description: row.level_description
        } : null
      }))
    });

  } catch (error) {
    console.error('❌ Failed to get baseline scores:', error);
    res.status(500).json({
      error: 'Failed to get baseline scores',
      details: error.message
    });
  }
});

/**
 * Get assignment marker scores
 * GET /api/uploads/scoring/marker/:assignment_id/:marker_id
 */
router.get('/scoring/marker/:assignment_id/:marker_id', async (req, res) => {
  try {
    const { assignment_id, marker_id } = req.params;

    const result = await db.query(
      `SELECT ms.*, rc.title as criterion_title, rc.max_score as criterion_max_score,
              cgl.level_name, cgl.min_score as level_min_score, cgl.max_score as level_max_score, 
              cgl.description as level_description, au.name as marker_name
       FROM marker_score ms
       JOIN rubric_criterion rc ON ms.criterion_id = rc.criterion_id
       JOIN app_user au ON ms.marker_id = au.user_id
       LEFT JOIN criterion_grade_level cgl ON rc.criterion_id = cgl.criterion_id 
         AND ms.score >= cgl.min_score AND ms.score <= cgl.max_score
       WHERE ms.assignment_id = $1 AND ms.marker_id = $2
       ORDER BY rc.seq_no`,
      [assignment_id, marker_id]
    );

    console.log(`✅ Marker score retrieved successfully: assignment_id=${assignment_id}, marker_id=${marker_id}, count=${result.rows.length}`);

    res.json({
      assignment_id: parseInt(assignment_id),
      marker_id: parseInt(marker_id),
      marker_name: result.rows.length > 0 ? result.rows[0].marker_name : null,
      marker_scores: result.rows.map(row => ({
        marker_score_id: row.marker_score_id,
        criterion_id: row.criterion_id,
        criterion_title: row.criterion_title,
        criterion_max_score: parseFloat(row.criterion_max_score),
        score: parseFloat(row.score),
        comment: row.comment,
        submitted_at: row.submitted_at,
        finalized: row.finalized,
        matched_level: row.level_name ? {
          level_name: row.level_name,
          min_score: parseFloat(row.level_min_score),
          max_score: parseFloat(row.level_max_score),
          description: row.level_description
        } : null
      }))
    });

  } catch (error) {
    console.error('❌ Failed to get marker scores:', error);
    res.status(500).json({
      error: 'Failed to get marker scores',
      details: error.message
    });
  }
});

// Get assignment status: GET /api/uploads/assignment/:assignment_id/status
router.get('/assignment/:assignment_id/status', async (req, res) => {
  try {
    const { assignment_id } = req.params;
    const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || 'Australia/Melbourne';

    const result = await db.query(
      `SELECT 
         assignment_id, is_published, name, round, version, project_id, due_at, created_at,
         to_char(due_at, 'YYYY-MM-DD"T"HH24:MI:SS') as due_at_local_iso,
         to_char(due_at, 'Dy, Mon DD, YYYY, HH24:MI') as due_at_pretty
       FROM assignment WHERE assignment_id = $1`,
      [assignment_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const row = result.rows[0];
    return res.json({
      assignment: {
        assignment_id: parseInt(row.assignment_id),
        name: row.name,
        round: row.round,
        version: row.version,
        project_id: row.project_id,
        due_at: row.due_at,
        due_at_local_iso: row.due_at_local_iso,
        due_at_pretty: row.due_at_pretty,
        created_at: row.created_at,
        is_published: row.is_published
      }
    });
  } catch (error) {
    console.error('❌ Failed to get assignment status:', error);
    return res.status(500).json({ error: 'Failed to get assignment status', details: error.message });
  }
});

const { requireCoordinator } = require('../middleware/roleAuth');
const authenticate = require('../middleware/auth');

// Update assignment due date: PUT /api/uploads/assignment/:assignment_id/due
router.put('/assignment/:assignment_id/due', authenticate, requireCoordinator, async (req, res) => {
  try {
    const { assignment_id } = req.params;
    const { due_at } = req.body || {};

    if (!due_at) {
      return res.status(400).json({ error: 'Missing due_at' });
    }

    // Parse to a timestamp string acceptable by Postgres timestamp without time zone
    // Expect ISO string or datetime-local string from browser
    const parsed = new Date(due_at);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Invalid due_at format' });
    }

    // 1) Server-side rule: if original due date already passed, reject change
    const originalDueRes = await db.query(
      'SELECT due_at, (due_at < NOW()) AS is_past FROM assignment WHERE assignment_id = $1',
      [assignment_id]
    );
    if (originalDueRes.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    if (originalDueRes.rows[0].is_past === true) {
      return res.status(400).json({
        error: 'Cannot modify due date',
        message: 'Original due date has already passed and cannot be changed.'
      });
    }

    // Format as 'YYYY-MM-DD HH:MM:SS'
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${parsed.getFullYear()}-${pad(parsed.getMonth()+1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;

    const result = await db.query(
      `UPDATE assignment SET due_at = $1 WHERE assignment_id = $2 
       RETURNING assignment_id, due_at,
         to_char(due_at, 'YYYY-MM-DD"T"HH24:MI:SS') as due_at_local_iso,
         to_char(due_at, 'Dy, Mon DD, YYYY, HH24:MI') as due_at_pretty`,
      [ts, assignment_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    console.log(`✅ Updated due_at for assignment ${assignment_id} -> ${ts}`);
    return res.json({
      success: true,
      assignment: {
        assignment_id: parseInt(result.rows[0].assignment_id),
        due_at: result.rows[0].due_at,
        due_at_local_iso: result.rows[0].due_at_local_iso,
        due_at_pretty: result.rows[0].due_at_pretty
      }
    });
  } catch (error) {
    console.error('❌ Failed to update assignment due date:', error);
    return res.status(500).json({ error: 'Failed to update assignment due date', details: error.message });
  }
});

/**
 * Coordinator only - list active markers who have NOT submitted marks for the assignment
 * Definition of "submitted": has at least one finalized marker_score row for this assignment
 * GET /api/uploads/assignment/:assignment_id/pending-markers
 */
router.get('/assignment/:assignment_id/pending-markers', authenticate, requireCoordinator, async (req, res) => {
  try {
    const { assignment_id } = req.params;
    console.log(`[pending-markers] assignment_id=${assignment_id}, userId=${req.user?.id}`);

    // Verify assignment and get project to resolve rubric criteria count (optional info)
    const a = await db.query('SELECT assignment_id, project_id FROM assignment WHERE assignment_id = $1', [assignment_id]);
    console.log('[pending-markers] assignment query rows:', a.rows.length);
    if (a.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    const projectId = a.rows[0].project_id;
    console.log('[pending-markers] projectId=', projectId);

    // Get criteria count from latest rubric (for reference)
    const crit = await db.query(
      `SELECT COUNT(*) AS criteria_count
       FROM rubric_criterion rc
       JOIN rubric r ON rc.rubric_id = r.rubric_id
       WHERE r.project_id = $1
         AND r.version = (SELECT MAX(version) FROM rubric WHERE project_id = $1)`,
      [projectId]
    );
    console.log('[pending-markers] criteria_count rows:', crit.rows);
    const criteriaCount = parseInt(crit.rows[0]?.criteria_count || '0', 10);

    // Aggregate marker submission status for this assignment
    const result = await db.query(
      `WITH ms AS (
         SELECT marker_id,
                COUNT(*) FILTER (WHERE finalized = true) AS finalized_count,
                COUNT(*) AS total_count
         FROM marker_score
         WHERE assignment_id = $1
         GROUP BY marker_id
       )
       SELECT u.user_id       AS marker_id,
              u.name          AS marker_name,
              u.email         AS marker_email,
              COALESCE(ms.total_count, 0)     AS submitted_count,
              COALESCE(ms.finalized_count, 0) AS finalized_count
       FROM app_user u
       LEFT JOIN ms ON ms.marker_id = u.user_id
       WHERE u.role = 'MARKER' AND u.is_active = true
         AND COALESCE(ms.finalized_count, 0) = 0
       ORDER BY u.name ASC`,
      [assignment_id]
    );
    console.log('[pending-markers] result count:', result.rows.length);

    return res.json({
      assignment_id: parseInt(assignment_id),
      criteria_count: criteriaCount,
      pending_markers: result.rows.map(r => ({
        marker_id: parseInt(r.marker_id),
        name: r.marker_name,
        email: r.marker_email,
        submitted_count: parseInt(r.submitted_count || 0, 10),
        finalized_count: parseInt(r.finalized_count || 0, 10)
      }))
    });

  } catch (error) {
    console.error('❌ Failed to list pending markers:', error);
    return res.status(500).json({ error: 'Failed to list pending markers', details: error.message });
  }
});

// Restore and enhance: manually update assignment publish status
// PUT /api/uploads/assignment/:assignment_id/publish
router.put('/assignment/:assignment_id/publish', async (req, res) => {
  try {
    const { assignment_id } = req.params;
    const { is_published } = req.body;

    if (typeof is_published !== 'boolean') {
      return res.status(400).json({ error: 'is_published must be a boolean' });
    }

    // Get assignment and its project
    const assignmentResult = await db.query(
      'SELECT assignment_id, project_id, is_published, round FROM assignment WHERE assignment_id = $1',
      [assignment_id]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const projectId = assignmentResult.rows[0].project_id;
    const currentRound = parseInt(assignmentResult.rows[0].round);

    // If publishing, validate project has at least rubric and at least one assignment
    if (is_published === true) {
      const rubricExists = await db.query(
        'SELECT 1 FROM rubric WHERE project_id = $1 LIMIT 1',
        [projectId]
      );

      const assignmentExists = await db.query(
        'SELECT 1 FROM assignment WHERE project_id = $1 LIMIT 1',
        [projectId]
      );

      if (rubricExists.rows.length === 0 || assignmentExists.rows.length === 0) {
        return res.status(400).json({
          error: 'Cannot publish assignment',
          details: {
            has_rubric: rubricExists.rows.length > 0,
            has_assignment: assignmentExists.rows.length > 0,
            requirements: 'Project must have at least one rubric and one assignment before publishing an assignment'
          }
        });
      }
    }

    // Additional restriction: before publishing round=2, require round=1 latest version is published
    if (currentRound === 2) {
    const latestRound1 = await db.query(
      `SELECT is_published
       FROM assignment
       WHERE project_id = $1 AND round = 1
       ORDER BY version DESC
       LIMIT 1`,
      [projectId]
    );

    if (latestRound1.rows.length === 0) {
      return res.status(400).json({
        error: 'Publish failed',
        message: 'Assignment 1 latest version not found, please submit Assignment 1 before trying to publish Assignment 2'
      });
    }

    if (latestRound1.rows[0].is_published !== true) {
      return res.status(400).json({
        error: 'Publish failed',
        message: 'Please publish Assignment 1 first'
      });
    }
    }

    // Update assignment publication status
    const updateResult = await db.query(
      'UPDATE assignment SET is_published = $1 WHERE assignment_id = $2 RETURNING assignment_id, is_published, project_id',
      [is_published, assignment_id]
    );

    // If publish successful and project is still draft, activate project
    let projectStatus;
    if (is_published === true) {
      const statusResult = await db.query('SELECT status FROM project WHERE project_id = $1', [projectId]);
      const currentStatus = statusResult.rows[0]?.status || 'draft';
      if (currentStatus === 'draft') {
        await db.query('UPDATE project SET status = \'active\' WHERE project_id = $1', [projectId]);
        projectStatus = 'active';
      } else {
        projectStatus = currentStatus;
      }
    }

    console.log(`📝 Assignment publication status updated: assignment_id=${assignment_id}, is_published=${is_published}`);

    // If published successfully, send notification emails to all active markers
    if (is_published === true) {
      try {
        // Get assignment details including project name
        const assignmentDetailsResult = await db.query(
          `SELECT a.name as assignment_name, a.due_at, a.round, p.name as project_name
           FROM assignment a
           JOIN project p ON a.project_id = p.project_id
           WHERE a.assignment_id = $1`,
          [assignment_id]
        );

        if (assignmentDetailsResult.rows.length > 0) {
          const assignmentDetails = assignmentDetailsResult.rows[0];
          const assignmentName = assignmentDetails.assignment_name || `Assignment ${assignmentDetails.round}`;
          const projectName = assignmentDetails.project_name;
          const dueAt = assignmentDetails.due_at 
            ? new Date(assignmentDetails.due_at).toLocaleString('en-AU', { 
                timeZone: 'Australia/Melbourne',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : null;

          // Get all active markers and coordinators
          const recipientsResult = await db.query(
            `SELECT user_id, name, email, role
             FROM app_user
             WHERE (role = 'MARKER' OR role = 'COORDINATOR') AND is_active = true
             ORDER BY name ASC`
          );

          console.log(`📧 Sending assignment notifications to ${recipientsResult.rows.length} user(s) (markers + coordinators)`);

          // Send different emails based on user role (don't wait for completion to avoid blocking the response)
          const EmailService = require('../services/emailService');
          const emailPromises = recipientsResult.rows.map(user => {
            if (user.role === 'MARKER') {
              // Send new assignment notification to markers
              return EmailService.sendNewAssignmentNotification(
                user.email,
                user.name,
                assignmentName,
                projectName,
                dueAt
              ).catch(err => {
                console.error(`❌ Failed to send new assignment notification to marker ${user.email}:`, err.message);
              });
            } else if (user.role === 'COORDINATOR') {
              // Send published success notification to coordinators
              return EmailService.sendAssignmentPublishedNotification(
                user.email,
                user.name,
                assignmentName,
                projectName,
                dueAt
              ).catch(err => {
                console.error(`❌ Failed to send published notification to coordinator ${user.email}:`, err.message);
              });
            }
          });

          // Send all emails asynchronously (fire and forget)
          Promise.all(emailPromises).then(() => {
            console.log(`✅ Assignment notification emails sent successfully (markers: new assignment, coordinators: published success)`);
          }).catch(err => {
            console.error(`⚠️ Some notification emails failed:`, err);
          });
        }
      } catch (emailError) {
        // Log error but don't fail the publish operation
        console.error('⚠️ Error sending notification emails:', emailError);
      }
    }

    return res.json({
      message: 'Assignment publish status updated',
      assignment: {
        assignment_id: parseInt(updateResult.rows[0].assignment_id),
        is_published: updateResult.rows[0].is_published
      },
      ...(projectStatus && { project_status: projectStatus })
    });
  } catch (error) {
    console.error('❌ Failed to update assignment publication status:', error);
    return res.status(500).json({ error: 'Failed to update assignment publish status', details: error.message });
  }
});

/**
 * Coordinator exclusive - batch set/update baseline scores
 * POST /api/uploads/scoring/baseline/batch
 */
router.post('/scoring/baseline/batch', async (req, res) => {
  try {
    const { assignment_id, scores } = req.body;

    // Validate required fields
    if (!assignment_id || !scores || !Array.isArray(scores) || scores.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: assignment_id, scores (array)'
      });
    }

    // Verify assignment exists and is the latest version
    const assignmentCheck = await db.query(
      `SELECT a.assignment_id, a.project_id, a.version, a.round
       FROM assignment a
       WHERE a.assignment_id = $1
         AND a.version = (
           SELECT MAX(version) 
           FROM assignment 
           WHERE project_id = a.project_id AND round = a.round
         )`,
      [assignment_id]
    );

    if (assignmentCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Assignment not found or not latest version',
        message: 'Only the latest version of assignment can be scored'
      });
    }

    const projectId = assignmentCheck.rows[0].project_id;

    const results = [];
    const errors = [];

    // Start transaction
    const client = await db.connect();
    await client.query('BEGIN');

    try {
      for (let i = 0; i < scores.length; i++) {
        const { criterion_id, score, comment } = scores[i];

        // Validate individual score item
        if (!criterion_id || score === undefined) {
          errors.push({
            index: i,
            error: 'Missing criterion_id or score',
            data: scores[i]
          });
          continue;
        }

        const scoreValue = parseFloat(score);
        if (isNaN(scoreValue) || scoreValue < 0) {
          errors.push({
            index: i,
            error: 'Score must be a non-negative number',
            data: scores[i]
          });
          continue;
        }

        // Verify criterion exists and belongs to the latest rubric version of this project
        const criterionCheck = await client.query(
          `SELECT rc.criterion_id, rc.max_score, r.rubric_id, r.version
           FROM rubric_criterion rc
           JOIN rubric r ON rc.rubric_id = r.rubric_id
           WHERE rc.criterion_id = $1 
             AND r.project_id = $2
             AND r.version = (
               SELECT MAX(version) 
               FROM rubric 
               WHERE project_id = $2
             )`,
          [criterion_id, projectId]
        );

        if (criterionCheck.rows.length === 0) {
          errors.push({
            index: i,
            error: 'Criterion not found or not in latest rubric version',
            data: scores[i]
          });
          continue;
        }

        const maxScore = parseFloat(criterionCheck.rows[0].max_score);
        if (scoreValue > maxScore) {
          errors.push({
            index: i,
            error: `Score (${scoreValue}) exceeds criterion maximum (${maxScore})`,
            data: scores[i]
          });
          continue;
        }

        // Find matching grade level range
        const gradeLevel = await findGradeLevelByScore(criterion_id, scoreValue);
        if (!gradeLevel) {
          errors.push({
            index: i,
            error: `Score ${scoreValue} does not match any grade level for this criterion`,
            data: scores[i]
          });
          continue;
        }

        // Insert or update baseline_score
        const upsertResult = await client.query(
          `INSERT INTO baseline_score (assignment_id, criterion_id, score, comment)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (assignment_id, criterion_id)
           DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment
           RETURNING *`,
          [assignment_id, criterion_id, scoreValue, comment || null]
        );

        const baselineScore = upsertResult.rows[0];

        results.push({
          index: i,
          success: true,
          baseline_score: {
            baseline_id: baselineScore.baseline_id,
            assignment_id: baselineScore.assignment_id,
            criterion_id: baselineScore.criterion_id,
            score: parseFloat(baselineScore.score),
            comment: baselineScore.comment
          },
          matched_grade_level: gradeLevel
        });
      }

      await client.query('COMMIT');

      console.log(`✅ Batch baseline score setting completed: assignment_id=${assignment_id}, successful=${results.length}, failed=${errors.length}`);

      res.json({
        message: 'Batch baseline scores processed',
        assignment_id: parseInt(assignment_id),
        summary: {
          total: scores.length,
          successful: results.length,
          failed: errors.length
        },
        results: results,
        errors: errors
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Failed to batch set baseline scores:', error);
    res.status(500).json({
      error: 'Failed to set batch baseline scores',
      details: error.message
    });
  }
});

/**
 * Coordinator exclusive - batch confirm baseline scores
 * POST /api/uploads/scoring/baseline/submit
 */
router.post('/scoring/baseline/submit', async (req, res) => {
    try {
        // 1. Get request parameters - now accepts criterion_ids array
        const { assignment_id, criterion_ids } = req.body;

        // 2. Parameter validation
        if (!assignment_id || !criterion_ids || !Array.isArray(criterion_ids) || criterion_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'assignment_id and criterion_ids array are required parameters'
            });
        }

        // 3. Build IN query placeholders ($1, $2, $3...)
        const placeholders = criterion_ids.map((_, index) => `$${index + 2}`).join(',');

        // 4. Batch update database
        const query = `
            UPDATE baseline_score
            SET finalized = true
            WHERE assignment_id = $1
            AND criterion_id IN (${placeholders})
            RETURNING *
        `;

        const params = [assignment_id, ...criterion_ids];
        const result = await db.query(query, params);

        // 5. Return success response
        res.json({
            success: true,
            message: `Successfully confirmed ${result.rowCount} baseline scores`,
            data: {
                updated_count: result.rowCount,
                updated_records: result.rows
            }
        });

    } catch (error) {
        console.error('Error confirming baseline scores in batch:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});


/**
 * Marker exclusive - batch set/update marker scores
 * POST /api/uploads/scoring/marker/batch
 */
router.post('/scoring/marker/batch', async (req, res) => {
  try {
    const { assignment_id, marker_id, scores } = req.body;

    // Validate required fields
    if (!assignment_id || !marker_id || !scores || !Array.isArray(scores) || scores.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: assignment_id, marker_id, scores (array)'
      });
    }

    // Verify assignment exists and is the latest version
    const assignmentCheck = await db.query(
      `SELECT a.assignment_id, a.project_id, a.version, a.round
       FROM assignment a
       WHERE a.assignment_id = $1
         AND a.version = (
           SELECT MAX(version) 
           FROM assignment 
           WHERE project_id = a.project_id AND round = a.round
         )`,
      [assignment_id]
    );

    if (assignmentCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Assignment not found or not latest version',
        message: 'Only the latest version of assignment can be scored'
      });
    }

    const projectId = assignmentCheck.rows[0].project_id;

    const markerCheck = await db.query(
      'SELECT user_id FROM app_user WHERE user_id = $1',
      [marker_id]
    );

    if (markerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Marker not found' });
    }

    const results = [];
    const errors = [];

    // Start transaction
    const client = await db.connect();
    await client.query('BEGIN');

    try {
      for (let i = 0; i < scores.length; i++) {
        const { criterion_id, score, comment } = scores[i];

        // Validate individual score item
        if (!criterion_id || score === undefined) {
          errors.push({
            index: i,
            error: 'Missing criterion_id or score',
            data: scores[i]
          });
          continue;
        }

        const scoreValue = parseFloat(score);
        if (isNaN(scoreValue) || scoreValue < 0) {
          errors.push({
            index: i,
            error: 'Score must be a non-negative number',
            data: scores[i]
          });
          continue;
        }

        // Verify criterion exists and belongs to the latest rubric version of this project
        const criterionCheck = await client.query(
          `SELECT rc.criterion_id, rc.max_score, r.rubric_id, r.version
           FROM rubric_criterion rc
           JOIN rubric r ON rc.rubric_id = r.rubric_id
           WHERE rc.criterion_id = $1 
             AND r.project_id = $2
             AND r.version = (
               SELECT MAX(version) 
               FROM rubric 
               WHERE project_id = $2
             )`,
          [criterion_id, projectId]
        );

        if (criterionCheck.rows.length === 0) {
          errors.push({
            index: i,
            error: 'Criterion not found or not in latest rubric version',
            data: scores[i]
          });
          continue;
        }

        const maxScore = parseFloat(criterionCheck.rows[0].max_score);
        if (scoreValue > maxScore) {
          errors.push({
            index: i,
            error: `Score (${scoreValue}) exceeds criterion maximum (${maxScore})`,
            data: scores[i]
          });
          continue;
        }

        // Find matching grade level range
        const gradeLevel = await findGradeLevelByScore(criterion_id, scoreValue);
        if (!gradeLevel) {
          errors.push({
            index: i,
            error: `Score ${scoreValue} does not match any grade level for this criterion`,
            data: scores[i]
          });
          continue;
        }

        // Insert or update marker_score
        const upsertResult = await client.query(
          `INSERT INTO marker_score (assignment_id, criterion_id, marker_id, score, comment, submitted_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (assignment_id, criterion_id, marker_id)
           DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment, submitted_at = NOW()
           RETURNING *`,
          [assignment_id, criterion_id, marker_id, scoreValue, comment || null]
        );

        const markerScore = upsertResult.rows[0];

        results.push({
          index: i,
          success: true,
          marker_score: {
            marker_score_id: markerScore.marker_score_id,
            assignment_id: markerScore.assignment_id,
            criterion_id: markerScore.criterion_id,
            marker_id: markerScore.marker_id,
            score: parseFloat(markerScore.score),
            comment: markerScore.comment,
            submitted_at: markerScore.submitted_at,
            finalized: markerScore.finalized
          },
          matched_grade_level: gradeLevel
        });
      }

      await client.query('COMMIT');

      console.log(`✅ Batch marker score setting completed: assignment_id=${assignment_id}, marker_id=${marker_id}, success=${results.length}, failed=${errors.length}`);

      res.json({
        message: 'Batch marker scores processed',
        assignment_id: parseInt(assignment_id),
        marker_id: parseInt(marker_id),
        summary: {
          total: scores.length,
          successful: results.length,
          failed: errors.length
        },
        results: results,
        errors: errors
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Failed to batch set marker scores:', error);
    res.status(500).json({
      error: 'Failed to set batch marker scores',
      details: error.message
    });
  }
});

/**
 * Marker exclusive - batch confirm marker scores
 * POST /api/uploads/scoring/marker/submit
 */
router.post('/scoring/marker/submit', async (req, res) => {
    try {
        // 1. Get request parameters
        const { assignment_id, marker_id, criterion_ids } = req.body;

        // 2. Parameter validation
        if (!assignment_id || !marker_id || !criterion_ids || !Array.isArray(criterion_ids) || criterion_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'assignment_id, marker_id and criterion_ids array are required parameters'
            });
        }

        // 3. Build IN query placeholders
        const placeholders = criterion_ids.map((_, index) => `$${index + 3}`).join(',');

        // 4. Batch update database
        const query = `
            UPDATE marker_score
            SET finalized = true
            WHERE assignment_id = $1
            AND marker_id = $2
            AND criterion_id IN (${placeholders})
            RETURNING *
        `;

        const params = [assignment_id, marker_id, ...criterion_ids];
        const result = await db.query(query, params);

        // 5. Return success response
        res.json({
            success: true,
            message: `Successfully confirmed ${result.rowCount} marker scores`,
            data: {
                updated_count: result.rowCount,
                updated_records: result.rows
            }
        });

    } catch (error) {
        console.error('Error confirming marker scores in batch:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});


/**
 * Generate Assignment Moderation comparison report
 * GET /api/uploads/assignments/:assignment_id/moderation-report
 */
router.get('/assignments/:assignment_id/moderation-report', async (req, res) => {
  try {
    const { assignment_id } = req.params;

    // Verify assignment exists and is the latest version
    const assignmentCheck = await db.query(
      `SELECT a.assignment_id, a.name, a.project_id, a.version, a.round
       FROM assignment a
       WHERE a.assignment_id = $1
         AND a.version = (
           SELECT MAX(version) 
           FROM assignment 
           WHERE project_id = a.project_id AND round = a.round
         )`,
      [assignment_id]
    );

    if (assignmentCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Assignment not found or not latest version',
        message: 'Moderation report can only be generated for the latest version of assignment'
      });
    }

    const assignment = assignmentCheck.rows[0];

    // Get complete data for baseline scores and marker scores
    const mainQuery = `
      SELECT 
        bs.criterion_id,
        rc.title as criterion_title,
        rc.max_score as criterion_max_score,
        rc.seq_no,
        bs.score as baseline_score,
        bs.comment as baseline_comment,
        ms.marker_id,
        u.name as marker_name,
        ms.score as marker_score,
        ms.comment as marker_comment
      FROM baseline_score bs
      JOIN rubric_criterion rc ON bs.criterion_id = rc.criterion_id  
      LEFT JOIN marker_score ms ON bs.assignment_id = ms.assignment_id 
        AND bs.criterion_id = ms.criterion_id
      LEFT JOIN app_user u ON ms.marker_id = u.user_id
      WHERE bs.assignment_id = $1
      ORDER BY rc.seq_no, u.name
    `;

    const result = await db.query(mainQuery, [assignment_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'No baseline scores found for this assignment',
        message: 'Please ensure baseline scores are set before generating moderation report'
      });
    }

    // Organize data structure
    const criteriaMap = new Map();
    const markersMap = new Map();

    result.rows.forEach(row => {
      const criterionId = row.criterion_id;
      const markerId = row.marker_id;

      // Initialize criterion data
      if (!criteriaMap.has(criterionId)) {
        const baselineScore = parseFloat(row.baseline_score);
        const maxScore = parseFloat(row.criterion_max_score);
        const baselinePercentage = Math.round((baselineScore / maxScore) * 100 * 100) / 100;
        
        criteriaMap.set(criterionId, {
          criterion_id: criterionId,
          title: row.criterion_title,
          max_score: maxScore,
          seq_no: row.seq_no,
          baseline_score: baselineScore,
          baseline_comment: row.baseline_comment || null,
          baseline_percentage: baselinePercentage, // Current score/maximum score percentage
          range_lower: Math.round(baselineScore * 0.95 * 100) / 100, // ±5%
          range_upper: Math.round(baselineScore * 1.05 * 100) / 100,
          marker_scores: []
        });
      }

      // Add marker score (if exists)
      if (markerId && row.marker_score !== null) {
        const markerScore = parseFloat(row.marker_score);
        const criterion = criteriaMap.get(criterionId);
        
        const withinRange = markerScore >= criterion.range_lower && markerScore <= criterion.range_upper;
        
        // Calculate marker percentage and percentage difference from baseline
        const markerPercentage = Math.round((markerScore / criterion.max_score) * 100 * 100) / 100;
        const percentageDifference = Math.round((markerPercentage - criterion.baseline_percentage) * 100) / 100;
        
        criterion.marker_scores.push({
          marker_id: markerId,
          marker_name: row.marker_name,
          score: markerScore,
          comment: row.marker_comment || null,
          percentage: markerPercentage, // Current score/maximum score percentage
          percentage_difference: percentageDifference, // Percentage difference from baseline, can be positive or negative
          within_range: withinRange
        });

        // Initialize marker total score tracking
        if (!markersMap.has(markerId)) {
          markersMap.set(markerId, {
            marker_id: markerId,
            marker_name: row.marker_name,
            total: 0,
            criteria_count: 0
          });
        }

        // Accumulate marker total score
        const markerTotal = markersMap.get(markerId);
        markerTotal.total += markerScore;
        markerTotal.criteria_count += 1;
      }
    });

    // Convert to array and sort
    const criteria = Array.from(criteriaMap.values()).sort((a, b) => a.seq_no - b.seq_no);

    // Calculate baseline total and maximum total score
    const baselineTotal = criteria.reduce((sum, criterion) => sum + criterion.baseline_score, 0);
    const maxTotalScore = criteria.reduce((sum, criterion) => sum + criterion.max_score, 0);
    const baselineTotalRounded = Math.round(baselineTotal * 100) / 100;
    const baselineTotalPercentage = Math.round((baselineTotal / maxTotalScore) * 100 * 100) / 100;

    // Calculate total score range (±5% for red, ±2.5% for warning threshold)
    const totalRangeLower = Math.round(baselineTotalRounded * 0.95 * 100) / 100;
    const totalRangeUpper = Math.round(baselineTotalRounded * 1.05 * 100) / 100;
    const totalWarningLower = Math.round(baselineTotalRounded * 0.975 * 100) / 100;
    const totalWarningUpper = Math.round(baselineTotalRounded * 1.025 * 100) / 100;

    // Calculate marker total scores and determine if within range
    const markerTotals = Array.from(markersMap.values()).map(marker => {
      const markerTotal = Math.round(marker.total * 100) / 100;
      const withinRange = markerTotal >= totalRangeLower && markerTotal <= totalRangeUpper;
      const withinWarningRange = markerTotal >= totalWarningLower && markerTotal <= totalWarningUpper;
      const difference = Math.abs(markerTotal - baselineTotalRounded);
      
      // Calculate total percentage and difference from baseline percentage
      const markerTotalPercentage = Math.round((markerTotal / maxTotalScore) * 100 * 100) / 100;
      const totalPercentageDifference = Math.round((markerTotalPercentage - baselineTotalPercentage) * 100) / 100;

      return {
        marker_id: marker.marker_id,
        marker_name: marker.marker_name,
        total: markerTotal,
        percentage: markerTotalPercentage, // Total score percentage
        percentage_difference: totalPercentageDifference, // Percentage difference from baseline total score, can be positive or negative
        within_range: withinRange,
        within_warning_range: withinWarningRange,
        difference: Math.round(difference * 100) / 100
      };
    });

    // Sort by difference size (larger differences first)
    markerTotals.sort((a, b) => b.difference - a.difference);

    // Build response
    const response = {
      assignment: {
        assignment_id: parseInt(assignment_id),
        name: assignment.name
      },
      criteria: criteria,
      totals: {
        baseline_total: baselineTotalRounded,
        baseline_percentage: baselineTotalPercentage, // baseline total score percentage
        max_total_score: maxTotalScore, // maximum total score
        range_lower: totalRangeLower, // ±5% range for red alert
        range_upper: totalRangeUpper,
        warning_lower: totalWarningLower, // ±2.5% range for yellow warning
        warning_upper: totalWarningUpper,
        marker_totals: markerTotals
      },
      summary: {
        total_criteria: criteria.length,
        total_markers: markerTotals.length,
        markers_within_range: markerTotals.filter(m => m.within_range).length,
        markers_outside_range: markerTotals.filter(m => !m.within_range).length
      }
    };

    console.log(`✅ Moderation report generated successfully: assignment_id=${assignment_id}, criteria=${criteria.length}, markers=${markerTotals.length}`);

    res.json(response);

  } catch (error) {
    console.error('❌ Failed to generate moderation report:', error);
    res.status(500).json({
      error: 'Failed to generate moderation report',
      details: error.message
    });
  }
});

/**
 * Debug API - Check assignment and rubric relationship
 * GET /api/uploads/debug/assignment/:assignment_id/rubric-info
 */
router.get('/debug/assignment/:assignment_id/rubric-info', async (req, res) => {
  try {
    const { assignment_id } = req.params;

    // Get assignment information
    const assignmentResult = await db.query(
      'SELECT assignment_id, name, project_id FROM assignment WHERE assignment_id = $1',
      [assignment_id]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const assignment = assignmentResult.rows[0];
    const projectId = assignment.project_id;

    // Get all rubric versions for this project
    const rubricsResult = await db.query(
      'SELECT rubric_id, version, uploaded_by FROM rubric WHERE project_id = $1 ORDER BY version DESC',
      [projectId]
    );

    // Get latest version criteria
    const latestVersionResult = await db.query(
      'SELECT MAX(version) as latest_version FROM rubric WHERE project_id = $1',
      [projectId]
    );

    const latestVersion = latestVersionResult.rows[0]?.latest_version;

    let latestCriteria = [];
    if (latestVersion) {
      const criteriaResult = await db.query(
        `SELECT rc.criterion_id, rc.title, rc.max_score, rc.seq_no, r.rubric_id, r.version
         FROM rubric_criterion rc
         JOIN rubric r ON rc.rubric_id = r.rubric_id
         WHERE r.project_id = $1 AND r.version = $2
         ORDER BY rc.seq_no`,
        [projectId, latestVersion]
      );
      latestCriteria = criteriaResult.rows;
    }

    // Check existing baseline scores
    const baselineResult = await db.query(
      `SELECT bs.*, rc.title as criterion_title
       FROM baseline_score bs
       JOIN rubric_criterion rc ON bs.criterion_id = rc.criterion_id
       WHERE bs.assignment_id = $1`,
      [assignment_id]
    );

    res.json({
      assignment: assignment,
      project_id: projectId,
      rubric_versions: rubricsResult.rows,
      latest_version: latestVersion,
      latest_criteria: latestCriteria,
      existing_baseline_scores: baselineResult.rows,
      debug_info: {
        total_rubric_versions: rubricsResult.rows.length,
        total_latest_criteria: latestCriteria.length,
        total_baseline_scores: baselineResult.rows.length
      }
    });

  } catch (error) {
    console.error('❌ Failed to debug assignment rubric info:', error);
    res.status(500).json({
      error: 'Failed to get assignment rubric debug info',
      details: error.message
    });
  }
});

/**
 * Debug API - Find which project and rubric a criterion belongs to
 * GET /api/uploads/debug/criterion/:criterion_id/info
 */
router.get('/debug/criterion/:criterion_id/info', async (req, res) => {
  try {
    const { criterion_id } = req.params;

    const result = await db.query(
      `SELECT rc.criterion_id, rc.title, rc.max_score, rc.seq_no,
              r.rubric_id, r.version, r.project_id, r.uploaded_by,
              p.name as project_name
       FROM rubric_criterion rc
       JOIN rubric r ON rc.rubric_id = r.rubric_id
       JOIN project p ON r.project_id = p.project_id
       WHERE rc.criterion_id = $1`,
      [criterion_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Criterion not found' });
    }

    const criterion = result.rows[0];

    // Check if it's the latest version
    const latestVersionResult = await db.query(
      'SELECT MAX(version) as latest_version FROM rubric WHERE project_id = $1',
      [criterion.project_id]
    );

    const isLatestVersion = criterion.version === latestVersionResult.rows[0].latest_version;

    res.json({
      criterion: {
        criterion_id: criterion.criterion_id,
        title: criterion.title,
        max_score: parseFloat(criterion.max_score),
        seq_no: criterion.seq_no
      },
      rubric: {
        rubric_id: criterion.rubric_id,
        version: criterion.version,
        is_latest_version: isLatestVersion,
        latest_version: latestVersionResult.rows[0].latest_version
      },
      project: {
        project_id: criterion.project_id,
        name: criterion.project_name
      },
      uploaded_by: criterion.uploaded_by
    });

  } catch (error) {
    console.error('❌ Failed to find criterion info:', error);
    res.status(500).json({
      error: 'Failed to get criterion info',
      details: error.message
    });
  }
});

//==========
// New API: Get latest rubric_id by project_id
// GET /api/project/:project_id/latest-rubric
router.get('/project/:project_id/latest-rubric', async (req, res) => {
  try {
    const { project_id } = req.params;

    console.log(`🔍 Finding latest rubric by project_id: project_id=${project_id}`);

    // Query all rubrics for this project_id, sorted by version in descending order, get the latest one
    const result = await db.query(`
      SELECT rubric_id, project_id, version, created_at
      FROM rubric
      WHERE project_id = $1
      ORDER BY version DESC
      LIMIT 1
    `, [project_id]);

    if (result.rows.length === 0) {
      console.log(`❌ No rubric found for project_id=${project_id}`);
      return res.status(404).json({
        error: 'No rubric found for this project',
        project_id: parseInt(project_id)
      });
    }

    const latestRubric = result.rows[0];
    console.log(`✅ Found latest rubric: rubric_id=${latestRubric.rubric_id}, version=${latestRubric.version}`);

    res.json({
      project_id: parseInt(project_id),
      rubric_id: latestRubric.rubric_id,
      version: latestRubric.version,
      created_at: latestRubric.created_at
    });

  } catch (error) {
    console.error('❌ Failed to get latest rubric:', error);
    res.status(500).json({
      error: 'Failed to get latest rubric',
      details: error.message
    });
  }
});

//Get assignment associated file information - GET /api/uploads/assignment/:assignment_id/files
router.get('/assignment/:assignment_id/files', async (req, res) => {
  try {
    const { assignment_id } = req.params;

    const result = await db.query(
      `SELECT u.upload_id, u.file_name, u.storage_path, u.file_type, u.mime_type, u.created_at
       FROM upload u
       WHERE u.assignment_id = $1
       ORDER BY u.created_at DESC`,
      [assignment_id]
    );

    return res.json({
      assignment_id: parseInt(assignment_id),
      files: result.rows.map(row => ({
        upload_id: row.upload_id,
        file_name: row.file_name,
        file_type: row.file_type,
        mime_type: row.mime_type,
        created_at: row.created_at
      }))
    });
  } catch (error) {
    console.error('❌ Failed to get assignment files:', error);
    return res.status(500).json({ error: 'Failed to get assignment files' });
  }
});

// ============== Rubric Modification APIs ==============

/**
 * Update criterion title
 * PUT /api/uploads/rubric/criterion/:criterion_id/title
 */
router.put('/rubric/criterion/:criterion_id/title', async (req, res) => {
  try {
    const { criterion_id } = req.params;
    const { title } = req.body;
    
    if (!title || title.trim() === '') {
      return res.status(400).json({ 
        error: 'Title is required and cannot be empty' 
      });
    }
    
    console.log(`📝 Updating criterion ${criterion_id} title to: ${title}`);
    
    // Check if criterion exists
    const criterionCheck = await db.query(
      'SELECT criterion_id, title FROM rubric_criterion WHERE criterion_id = $1',
      [criterion_id]
    );
    
    if (criterionCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Criterion not found' 
      });
    }
    
    // Update criterion title
    const result = await db.query(
      'UPDATE rubric_criterion SET title = $1 WHERE criterion_id = $2 RETURNING *',
      [title.trim(), criterion_id]
    );
    
    console.log(`✅ Updated criterion title: ${result.rows[0].title}`);
    
    res.json({
      success: true,
      message: 'Criterion title updated successfully',
      criterion: {
        criterion_id: result.rows[0].criterion_id,
        title: result.rows[0].title,
        seq_no: result.rows[0].seq_no,
        rubric_id: result.rows[0].rubric_id
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to update criterion title:', error);
    res.status(500).json({ 
      error: 'Failed to update criterion title',
      details: error.message 
    });
  }
});

/**
 * Update criterion description
 * PUT /api/uploads/rubric/criterion/:criterion_id/description
 * Automatically parses and updates max_score if found in description
 */
router.put('/rubric/criterion/:criterion_id/description', async (req, res) => {
  try {
    const { criterion_id } = req.params;
    const { description } = req.body;
    
    console.log(`📝 Updating criterion ${criterion_id} description`);
    
    // Check if criterion exists
    const criterionCheck = await db.query(
      'SELECT criterion_id, title, max_score FROM rubric_criterion WHERE criterion_id = $1',
      [criterion_id]
    );
    
    if (criterionCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Criterion not found' 
      });
    }
    
    const currentCriterion = criterionCheck.rows[0];
    
    // Try to parse max score from description (e.g., "总分: 20分", "Total: 20 points")
    const parsedMaxScore = parseMaxScoreFromDescription(description);
    let updateFields = ['description = $1'];
    let updateValues = [description || null];
    let valueIndex = 2;
    
    let scoreUpdateInfo = null;
    
    if (parsedMaxScore !== null) {
      console.log(`🔍 Auto-detected max score in description: ${parsedMaxScore}`);
      
      // Validate score
      if (parsedMaxScore < 0) {
        return res.status(400).json({ 
          error: 'Max score must be non-negative' 
        });
      }
      
      // Automatically add max score update
      updateFields.push(`max_score = $${valueIndex++}`);
      updateValues.push(parsedMaxScore);
      
      scoreUpdateInfo = {
        previous: {
          max_score: parseFloat(currentCriterion.max_score)
        },
        updated: {
          max_score: parsedMaxScore
        }
      };
    }
    
    updateValues.push(criterion_id);
    
    // Update criterion description (and max_score if auto-detected)
    const updateQuery = `
      UPDATE rubric_criterion 
      SET ${updateFields.join(', ')} 
      WHERE criterion_id = $${valueIndex}
      RETURNING *
    `;
    
    const result = await db.query(updateQuery, updateValues);
    const updatedCriterion = result.rows[0];
    
    console.log(`✅ Updated criterion description for: ${updatedCriterion.title}`);
    if (scoreUpdateInfo) {
      console.log(`📊 Auto-updated max score: ${scoreUpdateInfo.previous.max_score} → ${scoreUpdateInfo.updated.max_score}`);
    }
    
    const response = {
      success: true,
      message: 'Criterion description updated successfully',
      criterion: {
        criterion_id: updatedCriterion.criterion_id,
        title: updatedCriterion.title,
        description: updatedCriterion.description,
        max_score: parseFloat(updatedCriterion.max_score),
        seq_no: updatedCriterion.seq_no,
        rubric_id: updatedCriterion.rubric_id
      }
    };
    
    // Add score update information if max score was auto-updated
    if (scoreUpdateInfo) {
      response.message += ' (max score auto-updated from description)';
      response.score_update = scoreUpdateInfo;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Failed to update criterion description:', error);
    res.status(500).json({ 
      error: 'Failed to update criterion description',
      details: error.message 
    });
  }
});

/**
 * Update criterion max score
 * PUT /api/uploads/rubric/criterion/:criterion_id/max-score
 */
router.put('/rubric/criterion/:criterion_id/max-score', async (req, res) => {
  try {
    const { criterion_id } = req.params;
    const { max_score } = req.body;
    
    if (max_score === undefined || max_score === null) {
      return res.status(400).json({ 
        error: 'Max score is required' 
      });
    }
    
    const scoreValue = parseFloat(max_score);
    if (isNaN(scoreValue) || scoreValue < 0) {
      return res.status(400).json({ 
        error: 'Max score must be a valid positive number' 
      });
    }
    
    console.log(`📝 Updating criterion ${criterion_id} max score to: ${scoreValue}`);
    
    // Check if criterion exists
    const criterionCheck = await db.query(
      'SELECT criterion_id, title, max_score FROM rubric_criterion WHERE criterion_id = $1',
      [criterion_id]
    );
    
    if (criterionCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Criterion not found' 
      });
    }
    
    // Update criterion max score
    const result = await db.query(
      'UPDATE rubric_criterion SET max_score = $1 WHERE criterion_id = $2 RETURNING *',
      [scoreValue, criterion_id]
    );
    
    console.log(`✅ Updated criterion max score: ${result.rows[0].title} -> ${result.rows[0].max_score}`);
    
    res.json({
      success: true,
      message: 'Criterion max score updated successfully',
      criterion: {
        criterion_id: result.rows[0].criterion_id,
        title: result.rows[0].title,
        max_score: parseFloat(result.rows[0].max_score),
        seq_no: result.rows[0].seq_no,
        rubric_id: result.rows[0].rubric_id
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to update criterion max score:', error);
    res.status(500).json({ 
      error: 'Failed to update criterion max score',
      details: error.message 
    });
  }
});

/**
 * Update grade level name
 * PUT /api/uploads/rubric/grade-level/:grade_level_id/name
 */
router.put('/rubric/grade-level/:grade_level_id/name', async (req, res) => {
  try {
    const { grade_level_id } = req.params;
    const { level_name } = req.body;
    
    if (!level_name || level_name.trim() === '') {
      return res.status(400).json({ 
        error: 'Level name is required and cannot be empty' 
      });
    }
    
    console.log(`📝 Updating grade level ${grade_level_id} name to: ${level_name}`);
    
    // Check if grade level exists
    const gradeLevelCheck = await db.query(
      'SELECT grade_level_id, level_name, criterion_id FROM criterion_grade_level WHERE grade_level_id = $1',
      [grade_level_id]
    );
    
    if (gradeLevelCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Grade level not found' 
      });
    }
    
    // Update grade level name
    const result = await db.query(
      'UPDATE criterion_grade_level SET level_name = $1 WHERE grade_level_id = $2 RETURNING *',
      [level_name.trim(), grade_level_id]
    );
    
    console.log(`✅ Updated grade level name: ${result.rows[0].level_name}`);
    
    res.json({
      success: true,
      message: 'Grade level name updated successfully',
      grade_level: {
        grade_level_id: result.rows[0].grade_level_id,
        level_name: result.rows[0].level_name,
        criterion_id: result.rows[0].criterion_id,
        seq_no: result.rows[0].seq_no,
        min_score: parseFloat(result.rows[0].min_score),
        max_score: parseFloat(result.rows[0].max_score)
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to update grade level name:', error);
    res.status(500).json({ 
      error: 'Failed to update grade level name',
      details: error.message 
    });
  }
});

/**
 * Parse score range from description text
 * Supports formats like: "优秀 (8-10分)", "Good (5-7 points)", "Level 1 (0-2)"
 */
function parseScoreRangeFromDescription(description) {
  if (!description) return null;
  
  // Match patterns like: (8-10), (5-7分), (0-2 points), (10-15分)
  const scorePatterns = [
    /\((\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*分?\)/i,  // Chinese format: (8-10分)
    /\((\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*points?\)/i,  // English format: (5-7 points)
    /\((\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\)/i  // Simple format: (0-2)
  ];
  
  for (const pattern of scorePatterns) {
    const match = description.match(pattern);
    if (match) {
      const minScore = parseFloat(match[1]);
      const maxScore = parseFloat(match[2]);
      
      if (!isNaN(minScore) && !isNaN(maxScore) && minScore <= maxScore) {
        return { min_score: minScore, max_score: maxScore };
      }
    }
  }
  
  return null;
}

/**
 * Parse max score from criterion description text
 * Supports formats like: "总分: 20分", "Total: 20 points", "Max: 15"
 */
function parseMaxScoreFromDescription(description) {
  if (!description) return null;
  
  // Match patterns like: 总分: 20分, Total: 20 points, Max: 15, 最高分: 25分
  const maxScorePatterns = [
    /total[：:]\s*(\d+(?:\.\d+)?)\s*points?/i,  // English format: Total: 20 points
    /max[：:]\s*(\d+(?:\.\d+)?)/i,  // English format: Max: 15
    /(\d+(?:\.\d+)?)\s*points?\s*total/i  // English format: 20 points total
  ];
  
  for (const pattern of maxScorePatterns) {
    const match = description.match(pattern);
    if (match) {
      const maxScore = parseFloat(match[1]);
      
      if (!isNaN(maxScore) && maxScore >= 0) {
        return maxScore;
      }
    }
  }
  
  return null;
}

/**
 * Update grade level description
 * PUT /api/uploads/rubric/grade-level/:grade_level_id/description
 * Automatically parses and updates min_score/max_score if found in description
 */
router.put('/rubric/grade-level/:grade_level_id/description', async (req, res) => {
  try {
    const { grade_level_id } = req.params;
    const { description } = req.body;
    
    console.log(`📝 Updating grade level ${grade_level_id} description`);
    
    // Check if grade level exists
    const gradeLevelCheck = await db.query(
      'SELECT grade_level_id, level_name, criterion_id, min_score, max_score FROM criterion_grade_level WHERE grade_level_id = $1',
      [grade_level_id]
    );
    
    if (gradeLevelCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Grade level not found' 
      });
    }
    
    const currentLevel = gradeLevelCheck.rows[0];
    
    // Always try to parse score range from description
    // Ensure description is never null or empty
    const cleanDescription = (description && description.trim()) || 'No description';
    const parsedScores = parseScoreRangeFromDescription(cleanDescription);
    let updateFields = ['description = $1'];
    let updateValues = [cleanDescription];
    let valueIndex = 2;
    
    let scoreUpdateInfo = null;
    
    if (parsedScores) {
      console.log(`🔍 Auto-detected score range in description: ${parsedScores.min_score}-${parsedScores.max_score}`);
      
      // Validate scores
      if (parsedScores.min_score < 0 || parsedScores.max_score < 0) {
        return res.status(400).json({ 
          error: 'Scores must be non-negative' 
        });
      }
      
      if (parsedScores.min_score > parsedScores.max_score) {
        return res.status(400).json({ 
          error: 'Min score cannot be greater than max score' 
        });
      }
      
      // Automatically add score updates
      updateFields.push(`min_score = $${valueIndex++}`);
      updateFields.push(`max_score = $${valueIndex++}`);
      updateValues.push(parsedScores.min_score);
      updateValues.push(parsedScores.max_score);
      
      scoreUpdateInfo = {
        previous: {
          min_score: parseFloat(currentLevel.min_score),
          max_score: parseFloat(currentLevel.max_score)
        },
        updated: {
          min_score: parsedScores.min_score,
          max_score: parsedScores.max_score
        }
      };
    }
    
    updateValues.push(grade_level_id);
    
    // Update grade level description (and scores if auto-detected)
    const updateQuery = `
      UPDATE criterion_grade_level 
      SET ${updateFields.join(', ')} 
      WHERE grade_level_id = $${valueIndex}
      RETURNING *
    `;
    
    const result = await db.query(updateQuery, updateValues);
    const updatedLevel = result.rows[0];
    
    console.log(`✅ Updated grade level description for: ${updatedLevel.level_name}`);
    if (scoreUpdateInfo) {
      console.log(`📊 Auto-updated scores: ${scoreUpdateInfo.previous.min_score}-${scoreUpdateInfo.previous.max_score} → ${scoreUpdateInfo.updated.min_score}-${scoreUpdateInfo.updated.max_score}`);
    }
    
    const response = {
      success: true,
      message: 'Grade level description updated successfully',
      grade_level: {
        grade_level_id: updatedLevel.grade_level_id,
        level_name: updatedLevel.level_name,
        description: updatedLevel.description,
        criterion_id: updatedLevel.criterion_id,
        seq_no: updatedLevel.seq_no,
        min_score: parseFloat(updatedLevel.min_score),
        max_score: parseFloat(updatedLevel.max_score)
      }
    };
    
    // Add score update information if scores were auto-updated
    if (scoreUpdateInfo) {
      response.message += ' (scores auto-updated from description)';
      response.score_update = scoreUpdateInfo;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Failed to update grade level description:', error);
    res.status(500).json({ 
      error: 'Failed to update grade level description',
      details: error.message 
    });
  }
});

/**
 * Update grade level scores (min_score and max_score)
 * PUT /api/uploads/rubric/grade-level/:grade_level_id/scores
 */
router.put('/rubric/grade-level/:grade_level_id/scores', async (req, res) => {
  try {
    const { grade_level_id } = req.params;
    const { min_score, max_score } = req.body;
    
    if (min_score === undefined || max_score === undefined) {
      return res.status(400).json({ 
        error: 'Both min_score and max_score are required' 
      });
    }
    
    const minScoreValue = parseFloat(min_score);
    const maxScoreValue = parseFloat(max_score);
    
    if (isNaN(minScoreValue) || isNaN(maxScoreValue)) {
      return res.status(400).json({ 
        error: 'Scores must be valid numbers' 
      });
    }
    
    if (minScoreValue < 0 || maxScoreValue < 0) {
      return res.status(400).json({ 
        error: 'Scores must be non-negative' 
      });
    }
    
    if (minScoreValue > maxScoreValue) {
      return res.status(400).json({ 
        error: 'Min score cannot be greater than max score' 
      });
    }
    
    console.log(`📝 Updating grade level ${grade_level_id} scores: ${minScoreValue} - ${maxScoreValue}`);
    
    // Check if grade level exists
    const gradeLevelCheck = await db.query(
      'SELECT grade_level_id, level_name, criterion_id FROM criterion_grade_level WHERE grade_level_id = $1',
      [grade_level_id]
    );
    
    if (gradeLevelCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Grade level not found' 
      });
    }
    
    // Update grade level scores
    const result = await db.query(
      'UPDATE criterion_grade_level SET min_score = $1, max_score = $2 WHERE grade_level_id = $3 RETURNING *',
      [minScoreValue, maxScoreValue, grade_level_id]
    );
    
    console.log(`✅ Updated grade level scores: ${result.rows[0].level_name} -> ${result.rows[0].min_score}-${result.rows[0].max_score}`);
    
    res.json({
      success: true,
      message: 'Grade level scores updated successfully',
      grade_level: {
        grade_level_id: result.rows[0].grade_level_id,
        level_name: result.rows[0].level_name,
        criterion_id: result.rows[0].criterion_id,
        seq_no: result.rows[0].seq_no,
        min_score: parseFloat(result.rows[0].min_score),
        max_score: parseFloat(result.rows[0].max_score),
        description: result.rows[0].description
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to update grade level scores:', error);
    res.status(500).json({ 
      error: 'Failed to update grade level scores',
      details: error.message 
    });
  }
});

/**
 * Get grade level details by ID
 * GET /api/uploads/rubric/grade-level/:grade_level_id
 */
router.get('/rubric/grade-level/:grade_level_id', async (req, res) => {
  try {
    const { grade_level_id } = req.params;
    
    console.log(`🔍 Getting grade level details: ${grade_level_id}`);
    
    const result = await db.query(`
      SELECT 
        cgl.grade_level_id,
        cgl.criterion_id,
        cgl.level_name,
        cgl.min_score,
        cgl.max_score,
        cgl.description,
        cgl.seq_no,
        rc.title as criterion_title,
        rc.rubric_id
      FROM criterion_grade_level cgl
      JOIN rubric_criterion rc ON cgl.criterion_id = rc.criterion_id
      WHERE cgl.grade_level_id = $1
    `, [grade_level_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Grade level not found' 
      });
    }
    
    const gradeLevel = result.rows[0];
    
    res.json({
      success: true,
      grade_level: {
        grade_level_id: gradeLevel.grade_level_id,
        level_name: gradeLevel.level_name,
        criterion_id: gradeLevel.criterion_id,
        criterion_title: gradeLevel.criterion_title,
        rubric_id: gradeLevel.rubric_id,
        seq_no: gradeLevel.seq_no,
        min_score: parseFloat(gradeLevel.min_score),
        max_score: parseFloat(gradeLevel.max_score),
        description: gradeLevel.description
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to get grade level details:', error);
    res.status(500).json({ 
      error: 'Failed to get grade level details',
      details: error.message 
    });
  }
});

/**
 * Add new criterion (row) to rubric
 * POST /api/uploads/rubric/:rubric_id/add-criterion
 */
router.post('/rubric/:rubric_id/add-criterion', async (req, res) => {
  const client = await db.connect();
  
  try {
    const { rubric_id } = req.params;
    const { title, description, max_score } = req.body;
    
    console.log(`➕ Adding new criterion to rubric: ${rubric_id}`);
    
    await client.query('BEGIN');
    
    // Verify rubric exists
    const rubricCheck = await client.query(
      'SELECT rubric_id, "row", "column" FROM rubric WHERE rubric_id = $1',
      [rubric_id]
    );
    
    if (rubricCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rubric not found' });
    }
    
    const currentRows = rubricCheck.rows[0].row || 0;
    
    // Get next sequence number
    const seqResult = await client.query(
      'SELECT COALESCE(MAX(seq_no), 0) + 1 as next_seq FROM rubric_criterion WHERE rubric_id = $1',
      [rubric_id]
    );
    const nextSeq = seqResult.rows[0].next_seq;
    
    // Create new criterion
    const criterionResult = await client.query(
      `INSERT INTO rubric_criterion (rubric_id, seq_no, title, description, max_score)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING criterion_id, seq_no, title, description, max_score`,
      [
        rubric_id,
        nextSeq,
        title || `New Criterion ${nextSeq}`,
        description || null,
        max_score || 0
      ]
    );
    
    const newCriterion = criterionResult.rows[0];
    console.log(`✅ Created new criterion: ${newCriterion.criterion_id}`);
    
    // Get all existing grade levels from other criteria in this rubric
    const existingLevels = await client.query(
      `SELECT DISTINCT cgl.level_name, cgl.min_score, cgl.max_score, cgl.seq_no
       FROM criterion_grade_level cgl
       JOIN rubric_criterion rc ON cgl.criterion_id = rc.criterion_id
       WHERE rc.rubric_id = $1
       ORDER BY cgl.seq_no`,
      [rubric_id]
    );
    
    // Create grade level entries for this new criterion
    const createdLevels = [];
    for (const level of existingLevels.rows) {
      const levelResult = await client.query(
        `INSERT INTO criterion_grade_level (criterion_id, level_name, min_score, max_score, description, seq_no)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING grade_level_id, level_name, min_score, max_score, seq_no`,
        [
          newCriterion.criterion_id,
          level.level_name,
          level.min_score || 0,
          level.max_score || 0,
          'No description', // Default description for new criterion
          level.seq_no
        ]
      );
      createdLevels.push(levelResult.rows[0]);
    }
    
    console.log(`✅ Created ${createdLevels.length} grade levels for new criterion`);
    
    // Update rubric row count
    await client.query(
      'UPDATE rubric SET "row" = $1 WHERE rubric_id = $2',
      [currentRows + 1, rubric_id]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'New criterion added successfully',
      criterion: {
        criterion_id: newCriterion.criterion_id,
        seq_no: newCriterion.seq_no,
        title: newCriterion.title,
        description: newCriterion.description,
        max_score: parseFloat(newCriterion.max_score),
        grade_levels: createdLevels.map(level => ({
          grade_level_id: level.grade_level_id,
          level_name: level.level_name,
          min_score: parseFloat(level.min_score),
          max_score: parseFloat(level.max_score),
          seq_no: level.seq_no
        }))
      },
      rubric_updated: {
        new_row_count: currentRows + 1
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Failed to add new criterion:', error);
    res.status(500).json({
      error: 'Failed to add new criterion',
      details: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * Delete criterion (row) from rubric
 * DELETE /api/uploads/rubric/criterion/:criterion_id
 */
router.delete('/rubric/criterion/:criterion_id', async (req, res) => {
  const client = await db.connect();
  
  try {
    const { criterion_id } = req.params;
    
    console.log(`🗑️ Deleting criterion: ${criterion_id}`);
    
    await client.query('BEGIN');
    
    // Get criterion and rubric info
    const criterionCheck = await client.query(
      `SELECT rc.criterion_id, rc.title, rc.rubric_id, r."row"
       FROM rubric_criterion rc
       JOIN rubric r ON rc.rubric_id = r.rubric_id
       WHERE rc.criterion_id = $1`,
      [criterion_id]
    );
    
    if (criterionCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Criterion not found' });
    }
    
    const criterion = criterionCheck.rows[0];
    const rubricId = criterion.rubric_id;
    const currentRows = criterion.row || 0;
    
    // Delete all grade levels for this criterion
    const deletedLevels = await client.query(
      'DELETE FROM criterion_grade_level WHERE criterion_id = $1 RETURNING grade_level_id',
      [criterion_id]
    );
    
    console.log(`✅ Deleted ${deletedLevels.rows.length} grade levels`);
    
    // Delete the criterion itself
    await client.query(
      'DELETE FROM rubric_criterion WHERE criterion_id = $1',
      [criterion_id]
    );
    
    console.log(`✅ Deleted criterion: ${criterion.title}`);
    
    // Update rubric row count
    await client.query(
      'UPDATE rubric SET "row" = $1 WHERE rubric_id = $2',
      [Math.max(0, currentRows - 1), rubricId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Criterion deleted successfully',
      deleted: {
        criterion_id: parseInt(criterion_id),
        title: criterion.title,
        grade_levels_deleted: deletedLevels.rows.length
      },
      rubric_updated: {
        rubric_id: rubricId,
        new_row_count: Math.max(0, currentRows - 1)
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Failed to delete criterion:', error);
    res.status(500).json({
      error: 'Failed to delete criterion',
      details: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * Delete grade level (column) from rubric
 * DELETE /api/uploads/rubric/:rubric_id/grade-level/:level_name
 */
router.delete('/rubric/:rubric_id/grade-level/:level_name', async (req, res) => {
  const client = await db.connect();
  
  try {
    const { rubric_id, level_name } = req.params;
    const decodedLevelName = decodeURIComponent(level_name);
    
    console.log(`🗑️ Deleting grade level: ${decodedLevelName} from rubric ${rubric_id}`);
    
    await client.query('BEGIN');
    
    // Get rubric info
    const rubricCheck = await client.query(
      'SELECT rubric_id, "column" FROM rubric WHERE rubric_id = $1',
      [rubric_id]
    );
    
    if (rubricCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rubric not found' });
    }
    
    const currentColumns = rubricCheck.rows[0].column || 0;
    
    // Delete all grade level entries with this level_name for this rubric's criteria
    const deletedLevels = await client.query(
      `DELETE FROM criterion_grade_level cgl
       USING rubric_criterion rc
       WHERE cgl.criterion_id = rc.criterion_id
         AND rc.rubric_id = $1
         AND cgl.level_name = $2
       RETURNING cgl.grade_level_id, cgl.criterion_id`,
      [rubric_id, decodedLevelName]
    );
    
    if (deletedLevels.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        error: 'Grade level not found',
        message: `No grade level with name "${decodedLevelName}" found in this rubric`
      });
    }
    
    console.log(`✅ Deleted ${deletedLevels.rows.length} grade level entries`);
    
    // Update rubric column count
    await client.query(
      'UPDATE rubric SET "column" = $1 WHERE rubric_id = $2',
      [Math.max(0, currentColumns - 1), rubric_id]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'Grade level deleted successfully',
      deleted: {
        level_name: decodedLevelName,
        entries_deleted: deletedLevels.rows.length
      },
      rubric_updated: {
        rubric_id: parseInt(rubric_id),
        new_column_count: Math.max(0, currentColumns - 1)
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Failed to delete grade level:', error);
    res.status(500).json({
      error: 'Failed to delete grade level',
      details: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * Add new grade level (column) to rubric
 * POST /api/uploads/rubric/:rubric_id/add-grade-level
 */
router.post('/rubric/:rubric_id/add-grade-level', async (req, res) => {
  const client = await db.connect();
  
  try {
    const { rubric_id } = req.params;
    const { level_name, min_score, max_score } = req.body;
    
    console.log(`➕ Adding new grade level to rubric: ${rubric_id}`);
    
    await client.query('BEGIN');
    
    // Verify rubric exists
    const rubricCheck = await client.query(
      'SELECT rubric_id, "row", "column" FROM rubric WHERE rubric_id = $1',
      [rubric_id]
    );
    
    if (rubricCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rubric not found' });
    }
    
    const currentColumns = rubricCheck.rows[0].column || 0;
    
    // Get next sequence number for grade levels
    const seqResult = await client.query(
      `SELECT COALESCE(MAX(cgl.seq_no), 0) + 1 as next_seq
       FROM criterion_grade_level cgl
       JOIN rubric_criterion rc ON cgl.criterion_id = rc.criterion_id
       WHERE rc.rubric_id = $1`,
      [rubric_id]
    );
    const nextSeq = seqResult.rows[0].next_seq;
    
    // Get all criteria for this rubric
    const criteriaResult = await client.query(
      'SELECT criterion_id FROM rubric_criterion WHERE rubric_id = $1 ORDER BY seq_no',
      [rubric_id]
    );
    
    if (criteriaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Cannot add grade level: no criteria exist in this rubric',
        message: 'Please add at least one criterion first'
      });
    }
    
    // Create new grade level for each criterion
    const createdLevels = [];
    for (const criterion of criteriaResult.rows) {
      const levelResult = await client.query(
        `INSERT INTO criterion_grade_level (criterion_id, level_name, min_score, max_score, description, seq_no)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING grade_level_id, criterion_id, level_name, min_score, max_score, seq_no`,
        [
          criterion.criterion_id,
          level_name || `New Level ${nextSeq}`,
          min_score || 0,
          max_score || 0,
          'No description', // Default description for new grade level
          nextSeq
        ]
      );
      createdLevels.push(levelResult.rows[0]);
    }
    
    console.log(`✅ Created ${createdLevels.length} grade level entries`);
    
    // Update rubric column count
    await client.query(
      'UPDATE rubric SET "column" = $1 WHERE rubric_id = $2',
      [currentColumns + 1, rubric_id]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'New grade level added successfully',
      grade_level: {
        level_name: level_name || `New Level ${nextSeq}`,
        min_score: parseFloat(min_score || 0),
        max_score: parseFloat(max_score || 0),
        seq_no: nextSeq,
        entries_created: createdLevels.map(level => ({
          grade_level_id: level.grade_level_id,
          criterion_id: level.criterion_id,
          level_name: level.level_name,
          min_score: parseFloat(level.min_score),
          max_score: parseFloat(level.max_score)
        }))
      },
      rubric_updated: {
        new_column_count: currentColumns + 1
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Failed to add new grade level:', error);
    res.status(500).json({
      error: 'Failed to add new grade level',
      details: error.message
    });
  } finally {
    client.release();
  }
});


module.exports = router;