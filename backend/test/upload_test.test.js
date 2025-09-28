const path = require('path');
const request = require('supertest');
const express = require('express');
const fs = require('fs');
const multer = require('multer');

// 模拟数据库模块
jest.mock('../src/config/database', () => {
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
    on: jest.fn()
  };

  const mockClient = {
    query: jest.fn(),
    release: jest.fn()
  };

  return {
    query: jest.fn(),
    connect: jest.fn(() => Promise.resolve(mockClient)),
    pool: mockPool
  };
});

// 模拟文件解析模块
jest.mock('../src/utils/fileParser', () => ({
  parseRubricFile: jest.fn().mockResolvedValue({ rows: 5, columns: 3 })
}));

jest.mock('../src/utils/enhanced_rubric_parser', () => ({
  parseRubricWithDetails: jest.fn().mockResolvedValue({
    rows: 5,
    columns: 3,
    criteria: [
      { seq_no: 1, title: 'Criterion 1', description: 'Desc 1', max_score: 10 },
      { seq_no: 2, title: 'Criterion 2', description: 'Desc 2', max_score: 20 }
    ],
    gradeLevels: [
      { criterion_seq_no: 1, level_name: 'Excellent', min_score: 8, max_score: 10, description: 'Excellent work', seq_no: 1 },
      { criterion_seq_no: 1, level_name: 'Good', min_score: 5, max_score: 7, description: 'Good work', seq_no: 2 }
    ]
  })
}));

// 必须在 mock 之后导入路由
const uploadRoutes = require('../src/routes/uploads_v2');
const mockDb = require('../src/config/database');

const app = express();
app.use(express.json());
app.use('/api/uploads', uploadRoutes);

// 测试文件路径
const TEST_FILE_DIR = path.join(__dirname, 'test_files');
const ASSIGNMENT_PDF = path.join(TEST_FILE_DIR, 'assignment.pdf');
const RUBRIC_XLSX = path.join(TEST_FILE_DIR, 'rubric.xlsx');
const RUBRIC_DOCX = path.join(TEST_FILE_DIR, 'rubric.docx');

