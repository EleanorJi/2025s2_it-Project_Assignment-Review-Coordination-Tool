const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const db = require('../config/database');
const { parseRubricFile } = require('../utils/fileParser');
const { parseRubricWithDetails } = require('../utils/enhanced_rubric_parser');

const router = express.Router();

// 目录设置
const TEMP_DIR = path.join(__dirname, '../../temp_uploads');
const PERM_ROOT = path.join(__dirname, '../../uploads');
fs.mkdirSync(TEMP_DIR, { recursive: true });
fs.mkdirSync(PERM_ROOT, { recursive: true });

// 临时文件存储配置 (类似原来的drafts)
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

// 1) 上传草稿文件：POST /api/uploads/drafts (保持与原API一致)
router.post('/drafts', draftUpload.single('file'), async (req, res) => {
  try {
    const slot = req.body.slot;
    if (!['assignment1','assignment2','rubric'].includes(slot)) {
      await fsp.unlink(req.file.path).catch(()=>{});
      return res.status(400).json({ error: 'invalid slot' });
    }
    
    // 验证文件类型
    const fileType = req.file.mimetype;
    
    // Assignment只能PDF
    if (slot === 'assignment1' || slot === 'assignment2') {
      if (fileType !== 'application/pdf') {
        await fsp.unlink(req.file.path).catch(()=>{});
        return res.status(400).json({ 
          error: 'Assignment files must be PDF',
          received_type: fileType 
        });
      }
    }
    
    // Rubric不能PDF，允许DOCX、XLSX、CSV等
    if (slot === 'rubric') {
      if (fileType === 'application/pdf') {
        await fsp.unlink(req.file.path).catch(()=>{});
        return res.status(400).json({ 
          error: 'Rubric files cannot be PDF (use DOCX, XLSX, CSV)',
          received_type: fileType 
        });
      }
    }

    console.log(`📋 草稿上传: ${slot}, ${req.file.originalname}, ${fileType}`);

    // 设置过期时间为24小时
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

    // 保存metadata文件以便后续解析时使用
    const metadataPath = path.join(TEMP_DIR, `${draftInfo.temp_name}.metadata.json`);
    await fsp.writeFile(metadataPath, JSON.stringify(draftInfo, null, 2));

    console.log(`✅ 草稿保存: ${draftInfo.temp_name}`);

    res.json(draftInfo);
    
  } catch (error) {
    console.error('❌ 草稿上传失败:', error);
    await fsp.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: 'Draft upload failed' });
  }
});

