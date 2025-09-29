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

// 目录
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

// 1) 草稿上传：/api/uploads/drafts  (form-data: file, slot)
router.post('/drafts', draftUpload.single('file'), async (req, res) => {
  try {
    // slot: 'assignment1' | 'assignment2' | 'rubric'（前端传，用来知道是哪个窗口的文件）
    const slot = req.body.slot;
    if (!['assignment1','assignment2','rubric'].includes(slot)) {
      await fsp.unlink(req.file.path).catch(()=>{});
      return res.status(400).json({ error: 'invalid slot' });
    }
    
    // 验证文件类型
    const fileType = req.file.mimetype;
    
    // 调试：输出检测到的MIME类型
    console.log(`📋 文件调试信息:`, {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      slot: slot
    });
    
    // Assignment只能上传PDF
    if (slot === 'assignment1' || slot === 'assignment2') {
      if (fileType !== 'application/pdf') {
        await fsp.unlink(req.file.path).catch(()=>{});
        return res.status(400).json({ 
          error: 'Assignments only accept PDF files',
          detected_type: fileType 
        });
      }
    }
    
    // Rubric可以上传多种格式，但不能是PDF
    if (slot === 'rubric') {
      const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // DOCX
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        // XLSX
        'text/csv',                                                                  // CSV
        'application/vnd.ms-excel',                                                  // XLS (旧格式)
        'application/msword',                                                        // DOC (旧格式)
        'application/octet-stream'                                                   // 通用二进制格式（临时允许）
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
      // 可设置过期时间，后端定期清理
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString()
    };
    // 把 draft 信息存在内存不可行；这里简单返回，前端保留 draft_id+temp_name。
    // 若需要后端记忆，可把 draft 保存到 Redis/DB 临时表，这里从简由前端回传 temp_name。
    res.json(draft);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'draft upload failed' });
  }
});

// 2) 删除 Draft：/api/uploads/drafts/:tempName
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

// 注意：单个提交功能已移除，只支持批量提交
// 原 commit 路由已禁用，请使用 /api/uploads/batch-commit

// 4) 下载：/api/uploads/:id/download  （提交后才有）
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