// 设置模拟响应和测试文件
beforeAll(() => {
  // 确保测试文件目录存在
  if (!fs.existsSync(TEST_FILE_DIR)) {
    fs.mkdirSync(TEST_FILE_DIR, { recursive: true });
  }

  // 创建测试文件
  if (!fs.existsSync(ASSIGNMENT_PDF)) {
    fs.writeFileSync(ASSIGNMENT_PDF, '%PDF-1.4 mock pdf content');
  }
  if (!fs.existsSync(RUBRIC_XLSX)) {
    fs.writeFileSync(RUBRIC_XLSX, 'mock xlsx content');
  }
  if (!fs.existsSync(RUBRIC_DOCX)) {
    fs.writeFileSync(RUBRIC_DOCX, 'mock docx content');
  }

  // 设置默认的模拟实现
  mockDb.query.mockImplementation((sql, params) => {
    console.log('模拟数据库查询:', sql.substring(0, 100) + '...');

    // 项目相关查询
    if (sql.includes('INSERT INTO project')) {
      return Promise.resolve({
        rows: [{ project_id: 1, name: 'Test Project', status: 'draft', created_at: new Date() }],
        rowCount: 1
      });
    }
    if (sql.includes('SELECT project_id FROM project WHERE project_id')) {
      return Promise.resolve({ rows: [{ project_id: 1 }], rowCount: 1 });
    }
    if (sql.includes('SELECT * FROM project WHERE project_id')) {
      return Promise.resolve({
        rows: [{ project_id: 1, name: 'Test Project', status: 'draft', created_at: new Date() }],
        rowCount: 1
      });
    }
    if (sql.includes('SELECT COUNT(*) FROM project')) {
      return Promise.resolve({ rows: [{ count: 1 }], rowCount: 1 });
    }
    if (sql.includes('SELECT name FROM project WHERE name')) {
      return Promise.resolve({ rows: [{ project_id: 1, name: 'Test Project' }], rowCount: 1 });
    }

    // 文件上传相关查询
    if (sql.includes('INSERT INTO rubric')) {
      return Promise.resolve({
        rows: [{ rubric_id: 1 }],
        rowCount: 1
      });
    }
    if (sql.includes('INSERT INTO assignment')) {
      return Promise.resolve({
        rows: [{ assignment_id: 1, is_published: false }],
        rowCount: 1
      });
    }
    if (sql.includes('INSERT INTO upload')) {
      return Promise.resolve({
        rows: [{ upload_id: 1 }],
        rowCount: 1
      });
    }
    if (sql.includes('SELECT MAX(version) FROM rubric')) {
      return Promise.resolve({ rows: [{ next_version: 1 }], rowCount: 1 });
    }
    if (sql.includes('SELECT MAX(version) FROM assignment')) {
      return Promise.resolve({ rows: [{ next_version: 1 }], rowCount: 1 });
    }
    if (sql.includes('SELECT status FROM project')) {
      return Promise.resolve({ rows: [{ status: 'draft' }], rowCount: 1 });
    }
    if (sql.includes('SELECT 1 FROM assignment WHERE project_id') && sql.includes('is_published = true')) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }

    // 项目状态查询
    if (sql.includes('FROM project p ORDER BY created_at DESC')) {
      return Promise.resolve({
        rows: [{
          project_id: 1,
          name: 'Test Project',
          description: 'Test Description',
          status: 'draft',
          created_at: new Date(),
          rubric_count: 1,
          assignment_count: 2
        }],
        rowCount: 1
      });
    }

    // 文件下载查询
    if (sql.includes('SELECT file_name, storage_path, mime_type FROM upload')) {
      return Promise.resolve({
        rows: [{
          file_name: 'test.pdf',
          storage_path: '2024/01/test.pdf',
          mime_type: 'application/pdf'
        }],
        rowCount: 1
      });
    }

    // 默认返回空结果
    return Promise.resolve({ rows: [], rowCount: 0 });
  });

  mockDb.connect.mockImplementation(() => {
    const mockClient = {
      query: jest.fn((sql, params) => {
        console.log('模拟客户端查询:', sql.substring(0, 100) + '...');

        if (sql.includes('INSERT INTO')) {
          return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1 });
        }
        if (sql.includes('SELECT')) {
          return Promise.resolve({ rows: [{}], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
      release: jest.fn()
    };
    return Promise.resolve(mockClient);
  });
});

describe('Uploads API Tests (全面测试)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. 项目管理测试
  describe('项目管理 APIs', () => {
    test('POST /api/uploads/project - 创建项目', async () => {
      const res = await request(app)
        .post('/api/uploads/project')
        .send({
          name: 'Jest Test Project',
          description: '用于 Jest 测试的项目'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('project');
      expect(res.body.project).toHaveProperty('project_id');
      expect(res.body.project.name).toBe('Test Project');
    });

    test('PUT /api/uploads/project/:project_id - 更新项目', async () => {
      const res = await request(app)
        .put('/api/uploads/project/1')
        .send({
          name: 'Updated Project Name',
          description: 'Updated description'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('project');
    });

    test('GET /api/uploads/projects - 获取项目列表', async () => {
      const res = await request(app).get('/api/uploads/projects');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('projects');
      expect(Array.isArray(res.body.projects)).toBe(true);
    });

    test('GET /api/uploads/project/:project_id/status - 获取项目状态', async () => {
      // 模拟项目状态查询
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ project_id: 1, name: 'Test', status: 'draft' }] }) // 项目查询
        .mockResolvedValueOnce({ rows: [] }) // rubric查询
        .mockResolvedValueOnce({ rows: [] }); // assignments查询

      const res = await request(app).get('/api/uploads/project/1/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('project');
      expect(res.body).toHaveProperty('status_info');
    });

    test('DELETE /api/uploads/project/:project_id - 删除项目', async () => {
      const res = await request(app).delete('/api/uploads/project/1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });
  });

  // 2. 文件上传测试
  describe('文件上传 APIs', () => {
    test('POST /api/uploads/drafts - 上传PDF作业文件', async () => {
      const res = await request(app)
        .post('/api/uploads/drafts')
        .field('slot', 'assignment1')
        .attach('file', ASSIGNMENT_PDF);

      expect(res.status).toBe(200);
      expect(res.body.slot).toBe('assignment1');
      expect(res.body).toHaveProperty('draft_id');
    });

    test('POST /api/uploads/drafts - 上传Rubric文件', async () => {
      const res = await request(app)
        .post('/api/uploads/drafts')
        .field('slot', 'rubric')
        .attach('file', RUBRIC_XLSX);

      expect(res.status).toBe(200);
      expect(res.body.slot).toBe('rubric');
    });

    test('POST /api/uploads/drafts - 验证文件类型限制', async () => {
      // 测试Rubric不能是PDF
      const res = await request(app)
        .post('/api/uploads/drafts')
        .field('slot', 'rubric')
        .attach('file', ASSIGNMENT_PDF);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Rubric files cannot be PDF');
    });

    test('DELETE /api/uploads/drafts/:tempName - 删除草稿文件', async () => {
      const res = await request(app).delete('/api/uploads/drafts/test-file.tmp');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });
  });

  // 3. 文件提交测试
  describe('文件提交 APIs', () => {
    test('POST /api/uploads/commit - 提交Rubric文件', async () => {
      // 创建临时文件用于测试
      const tempFilePath = path.join(__dirname, '../../temp_uploads/test-rubric.tmp');
      const metadataPath = tempFilePath + '.metadata.json';

      // 确保目录存在
      fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });
      fs.writeFileSync(tempFilePath, 'test content');
      fs.writeFileSync(metadataPath, JSON.stringify({
        original_name: 'rubric.xlsx',
        mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }));

      const res = await request(app)
        .post('/api/uploads/commit')
        .send({
          temp_name: 'test-rubric.tmp',
          project_id: 1,
          file_type: 'rubric'
        });

      // 清理测试文件
      try {
        fs.unlinkSync(tempFilePath);
        fs.unlinkSync(metadataPath);
      } catch (e) {}

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('upload_id');
    });

    test('POST /api/uploads/commit - 提交Assignment文件', async () => {
      const tempFilePath = path.join(__dirname, '../../temp_uploads/test-assignment.tmp');
      const metadataPath = tempFilePath + '.metadata.json';

      fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });
      fs.writeFileSync(tempFilePath, 'test content');
      fs.writeFileSync(metadataPath, JSON.stringify({
        original_name: 'assignment.pdf',
        mime_type: 'application/pdf'
      }));

      const res = await request(app)
        .post('/api/uploads/commit')
        .send({
          temp_name: 'test-assignment.tmp',
          project_id: 1,
          file_type: 'assignment',
          round: 1,
          due_date: new Date(Date.now() + 86400000).toISOString()
        });

      // 清理测试文件
      try {
        fs.unlinkSync(tempFilePath);
        fs.unlinkSync(metadataPath);
      } catch (e) {}

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('upload_id');
    });
  });

  // 4. 文件下载测试
  describe('文件下载 APIs', () => {
    test('GET /api/uploads/:id/download - 下载文件', async () => {
      // 确保下载文件存在
      const filePath = path.join(__dirname, '../../uploads/2024/01/test.pdf');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, 'test content');

      const res = await request(app).get('/api/uploads/1/download');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
    });
  });

  // 5. 项目激活测试
  describe('项目激活 APIs', () => {
    test('POST /api/uploads/project/:project_id/activate - 激活项目', async () => {
      // 模拟存在已发布的assignment
      mockDb.query.mockResolvedValueOnce({ rows: [{ project_id: 1 }] }) // 项目检查
                .mockResolvedValueOnce({ rows: [{ exists: 1 }] }); // 已发布assignment检查

      const res = await request(app).post('/api/uploads/project/1/activate');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'active');
    });

    test('POST /api/uploads/project/:project_id/publish - 发布项目（兼容路由）', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ project_id: 1 }] })
                .mockResolvedValueOnce({ rows: [{ exists: 1 }] });

      const res = await request(app).post('/api/uploads/project/1/publish');

      expect(res.status).toBe(200);
    });
  });

  // 6. 评分功能测试
  describe('评分功能 APIs', () => {
    test('POST /api/uploads/scoring/baseline - 设置基准分数', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ assignment_id: 1, project_id: 1, version: 1, round: 1 }] })
                .mockResolvedValueOnce({ rows: [{ criterion_id: 1, max_score: 10, rubric_id: 1, version: 1 }] })
                .mockResolvedValueOnce({ rows: [{
                  grade_level_id: 1, criterion_id: 1, level_name: 'Good',
                  min_score: 5, max_score: 7, description: 'Good work'
                }] })
                .mockResolvedValueOnce({ rows: [{ baseline_id: 1, assignment_id: 1, criterion_id: 1, score: 6 }] });

      const res = await request(app)
        .post('/api/uploads/scoring/baseline')
        .send({
          assignment_id: 1,
          criterion_id: 1,
          score: 6,
          comment: 'Good work'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('baseline_score');
    });

    test('POST /api/uploads/score-lookup - 分数查找', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ criterion_id: 1, title: 'Test Criterion', max_score: 10 }] })
                .mockResolvedValueOnce({ rows: [{
                  grade_level_id: 1, level_name: 'Good', min_score: 5, max_score: 7,
                  description: 'Good work', seq_no: 1
                }] });

      const res = await request(app)
        .post('/api/uploads/score-lookup')
        .send({
          criterion_id: 1,
          score: 6
        });

      expect(res.status).toBe(200);
      expect(res.body.match_type).toBe('exact');
    });
  });

  // 7. 调试工具测试
  describe('调试工具 APIs', () => {
    test('GET /api/uploads/debug/temp-files - 获取临时文件列表', async () => {
      const res = await request(app).get('/api/uploads/debug/temp-files');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('file_count');
    });

    test('DELETE /api/uploads/debug/temp-files - 清理临时文件', async () => {
      const res = await request(app)
        .delete('/api/uploads/debug/temp-files')
        .query({ older_than_hours: 24 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('deleted_count');
    });
  });

  // 8. 错误处理测试
  describe('错误处理', () => {
    test('POST /api/uploads/commit - 缺少必需参数', async () => {
      const res = await request(app)
        .post('/api/uploads/commit')
        .send({}); // 空请求体

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    test('GET /api/uploads/project/999/status - 不存在的项目', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // 模拟项目不存在

      const res = await request(app).get('/api/uploads/project/999/status');

      expect(res.status).toBe(404);
    });
  });

  // 9. 新增接口测试
  describe('新增接口测试', () => {
    test('GET /api/uploads/project/:project_id/latest-ids - 获取最新ID', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ rubric_id: 1, version: 1 }] }) // rubric
        .mockResolvedValueOnce({ rows: [{ assignment_id: 2, version: 1 }] }) // assignment1
        .mockResolvedValueOnce({ rows: [{ assignment_id: 3, version: 1 }] }); // assignment2

      const res = await request(app).get('/api/uploads/project/1/latest-ids');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('rubric');
      expect(res.body).toHaveProperty('assignment1');
      expect(res.body).toHaveProperty('assignment2');
    });

    test('PUT /api/uploads/assignment/:assignment_id/publish - 发布作业', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ assignment_id: 1, project_id: 1, is_published: false, round: 1 }] })
        .mockResolvedValueOnce({ rows: [{ exists: 1 }] }) // rubric检查
        .mockResolvedValueOnce({ rows: [{ exists: 1 }] }) // assignment检查
        .mockResolvedValueOnce({ rows: [{ is_published: true }] }) // round1检查
        .mockResolvedValueOnce({ rows: [{ assignment_id: 1, is_published: true }] }) // 更新结果
        .mockResolvedValueOnce({ rows: [{ status: 'active' }] }); // 项目状态检查

      const res = await request(app)
        .put('/api/uploads/assignment/1/publish')
        .send({ is_published: true });

      expect(res.status).toBe(200);
      expect(res.body.assignment.is_published).toBe(true);
    });
  });
});

afterAll(() => {
  // 注释掉文件清理，保留所有测试文件用于调试
  /*
  try {
    if (fs.existsSync(TEST_FILE_DIR)) {
      fs.rmSync(TEST_FILE_DIR, { recursive: true });
    }

    const tempDirs = [
      path.join(__dirname, '../../temp_uploads'),
      path.join(__dirname, '../../uploads/2024')
    ];

    tempDirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
    });
  } catch (error) {
    console.log('清理文件时出错:', error.message);
  }
  */

  console.log('所有测试完成 - 测试文件已保留');
});