// 2) 删除草稿文件：DELETE /api/uploads/drafts/:tempName (保持与原API一致)
router.delete('/drafts/:tempName', async (req, res) => {
  try {
    const { tempName } = req.params;
    const tempPath = path.join(TEMP_DIR, tempName);
    
    if (!fs.existsSync(tempPath)) {
      return res.status(404).json({ error: 'Draft file not found' });
    }
    
    await fsp.unlink(tempPath);
    // 尝试删除metadata文件
    const metadataPath = path.join(TEMP_DIR, `${tempName}.metadata.json`);
    await fsp.unlink(metadataPath).catch(() => {}); // 忽略metadata文件删除失败
    console.log(`🗑️ 草稿删除: ${tempName}`);
    
    res.json({ message: 'Draft deleted successfully' });
    
  } catch (error) {
    console.error('❌ 草稿删除失败:', error);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// 3) 单文件发布：POST /api/uploads/commit (直接发布，无draft状态)
router.post('/commit', async (req, res) => {
  const client = await db.connect();
  
  try {
    const { temp_name, project_id, file_type, round, due_date } = req.body;
    
    // 验证必需参数
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

    // 验证临时文件存在
    const tempPath = path.join(TEMP_DIR, temp_name);
    if (!fs.existsSync(tempPath)) {
      return res.status(400).json({ error: 'draft not found' });
    }

    console.log(`🔄 发布文件: ${file_type}, project_id=${project_id}, temp_name=${temp_name}`);

    await client.query('BEGIN');

    // 验证项目存在
    const projectCheck = await client.query(
      'SELECT project_id, name FROM project WHERE project_id = $1',
      [project_id]
    );
    
    if (projectCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found' });
    }

    // 获取文件信息和原始文件名
    const stat = await fsp.stat(tempPath);
    let mimeType = mime.lookup(tempPath) || 'application/octet-stream';
    let originalName = null;
    
    // 尝试读取metadata文件获取原始文件名
    const metadataPath = path.join(TEMP_DIR, `${temp_name}.metadata.json`);
    try {
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(await fsp.readFile(metadataPath, 'utf8'));
        originalName = metadata.original_name;
        // 如果有原始文件名，使用它来更准确地检测MIME类型
        if (originalName) {
          const detectedMime = mime.lookup(originalName);
          if (detectedMime) {
            mimeType = detectedMime;
          }
        }
      }
    } catch (error) {
      console.log('⚠️ 无法读取metadata文件，使用默认MIME类型');
    }
    
    let recordId = null;
    let newVersionNumber = 1;
    let assignmentIsPublished;

    if (file_type === 'rubric') {
      // 获取rubric的下一个版本号
      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM rubric WHERE project_id = $1',
        [project_id]
      );
      newVersionNumber = versionResult.rows[0].next_version;

      // 创建新的rubric记录
      const rubricResult = await client.query(
        `INSERT INTO rubric (uploaded_by, project_id, version) 
         VALUES ($1, $2, $3) 
         RETURNING rubric_id`,
        [1, project_id, newVersionNumber]
      );
      recordId = rubricResult.rows[0].rubric_id;
      
      console.log(`✅ 创建rubric记录: rubric_id=${recordId}, version=${newVersionNumber}`);

    } else if (file_type === 'assignment') {
      // 验证due_date
      if (due_date) {
        const dueDateObj = new Date(due_date);
        if (isNaN(dueDateObj.getTime())) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Invalid due_date format' });
        }
      }

      // 获取assignment的下一个版本号
      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM assignment WHERE project_id = $1 AND round = $2',
        [project_id, round]
      );
      newVersionNumber = versionResult.rows[0].next_version;

      // 创建新的assignment记录
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

      console.log(`✅ 创建assignment记录: assignment_id=${recordId}, round=${round}, version=${newVersionNumber}, is_published=${assignmentIsPublished}`);
    }

    // 移动文件到永久存储
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const permDir = path.join(PERM_ROOT, String(year), month);
    await fsp.mkdir(permDir, { recursive: true });

    const ext = path.extname(temp_name) || '.bin';
    const newFileName = `${uuidv4()}${ext}`;
    const permanentPath = path.join(permDir, newFileName);
    const storagePath = `${year}/${month}/${newFileName}`;

    await fsp.rename(tempPath, permanentPath);
    console.log(`📂 文件移动: ${tempPath} → ${permanentPath}`);

    // 创建upload记录
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
    console.log(`✅ Upload记录创建: upload_id=${uploadId}`);

    // 如果是rubric文件，解析表格信息和详细内容
    let tableInfo = null;
    if (file_type === 'rubric') {
      try {
        console.log(`📊 解析rubric文件...`);
        const { rows, columns, criteria, gradeLevels } = await parseRubricWithDetails(permanentPath, mimeType, originalName);
        
        // 更新rubric表的基本信息
        await client.query(
          'UPDATE rubric SET "row" = $1, "column" = $2 WHERE rubric_id = $3',
          [rows, columns, recordId]
        );
        
        console.log(`✅ Rubric基本解析完成: ${rows}行 x ${columns}列`);
        console.log(`📋 提取到 ${criteria.length} 个评分标准`);
        console.log(`🏆 提取到 ${gradeLevels.length} 个等级水平`);
        
        // 保存评分标准到数据库
        if (criteria.length > 0) {
          console.log(`💾 保存评分标准到数据库...`);
          
          for (const criterion of criteria) {
            const criterionResult = await client.query(
              `INSERT INTO rubric_criterion (rubric_id, seq_no, title, description, max_score) 
               VALUES ($1, $2, $3, $4, $5) RETURNING criterion_id`,
              [recordId, criterion.seq_no, criterion.title, criterion.description, criterion.max_score]
            );
            
            const criterionId = criterionResult.rows[0].criterion_id;
            console.log(`  ✅ 保存标准: ${criterion.title} (ID: ${criterionId})`);
            
            // 保存该标准的等级信息
            const criterionLevels = gradeLevels.filter(level => level.criterion_seq_no === criterion.seq_no);
            
            for (const level of criterionLevels) {
              await client.query(
                `INSERT INTO criterion_grade_level (criterion_id, level_name, min_score, max_score, description, seq_no) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [criterionId, level.level_name, level.min_score, level.max_score, level.description, level.seq_no]
              );
              
              console.log(`    🏆 保存等级: ${level.level_name} (${level.min_score}-${level.max_score}分)`);
            }
          }
          
          console.log(`✅ 所有评分标准和等级已保存到数据库`);
        }
        
        tableInfo = { 
          rows, 
          columns, 
          criteria_count: criteria.length, 
          grade_levels_count: gradeLevels.length 
        };
        
      } catch (parseError) {
        console.error('❌ Rubric解析失败:', parseError);
        
        // 解析失败时，至少尝试基本解析
        try {
          console.log(`🔄 尝试基本解析...`);
          const { rows, columns } = await parseRubricFile(permanentPath, mimeType);
          
          await client.query(
            'UPDATE rubric SET "row" = $1, "column" = $2 WHERE rubric_id = $3',
            [rows, columns, recordId]
          );
          
          tableInfo = { rows, columns, error: `详细解析失败: ${parseError.message}` };
          console.log(`⚠️ 基本解析完成: ${rows}行 x ${columns}列`);
        } catch (basicParseError) {
          console.error('❌ 基本解析也失败:', basicParseError);
          tableInfo = { rows: 0, columns: 0, error: `解析完全失败: ${basicParseError.message}` };
        }
      }
    }

    // 检查项目是否应该自动激活（存在已发布的 assignment 时）
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
      console.log(`🚀 项目自动激活: project_id=${project_id} (has published assignment)`);
    }

    await client.query('COMMIT');

    // 清理metadata文件（临时文件已经移动到permanent位置，无需删除）
    try {
      await fsp.unlink(metadataPath);
      console.log(`🗑️ 临时文件清理完成: ${temp_name}, metadata文件已删除`);
    } catch (cleanupError) {
      console.log(`⚠️ metadata文件清理失败: ${cleanupError.message}`);
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
    console.error('❌ 文件发布失败:', error);
    res.status(500).json({ 
      error: 'File commit failed',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// 4) 获取项目状态：GET /api/uploads/project/:project_id/status
router.get('/project/:project_id/status', async (req, res) => {
  try {
    const { project_id } = req.params;
    
    console.log(`🔍 获取项目 ${project_id} 状态...`);

    // 获取项目基本信息
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

    // 获取最新版本的rubric
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

    // 获取最新版本的assignments
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

    // 检查项目发布要求（需要rubric + 至少1个assignment）
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

    console.log(`✅ 项目状态: meets_requirements=${meetsPublishRequirements}, rubric=${hasRubric}, assignments=${hasAssignments}`);

    res.json(projectStatus);

  } catch (error) {
    console.error('❌ 获取项目状态失败:', error);
    res.status(500).json({ 
      error: 'Failed to get project status',
      details: error.message 
    });
  }
});

// 获取项目最新的 rubric_id、assignment1 与 assignment2 的最新 id
// GET /api/uploads/project/:project_id/latest-ids
router.get('/project/:project_id/latest-ids', async (req, res) => {
  try {
    const { project_id } = req.params;

    // 最新 rubric（按 version 最大）
    const rubricResult = await db.query(
      `SELECT rubric_id, version
       FROM rubric WHERE project_id = $1
       ORDER BY version DESC
       LIMIT 1`,
      [project_id]
    );

    // 最新 assignment round=1
    const a1Result = await db.query(
      `SELECT assignment_id, version
       FROM assignment
       WHERE project_id = $1 AND round = 1
       ORDER BY version DESC
       LIMIT 1`,
      [project_id]
    );

    // 最新 assignment round=2
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
    console.error('❌ 获取latest-ids失败:', error);
    return res.status(500).json({ error: 'Failed to get latest ids', details: error.message });
  }
});

// 5) 激活项目：POST /api/uploads/project/:project_id/activate (由draft切到active)
router.post('/project/:project_id/activate', async (req, res) => {
  try {
    const { project_id } = req.params;
    
    console.log(`🚀 激活项目: project_id=${project_id}`);

    // 验证项目存在
    const projectCheck = await db.query(
      'SELECT project_id FROM project WHERE project_id = $1',
      [project_id]
    );
    
    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // 激活条件：至少存在一个已发布的 assignment
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

    // 将项目状态从draft改为active
    await db.query(
      'UPDATE project SET status = \'active\' WHERE project_id = $1',
      [project_id]
    );

    console.log(`✅ 项目激活成功: project_id=${project_id}`);

    res.json({
      message: 'Project activated successfully',
      project_id: parseInt(project_id),
      status: 'active',
      activated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 项目激活失败:', error);
    res.status(500).json({ 
      error: 'Failed to activate project',
      details: error.message 
    });
  }
});

// 5b) 兼容旧路由：发布项目（内部转到激活）POST /api/uploads/project/:project_id/publish
router.post('/project/:project_id/publish', async (req, res) => {
  // 为了兼容旧客户端，重用激活逻辑
  req.url = `/project/${req.params.project_id}/activate`;
  return router.handle(req, res);
});

// 6) 文件下载：GET /api/uploads/:id/download (保持与原API完全一致)
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
    console.error('❌ 文件下载失败:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// 7) 创建项目：POST /api/uploads/project
router.post('/project', async (req, res) => {
  const client = await db.connect();
  
  try {
    const { name, description } = req.body;
    
    const projectName = name || 'New Project';
    const projectDescription = description || 'Auto-created project for uploads';
    
    console.log(`📁 创建新项目: ${projectName}`);

    await client.query('BEGIN');

    // 创建新项目（默认draft状态）
    const projectResult = await client.query(
      `INSERT INTO project (name, description, created_by, status) 
       VALUES ($1, $2, $3, 'draft') 
       RETURNING project_id, name, description, status, created_at`,
      [projectName, projectDescription, 1] // 默认创建者ID为1
    );

    const newProject = projectResult.rows[0];

    await client.query('COMMIT');

    console.log(`✅ 项目创建成功: project_id=${newProject.project_id}`);

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
    console.error('❌ 项目创建失败:', error);
    res.status(500).json({ 
      error: 'Failed to create project',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// 8) 重命名项目：PUT /api/uploads/project/:project_id
router.put('/project/:project_id', async (req, res) => {
  try {
    const { project_id } = req.params;
    const { name, description } = req.body;
    
    if (!name && !description) {
      return res.status(400).json({ error: 'Name or description is required' });
    }

    console.log(`📝 更新项目: project_id=${project_id}`);

    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (name) {
      updateFields.push(`name = $${paramIndex}`);
      updateValues.push(name);
      paramIndex++;
    }

    if (description) {
      updateFields.push(`description = $${paramIndex}`);
      updateValues.push(description);
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

    console.log(`✅ 项目更新成功: ${updatedProject.name}`);

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
    console.error('❌ 项目更新失败:', error);
    res.status(500).json({ 
      error: 'Failed to update project',
      details: error.message 
    });
  }
});

// 9) 获取所有项目：GET /api/uploads/projects
router.get('/projects', async (req, res) => {
  try {
    console.log('📋 获取所有项目列表...');

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

    console.log(`✅ 找到 ${result.rows.length} 个项目`);

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
    console.error('❌ 获取项目列表失败:', error);
    res.status(500).json({ 
      error: 'Failed to get projects',
      details: error.message 
    });
  }
});

// 10) 删除项目：DELETE /api/uploads/project/:project_id
router.delete('/project/:project_id', async (req, res) => {
  const client = await db.connect();
  
  try {
    const { project_id } = req.params;
    
    console.log(`🗑️ 删除项目: project_id=${project_id}`);

    await client.query('BEGIN');

    // 验证项目存在并获取项目信息
    const projectCheck = await client.query(
      'SELECT project_id, name FROM project WHERE project_id = $1',
      [project_id]
    );
    
    if (projectCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectName = projectCheck.rows[0].name;

    // 获取所有相关的上传文件路径
    const uploadFiles = await client.query(`
      SELECT u.storage_path 
      FROM upload u
      LEFT JOIN assignment a ON u.assignment_id = a.assignment_id
      LEFT JOIN rubric r ON u.rubric_id = r.rubric_id
      WHERE a.project_id = $1 OR r.project_id = $1
    `, [project_id]);

    // 删除物理文件
    for (const file of uploadFiles.rows) {
      if (file.storage_path) {
        const filePath = path.join(PERM_ROOT, file.storage_path);
        try {
          await fsp.unlink(filePath);
          console.log(`📂 删除文件: ${file.storage_path}`);
        } catch (fileError) {
          console.log(`⚠️ 文件删除失败 (可能已不存在): ${file.storage_path}`);
        }
      }
    }

    // 删除数据库记录 (依赖CASCADE删除)
    await client.query('DELETE FROM project WHERE project_id = $1', [project_id]);

    await client.query('COMMIT');

    console.log(`✅ 项目删除成功: ${projectName} (project_id=${project_id})`);

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
    console.error('❌ 项目删除失败:', error);
    res.status(500).json({ 
      error: 'Failed to delete project',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// 11) 根据名字删除项目：DELETE /api/uploads/project/by-name/:name
router.delete('/project/by-name/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    console.log(`🔍 查找项目: name=${name}`);

    // 查找项目
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
    
    // 重定向到按ID删除
    console.log(`🔄 重定向到按ID删除: project_id=${project.project_id}`);
    
    // 直接调用删除逻辑
    req.params.project_id = project.project_id;
    return router.handle(
      Object.assign(req, { method: 'DELETE', url: `/project/${project.project_id}` }), 
      res
    );

  } catch (error) {
    console.error('❌ 按名字删除项目失败:', error);
    res.status(500).json({ 
      error: 'Failed to delete project by name',
      details: error.message 
    });
  }
});

// 12) 批量清理临时文件：DELETE /api/uploads/debug/temp-files
router.delete('/debug/temp-files', async (req, res) => {
  try {
    const { older_than_hours, force } = req.query;
    
    console.log('🧹 清理临时文件...');
    
    const files = await fsp.readdir(TEMP_DIR);
    let deletedFiles = [];
    let skippedFiles = [];
    
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stat = await fsp.stat(filePath);
      
      // 如果指定了时间限制
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
        console.log(`🗑️ 删除临时文件: ${file}`);
      } catch (unlinkError) {
        skippedFiles.push({
          name: file,
          reason: `Delete failed: ${unlinkError.message}`
        });
      }
    }

    console.log(`✅ 临时文件清理完成: 删除${deletedFiles.length}个，跳过${skippedFiles.length}个`);

    res.json({
      message: 'Temp files cleanup completed',
      deleted_count: deletedFiles.length,
      skipped_count: skippedFiles.length,
      deleted_files: deletedFiles,
      ...(skippedFiles.length > 0 && { skipped_files: skippedFiles })
    });

  } catch (error) {
    console.error('❌ 临时文件清理失败:', error);
    res.status(500).json({ 
      error: 'Failed to cleanup temp files',
      details: error.message 
    });
  }
});

// 13) 调试工具：GET /api/uploads/debug/temp-files (保持与原API一致)
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
    console.error('❌ 调试失败:', error);
    res.status(500).json({ error: 'Debug failed' });
  }
});

// 16) 手动更新分数区间：PUT /api/uploads/grade-level/:grade_level_id
router.put('/grade-level/:grade_level_id', async (req, res) => {
  try {
    const { grade_level_id } = req.params;
    const { min_score, max_score, level_name, description } = req.body;
    
    console.log(`🔧 手动更新分数区间: grade_level_id=${grade_level_id}`);
    
    // 验证必需参数
    if (min_score === undefined || max_score === undefined) {
      return res.status(400).json({ 
        error: 'min_score and max_score are required' 
      });
    }
    
    // 验证分数区间合理性
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
    
    // 检查等级是否存在
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
    
    // 构建更新语句
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
    
    console.log(`✅ 分数区间更新成功:`);
    console.log(`  原始: ${currentLevel.level_name} (${currentLevel.min_score}-${currentLevel.max_score})`);
    console.log(`  更新: ${updatedLevel.level_name} (${updatedLevel.min_score}-${updatedLevel.max_score})`);
    
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
    console.error('❌ 更新分数区间失败:', error);
    res.status(500).json({ 
      error: 'Failed to update grade level',
      details: error.message 
    });
  }
});

// 17) 获取所有评分标准和等级：GET /api/uploads/rubric/:rubric_id/details
router.get('/rubric/:rubric_id/details', async (req, res) => {
  try {
    const { rubric_id } = req.params;
    
    console.log(`📋 获取rubric详细信息: rubric_id=${rubric_id}`);
    
    // 获取rubric基本信息
    const rubricInfo = await db.query(
      'SELECT * FROM rubric WHERE rubric_id = $1',
      [rubric_id]
    );
    
    if (rubricInfo.rows.length === 0) {
      return res.status(404).json({ error: 'Rubric not found' });
    }
    
    // 获取所有评分标准
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
    
    // 获取所有等级水平
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
    
    // 组织数据结构
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
    
    console.log(`✅ 返回 ${criteria.rows.length} 个标准，${gradeLevels.rows.length} 个等级`);
    
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
    console.error('❌ 获取rubric详细信息失败:', error);
    res.status(500).json({ 
      error: 'Failed to get rubric details',
      details: error.message 
    });
  }
});

// 改分功能：根据criterion和分数查找对应的grade level
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
    
    console.log(`🔍 查找分数 ${scoreValue} 在criterion ${criterion_id} 中对应的等级...`);
    
    // 首先验证criterion是否存在
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
    
    // 检查分数是否在有效范围内
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
    
    // 查找对应的grade level (分数在min_score和max_score之间)
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
      // 如果没有精确匹配，查找最接近的等级
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
    
    // 返回精确匹配的结果
    const gradeLevel = gradeLevelQuery.rows[0];
    
    console.log(`✅ 找到匹配等级: ${gradeLevel.level_name} (${gradeLevel.min_score}-${gradeLevel.max_score}分)`);
    
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
    console.error('❌ 分数查找失败:', error);
    res.status(500).json({ 
      error: 'Failed to lookup score',
      details: error.message 
    });
  }
});

// ============== 评分功能 APIs ==============

/**
 * 根据分数匹配等级区间的通用函数
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
 * Coordinator专用 - 设置/更新baseline分数
 * POST /api/uploads/scoring/baseline
 */
router.post('/scoring/baseline', async (req, res) => {
  try {
    const { assignment_id, criterion_id, score, comment } = req.body;

    // 验证必需字段
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

    // 验证assignment存在并且是最新版本
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

    // 验证criterion存在且属于该project的最新rubric版本
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

    // 查找匹配的等级区间
    const gradeLevel = await findGradeLevelByScore(criterion_id, scoreValue);
    if (!gradeLevel) {
      return res.status(400).json({
        error: `Score ${scoreValue} does not match any grade level for this criterion`
      });
    }

    // 插入或更新baseline_score
    const upsertResult = await db.query(
      `INSERT INTO baseline_score (assignment_id, criterion_id, score, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (assignment_id, criterion_id)
       DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment
       RETURNING *`,
      [assignment_id, criterion_id, scoreValue, comment || null]
    );

    const baselineScore = upsertResult.rows[0];

    console.log(`✅ Baseline分数设置成功: assignment_id=${assignment_id}, criterion_id=${criterion_id}, score=${scoreValue}`);

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
    console.error('❌ 设置baseline分数失败:', error);
    res.status(500).json({
      error: 'Failed to set baseline score',
      details: error.message
    });
  }
});

/**
 * Marker专用 - 设置/更新marker分数
 * POST /api/uploads/scoring/marker
 */
router.post('/scoring/marker', async (req, res) => {
  try {
    const { assignment_id, criterion_id, marker_id, score, comment } = req.body;

    // 验证必需字段
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

    // 验证assignment存在并且是最新版本
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

    // 验证criterion存在且属于该project的最新rubric版本
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

    // 查找匹配的等级区间
    const gradeLevel = await findGradeLevelByScore(criterion_id, scoreValue);
    if (!gradeLevel) {
      return res.status(400).json({
        error: `Score ${scoreValue} does not match any grade level for this criterion`
      });
    }

    // 插入或更新marker_score
    const upsertResult = await db.query(
      `INSERT INTO marker_score (assignment_id, criterion_id, marker_id, score, comment, submitted_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (assignment_id, criterion_id, marker_id)
       DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment, submitted_at = NOW()
       RETURNING *`,
      [assignment_id, criterion_id, marker_id, scoreValue, comment || null]
    );

    const markerScore = upsertResult.rows[0];

    console.log(`✅ Marker分数设置成功: assignment_id=${assignment_id}, criterion_id=${criterion_id}, marker_id=${marker_id}, score=${scoreValue}`);

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
    console.error('❌ 设置marker分数失败:', error);
    res.status(500).json({
      error: 'Failed to set marker score',
      details: error.message
    });
  }
});

/**
 * 获取assignment的所有baseline分数
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

    console.log(`✅ 获取baseline分数成功: assignment_id=${assignment_id}, count=${result.rows.length}`);

    res.json({
      assignment_id: parseInt(assignment_id),
      baseline_scores: result.rows.map(row => ({
        baseline_id: row.baseline_id,
        criterion_id: row.criterion_id,
        criterion_title: row.criterion_title,
        criterion_max_score: parseFloat(row.criterion_max_score),
        score: parseFloat(row.score),
        comment: row.comment,
        matched_level: row.level_name ? {
          level_name: row.level_name,
          min_score: parseFloat(row.level_min_score),
          max_score: parseFloat(row.level_max_score),
          description: row.level_description
        } : null
      }))
    });

  } catch (error) {
    console.error('❌ 获取baseline分数失败:', error);
    res.status(500).json({
      error: 'Failed to get baseline scores',
      details: error.message
    });
  }
});

/**
 * 获取assignment的marker分数
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

    console.log(`✅ 获取marker分数成功: assignment_id=${assignment_id}, marker_id=${marker_id}, count=${result.rows.length}`);

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
    console.error('❌ 获取marker分数失败:', error);
    res.status(500).json({
      error: 'Failed to get marker scores',
      details: error.message
    });
  }
});

// 获取 assignment 状态：GET /api/uploads/assignment/:assignment_id/status
router.get('/assignment/:assignment_id/status', async (req, res) => {
  try {
    const { assignment_id } = req.params;

    const result = await db.query(
      `SELECT assignment_id, is_published, name, round, version, project_id, due_at, created_at
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
        created_at: row.created_at,
        is_published: row.is_published
      }
    });
  } catch (error) {
    console.error('❌ 获取assignment状态失败:', error);
    return res.status(500).json({ error: 'Failed to get assignment status', details: error.message });
  }
});

// 恢复并增强：手动更新 assignment 发布状态
// PUT /api/uploads/assignment/:assignment_id/publish
router.put('/assignment/:assignment_id/publish', async (req, res) => {
  try {
    const { assignment_id } = req.params;
    const { is_published } = req.body;

    if (typeof is_published !== 'boolean') {
      return res.status(400).json({ error: 'is_published must be a boolean' });
    }

    // 获取 assignment 及其 project
    const assignmentResult = await db.query(
      'SELECT assignment_id, project_id, is_published, round FROM assignment WHERE assignment_id = $1',
      [assignment_id]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const projectId = assignmentResult.rows[0].project_id;
    const currentRound = parseInt(assignmentResult.rows[0].round);

    // 如果要发布，校验项目至少有 rubric 且至少有一个 assignment
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

    // 额外限制：round=2 发布前，要求 round=1 最新版本已发布
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
        error: '发布失败',
        message: '未找到作业1最新版本，请先提交作业1再尝试发布作业2'
      });
    }

    if (latestRound1.rows[0].is_published !== true) {
      return res.status(400).json({
        error: '发布失败',
        message: '请先发布作业1'
      });
    }
    }

    // 更新 assignment 发布状态
    const updateResult = await db.query(
      'UPDATE assignment SET is_published = $1 WHERE assignment_id = $2 RETURNING assignment_id, is_published, project_id',
      [is_published, assignment_id]
    );

    // 若发布成功且项目仍为 draft，则激活项目
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

    console.log(`📝 assignment 发布状态更新: assignment_id=${assignment_id}, is_published=${is_published}`);

    return res.json({
      message: 'Assignment publish status updated',
      assignment: {
        assignment_id: parseInt(updateResult.rows[0].assignment_id),
        is_published: updateResult.rows[0].is_published
      },
      ...(projectStatus && { project_status: projectStatus })
    });
  } catch (error) {
    console.error('❌ 更新assignment发布状态失败:', error);
    return res.status(500).json({ error: 'Failed to update assignment publish status', details: error.message });
  }
});

/**
 * Coordinator专用 - 批量设置/更新baseline分数
 * POST /api/uploads/scoring/baseline/batch
 */
router.post('/scoring/baseline/batch', async (req, res) => {
  try {
    const { assignment_id, scores } = req.body;

    // 验证必需字段
    if (!assignment_id || !scores || !Array.isArray(scores) || scores.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: assignment_id, scores (array)'
      });
    }

    // 验证assignment存在并且是最新版本
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

    // 开始事务
    const client = await db.connect();
    await client.query('BEGIN');

    try {
      for (let i = 0; i < scores.length; i++) {
        const { criterion_id, score, comment } = scores[i];

        // 验证单个分数项
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

        // 验证criterion存在且属于该project的最新rubric版本
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

        // 查找匹配的等级区间
        const gradeLevel = await findGradeLevelByScore(criterion_id, scoreValue);
        if (!gradeLevel) {
          errors.push({
            index: i,
            error: `Score ${scoreValue} does not match any grade level for this criterion`,
            data: scores[i]
          });
          continue;
        }

        // 插入或更新baseline_score
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

      console.log(`✅ 批量Baseline分数设置完成: assignment_id=${assignment_id}, 成功=${results.length}, 失败=${errors.length}`);

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
    console.error('❌ 批量设置baseline分数失败:', error);
    res.status(500).json({
      error: 'Failed to set batch baseline scores',
      details: error.message
    });
  }
});

/**
 * Coordinator专用 - 批量确认baseline分数
 * POST /api/uploads/scoring/baseline/submit
 */
router.post('/scoring/baseline/submit', async (req, res) => {
    try {
        // 1. 获取请求参数 - 现在接收criterion_ids数组
        const { assignment_id, criterion_ids } = req.body;

        // 2. 参数验证
        if (!assignment_id || !criterion_ids || !Array.isArray(criterion_ids) || criterion_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'assignment_id 和 criterion_ids 数组是必需的参数'
            });
        }

        // 3. 构建IN查询的占位符 ($1, $2, $3...)
        const placeholders = criterion_ids.map((_, index) => `$${index + 2}`).join(',');

        // 4. 批量更新数据库
        const query = `
            UPDATE baseline_score
            SET finalized = true
            WHERE assignment_id = $1
            AND criterion_id IN (${placeholders})
            RETURNING *
        `;

        const params = [assignment_id, ...criterion_ids];
        const result = await db.query(query, params);

        // 5. 返回成功响应
        res.json({
            success: true,
            message: `已成功确认 ${result.rowCount} 个baseline分数`,
            data: {
                updated_count: result.rowCount,
                updated_records: result.rows
            }
        });

    } catch (error) {
        console.error('批量确认baseline分数时出错:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});


/**
 * Marker专用 - 批量设置/更新marker分数
 * POST /api/uploads/scoring/marker/batch
 */
router.post('/scoring/marker/batch', async (req, res) => {
  try {
    const { assignment_id, marker_id, scores } = req.body;

    // 验证必需字段
    if (!assignment_id || !marker_id || !scores || !Array.isArray(scores) || scores.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: assignment_id, marker_id, scores (array)'
      });
    }

    // 验证assignment存在并且是最新版本
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

    // 开始事务
    const client = await db.connect();
    await client.query('BEGIN');

    try {
      for (let i = 0; i < scores.length; i++) {
        const { criterion_id, score, comment } = scores[i];

        // 验证单个分数项
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

        // 验证criterion存在且属于该project的最新rubric版本
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

        // 查找匹配的等级区间
        const gradeLevel = await findGradeLevelByScore(criterion_id, scoreValue);
        if (!gradeLevel) {
          errors.push({
            index: i,
            error: `Score ${scoreValue} does not match any grade level for this criterion`,
            data: scores[i]
          });
          continue;
        }

        // 插入或更新marker_score
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

      console.log(`✅ 批量Marker分数设置完成: assignment_id=${assignment_id}, marker_id=${marker_id}, 成功=${results.length}, 失败=${errors.length}`);

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
    console.error('❌ 批量设置marker分数失败:', error);
    res.status(500).json({
      error: 'Failed to set batch marker scores',
      details: error.message
    });
  }
});

/**
 * Marker专用 - 批量确认marker分数
 * POST /api/uploads/scoring/marker/submit
 */
router.post('/scoring/marker/submit', async (req, res) => {
    try {
        // 1. 获取请求参数
        const { assignment_id, marker_id, criterion_ids } = req.body;

        // 2. 参数验证
        if (!assignment_id || !marker_id || !criterion_ids || !Array.isArray(criterion_ids) || criterion_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'assignment_id, marker_id 和 criterion_ids 数组是必需的参数'
            });
        }

        // 3. 构建IN查询的占位符
        const placeholders = criterion_ids.map((_, index) => `$${index + 3}`).join(',');

        // 4. 批量更新数据库
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

        // 5. 返回成功响应
        res.json({
            success: true,
            message: `已成功确认 ${result.rowCount} 个marker分数`,
            data: {
                updated_count: result.rowCount,
                updated_records: result.rows
            }
        });

    } catch (error) {
        console.error('批量确认marker分数时出错:', error);
        res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
});


/**
 * 生成Assignment Moderation对比报告
 * GET /api/uploads/assignments/:assignment_id/moderation-report
 */
router.get('/assignments/:assignment_id/moderation-report', async (req, res) => {
  try {
    const { assignment_id } = req.params;

    // 验证assignment存在并且是最新版本
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

    // 获取基准分数和marker分数的完整数据
    const mainQuery = `
      SELECT 
        bs.criterion_id,
        rc.title as criterion_title,
        rc.max_score as criterion_max_score,
        rc.seq_no,
        bs.score as baseline_score,
        ms.marker_id,
        u.name as marker_name,
        ms.score as marker_score
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

    // 组织数据结构
    const criteriaMap = new Map();
    const markersMap = new Map();

    result.rows.forEach(row => {
      const criterionId = row.criterion_id;
      const markerId = row.marker_id;

      // 初始化criterion数据
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
          baseline_percentage: baselinePercentage, // 当前分数/最高分数的百分比
          range_lower: Math.round(baselineScore * 0.95 * 100) / 100, // ±5%
          range_upper: Math.round(baselineScore * 1.05 * 100) / 100,
          marker_scores: []
        });
      }

      // 添加marker分数（如果存在）
      if (markerId && row.marker_score !== null) {
        const markerScore = parseFloat(row.marker_score);
        const criterion = criteriaMap.get(criterionId);
        
        const withinRange = markerScore >= criterion.range_lower && markerScore <= criterion.range_upper;
        
        // 计算marker的百分比和与baseline的差异百分比
        const markerPercentage = Math.round((markerScore / criterion.max_score) * 100 * 100) / 100;
        const percentageDifference = Math.round((markerPercentage - criterion.baseline_percentage) * 100) / 100;
        
        criterion.marker_scores.push({
          marker_id: markerId,
          marker_name: row.marker_name,
          score: markerScore,
          percentage: markerPercentage, // 当前分数/最高分数的百分比
          percentage_difference: percentageDifference, // 与baseline的百分比差异，可正可负
          within_range: withinRange
        });

        // 初始化marker总分跟踪
        if (!markersMap.has(markerId)) {
          markersMap.set(markerId, {
            marker_id: markerId,
            marker_name: row.marker_name,
            total: 0,
            criteria_count: 0
          });
        }

        // 累计marker总分
        const markerTotal = markersMap.get(markerId);
        markerTotal.total += markerScore;
        markerTotal.criteria_count += 1;
      }
    });

    // 转换为数组并排序
    const criteria = Array.from(criteriaMap.values()).sort((a, b) => a.seq_no - b.seq_no);

    // 计算基准总分和最高总分
    const baselineTotal = criteria.reduce((sum, criterion) => sum + criterion.baseline_score, 0);
    const maxTotalScore = criteria.reduce((sum, criterion) => sum + criterion.max_score, 0);
    const baselineTotalRounded = Math.round(baselineTotal * 100) / 100;
    const baselineTotalPercentage = Math.round((baselineTotal / maxTotalScore) * 100 * 100) / 100;

    // 计算总分范围（±2.5%）
    const totalRangeLower = Math.round(baselineTotalRounded * 0.975 * 100) / 100;
    const totalRangeUpper = Math.round(baselineTotalRounded * 1.025 * 100) / 100;

    // 计算marker总分并判断范围
    const markerTotals = Array.from(markersMap.values()).map(marker => {
      const markerTotal = Math.round(marker.total * 100) / 100;
      const withinRange = markerTotal >= totalRangeLower && markerTotal <= totalRangeUpper;
      const difference = Math.abs(markerTotal - baselineTotalRounded);
      
      // 计算总分百分比和与baseline的差异百分比
      const markerTotalPercentage = Math.round((markerTotal / maxTotalScore) * 100 * 100) / 100;
      const totalPercentageDifference = Math.round((markerTotalPercentage - baselineTotalPercentage) * 100) / 100;

      return {
        marker_id: marker.marker_id,
        marker_name: marker.marker_name,
        total: markerTotal,
        percentage: markerTotalPercentage, // 总分百分比
        percentage_difference: totalPercentageDifference, // 与baseline总分的百分比差异，可正可负
        within_range: withinRange,
        difference: Math.round(difference * 100) / 100
      };
    });

    // 按差异大小排序（差异大的排在前面）
    markerTotals.sort((a, b) => b.difference - a.difference);

    // 构建响应
    const response = {
      assignment: {
        assignment_id: parseInt(assignment_id),
        name: assignment.name
      },
      criteria: criteria,
      totals: {
        baseline_total: baselineTotalRounded,
        baseline_percentage: baselineTotalPercentage, // baseline总分百分比
        max_total_score: maxTotalScore, // 最高总分
        range_lower: totalRangeLower,
        range_upper: totalRangeUpper,
        marker_totals: markerTotals
      },
      summary: {
        total_criteria: criteria.length,
        total_markers: markerTotals.length,
        markers_within_range: markerTotals.filter(m => m.within_range).length,
        markers_outside_range: markerTotals.filter(m => !m.within_range).length
      }
    };

    console.log(`✅ Moderation报告生成成功: assignment_id=${assignment_id}, criteria=${criteria.length}, markers=${markerTotals.length}`);

    res.json(response);

  } catch (error) {
    console.error('❌ 生成moderation报告失败:', error);
    res.status(500).json({
      error: 'Failed to generate moderation report',
      details: error.message
    });
  }
});

/**
 * 调试API - 检查assignment和rubric关系
 * GET /api/uploads/debug/assignment/:assignment_id/rubric-info
 */
router.get('/debug/assignment/:assignment_id/rubric-info', async (req, res) => {
  try {
    const { assignment_id } = req.params;

    // 获取assignment信息
    const assignmentResult = await db.query(
      'SELECT assignment_id, name, project_id FROM assignment WHERE assignment_id = $1',
      [assignment_id]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const assignment = assignmentResult.rows[0];
    const projectId = assignment.project_id;

    // 获取该project的所有rubric版本
    const rubricsResult = await db.query(
      'SELECT rubric_id, version, uploaded_by FROM rubric WHERE project_id = $1 ORDER BY version DESC',
      [projectId]
    );

    // 获取最新版本的criterion
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

    // 检查现有的baseline分数
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
    console.error('❌ 调试assignment rubric信息失败:', error);
    res.status(500).json({
      error: 'Failed to get assignment rubric debug info',
      details: error.message
    });
  }
});

/**
 * 调试API - 查找criterion属于哪个project和rubric
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

    // 检查是否是最新版本
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
    console.error('❌ 查找criterion信息失败:', error);
    res.status(500).json({
      error: 'Failed to get criterion info',
      details: error.message
    });
  }
});

//==========
// 新增接口：通过project_id获取最新的rubric_id
// GET /api/project/:project_id/latest-rubric
router.get('/project/:project_id/latest-rubric', async (req, res) => {
  try {
    const { project_id } = req.params;

    console.log(`🔍 通过project_id查找最新rubric: project_id=${project_id}`);

    // 查询该project_id下所有rubric，按version降序排列，取最新的一个
    const result = await db.query(`
      SELECT rubric_id, project_id, version, created_at
      FROM rubric
      WHERE project_id = $1
      ORDER BY version DESC
      LIMIT 1
    `, [project_id]);

    if (result.rows.length === 0) {
      console.log(`❌ 未找到project_id=${project_id}对应的rubric`);
      return res.status(404).json({
        error: 'No rubric found for this project',
        project_id: parseInt(project_id)
      });
    }

    const latestRubric = result.rows[0];
    console.log(`✅ 找到最新rubric: rubric_id=${latestRubric.rubric_id}, version=${latestRubric.version}`);

    res.json({
      project_id: parseInt(project_id),
      rubric_id: latestRubric.rubric_id,
      version: latestRubric.version,
      created_at: latestRubric.created_at
    });

  } catch (error) {
    console.error('❌ 获取最新rubric失败:', error);
    res.status(500).json({
      error: 'Failed to get latest rubric',
      details: error.message
    });
  }
});

//获取 assignment 关联的文件信息 - GET /api/uploads/assignment/:assignment_id/files
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
    console.error('❌ 获取assignment文件失败:', error);
    return res.status(500).json({ error: 'Failed to get assignment files' });
  }
});

module.exports = router;