// 4.5) 批量提交：/api/uploads/batch-commit (重新设计)
// 一次性创建一个完整的submission，包括1个rubric和2个assignment
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

    // 验证所有必需参数
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

    // 验证所有临时文件都存在
    const tempFiles = [
      { name: 'rubric', temp_name: rubric_temp_name },
      { name: 'assignment1', temp_name: assignment1_temp_name },
      { name: 'assignment2', temp_name: assignment2_temp_name }
    ];

    console.log('🔍 验证临时文件...');
    for (const file of tempFiles) {
      const tempAbs = path.join(TEMP_DIR, file.temp_name); // 直接使用完整的temp_name
      console.log(`检查文件: ${file.name} -> ${tempAbs}`);
      
      const stat = await fsp.stat(tempAbs).catch((error) => {
        console.log(`文件检查失败: ${error.message}`);
        return null;
      });
      
      if (!stat) {
        return res.status(404).json({ 
          error: `Draft file not found: ${file.name} (${file.temp_name})`,
          checked_path: tempAbs
        });
      }
      console.log(`✅ 文件存在: ${file.name}, 大小: ${stat.size} 字节`);
    }

    // 验证due date格式和顺序
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

    // 验证course_offering_id是否存在
    const offeringCheck = await client.query(
      'SELECT offering_id FROM course_offering WHERE offering_id = $1',
      [course_offering_id]
    );
    if (offeringCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid course_offering_id' });
    }

    // Step 1: 将现有的submission设为inactive，然后创建新的active submission
    console.log('📄 将现有submission设为inactive...');
    await client.query(
      `UPDATE submission SET active = false WHERE course_offering_id = $1 AND active = true`,
      [course_offering_id]
    );
    
    console.log('📄 创建新的 submission 记录...');
    const submissionResult = await client.query(
      `INSERT INTO submission (course_offering_id, active) 
       VALUES ($1, true) 
       RETURNING submission_id`,
      [course_offering_id]
    );
    const submissionId = submissionResult.rows[0].submission_id;
    console.log(`✅ Submission 创建成功: submission_id=${submissionId}`);

    // Step 2: 创建 rubric 记录
    console.log('📋 创建 rubric 记录...');
    const rubricResult = await client.query(
      `INSERT INTO rubric (uploaded_by, submission_id) 
       VALUES ($1, $2) 
       RETURNING rubric_id`,
      [owner_id || 1, submissionId] // 使用默认owner_id=1如果未提供
    );
    const rubricId = rubricResult.rows[0].rubric_id;
    console.log(`✅ Rubric 创建成功: rubric_id=${rubricId}`);

    // Step 3: 创建两个 assignment 记录 (round 1 和 round 2)
    console.log('📅 创建 assignment 记录...');
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
    console.log(`✅ Assignments 创建成功: assignment1_id=${assignment1Id}, assignment2_id=${assignment2Id}`);

    const uploadResults = [];

    // 处理所有文件
    console.log('📁 开始处理文件...');
    for (const file of tempFiles) {
      try {
        console.log(`\n处理文件: ${file.name}`);
        const tempAbs = path.join(TEMP_DIR, file.temp_name); // 直接使用完整的temp_name
        console.log(`临时文件路径: ${tempAbs}`);
        
        // 读取文件信息
        const ext = path.extname(tempAbs).replace('.','') || 'pdf';
        const mimeType = mime.lookup(ext) || 'application/pdf';
        const originalName = `${file.name}.${ext}`;
        console.log(`文件信息: ext=${ext}, mimeType=${mimeType}, originalName=${originalName}`);

        // 移动到永久目录
        const permDir = ensurePermDir();
        const finalName = `${uuidv4()}.${ext}`;
        const permAbs = path.join(permDir, finalName);
        const storagePath = path.relative(PERM_ROOT, permAbs).replace(/\\/g,'/');
        console.log(`目标路径: ${permAbs}`);
        console.log(`存储路径: ${storagePath}`);

        // 确定文件类型和关联
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
        console.log(`文件类型: ${fileType}, assignment_id=${targetAssignmentId}, rubric_id=${targetRubricId}`);

        // 插入数据库记录
        console.log('💾 插入数据库记录...');
        console.log(`插入参数: owner_id=${owner_id || null}, assignment_id=${targetAssignmentId}, rubric_id=${targetRubricId}`);
        
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
        console.log(`✅ 数据库记录插入成功: upload_id=${rows[0].upload_id}`);

        // 移动文件 - 使用copyFile + unlink 代替 rename 来解决跨文件系统问题
        console.log('📂 移动文件...');
        await fsp.copyFile(tempAbs, permAbs);
        await fsp.unlink(tempAbs);
        console.log(`✅ 文件移动成功: ${tempAbs} -> ${permAbs}`);

        uploadResults.push({
          file_type: file.name,
          upload_record: rows[0],
          preview_url: `/static/${rows[0].storage_path}`,
          download_url: `/api/uploads/${rows[0].upload_id}/download`
        });
      } catch (fileError) {
        console.error(`❌ 处理文件 ${file.name} 时出错:`, fileError);
        throw fileError; // 重新抛出错误以触发回滚
      }
    }

    await client.query('COMMIT');
    console.log('✅ 所有操作完成，事务提交成功!');

    // 解析rubric文件并更新行列数
    try {
      console.log('📊 开始解析rubric文件...');
      const rubricFile = uploadResults.find(file => file.file_type === 'rubric');
      if (rubricFile) {
        const rubricPath = path.join(PERM_ROOT, rubricFile.upload_record.storage_path);
        console.log(`📍 Rubric文件路径: ${rubricPath}`);
        console.log(`📄 Rubric文件MIME类型: ${rubricFile.upload_record.mime_type}`);
        
        // 检查文件是否存在
        const fileExists = await fsp.stat(rubricPath).catch(() => null);
        if (!fileExists) {
          console.error('❌ Rubric文件不存在:', rubricPath);
          return;
        }
        console.log(`✅ Rubric文件存在，大小: ${fileExists.size} 字节`);
        
        const { rows, columns } = await parseRubricFile(rubricPath, rubricFile.upload_record.mime_type);
        console.log(`🎯 解析结果: ${rows}行 x ${columns}列`);
        
        // 更新rubric表中的row和column字段
        await db.query(
          'UPDATE rubric SET "row" = $1, "column" = $2 WHERE rubric_id = $3',
          [rows, columns, rubricId]
        );
        
        console.log(`✅ Rubric表格信息已更新: ${rows}行 x ${columns}列`);
        
        // 在返回结果中包含表格信息
        uploadResults.forEach(file => {
          if (file.file_type === 'rubric') {
            file.table_info = { rows, columns };
          }
        });
      } else {
        console.log('⚠️ 没有找到rubric文件');
      }
    } catch (parseError) {
      console.error('❌ 解析rubric文件失败，但不影响主流程:', parseError);
      console.error('❌ 错误堆栈:', parseError.stack);
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

// 4.9) 调试：检查临时文件
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

// 5) 获取激活的submission：/api/uploads/active-submission
router.get('/active-submission/:offering_id', async (req, res) => {
  try {
    const { offering_id } = req.params;
    if (!offering_id) {
      return res.status(400).json({ error: 'offering_id is required' });
    }
    
    // 获取激活的submission及其相关信息
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

// 6) 发布验证：/api/uploads/publish
router.post('/publish', async (req, res) => {
  try {
    const { assignment_id } = req.body;
    if (!assignment_id) {
      return res.status(400).json({ error: 'assignment_id is required' });
    }
    
    // 检查assignment是否有due_date
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
    
    // 这里可以添加更多发布逻辑，比如更新状态等
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
