// 添加模块路径解析
const path = require('path');

// 现在导入模块
const request = require('supertest');
const express = require('express');
const fs = require('fs');

// 导入你的路由 - 修正路径（现在在同一层级）
const uploadRoutes = require('../src/routes/uploads_v2');

const app = express();
app.use(express.json());
app.use('/api/uploads', uploadRoutes);

// 测试文件路径 - 修正路径
const TEST_FILE_DIR = path.join(__dirname, 'test_files');
const ASSIGNMENT_PDF = path.join(TEST_FILE_DIR, 'assignment.pdf');
const RUBRIC_XLSX = path.join(TEST_FILE_DIR, 'rubric test.xlsx');

console.log('当前目录:', __dirname);
console.log('backend路径:', path.join(__dirname, '..'));
console.log('uploadRoutes路径:', path.join(__dirname, '../backend/src/routes/uploads_v2.js'));
console.log('测试文件目录:', TEST_FILE_DIR);
console.log('Assignment PDF路径:', ASSIGNMENT_PDF);
console.log('Rubric XLSX路径:', RUBRIC_XLSX);

// 确保测试文件存在
beforeAll(() => {
  if (!fs.existsSync(TEST_FILE_DIR)) {
    fs.mkdirSync(TEST_FILE_DIR, { recursive: true });
  }
  // 检查测试文件是否存在，如果不存在则创建空文件
  if (!fs.existsSync(ASSIGNMENT_PDF)) {
    console.log('创建测试用的 Assignment PDF 文件');
    fs.writeFileSync(ASSIGNMENT_PDF, '%PDF-1.4 mock pdf content');
  }
  if (!fs.existsSync(RUBRIC_XLSX)) {
    console.log('创建测试用的 Rubric XLSX 文件');
    fs.writeFileSync(RUBRIC_XLSX, 'mock xlsx content');
  }
});

describe('Uploads API Tests', () => {
  let projectId;
  let assignmentId;
  let rubricId;
  let tempName;

  // 增加超时时间
  jest.setTimeout(30000);

  // 测试创建项目
  test('POST /api/uploads/project - 创建项目', async () => {
    const res = await request(app)
      .post('/api/uploads/project')
      .send({
        name: 'Jest Test Project',
        description: '用于 Jest 测试的项目'
      })
      .expect(200);

    expect(res.body.project).toHaveProperty('project_id');
    expect(res.body.project.name).toBe('Jest Test Project');
    projectId = res.body.project.project_id;
    console.log('创建的项目 ID:', projectId);
  });

  // 测试上传草稿文件（Rubric）
  test('POST /api/uploads/drafts - 上传 Rubric 草稿', async () => {
    const res = await request(app)
      .post('/api/uploads/drafts')
      .field('slot', 'rubric')
      .attach('file', RUBRIC_XLSX)
      .expect(200);

    expect(res.body).toHaveProperty('draft_id');
    expect(res.body.slot).toBe('rubric');
    tempName = res.body.temp_name;
    console.log('Rubric 临时文件名:', tempName);
  });

  // 测试发布 Rubric 文件
  test('POST /api/uploads/commit - 发布 Rubric 文件', async () => {
    const res = await request(app)
      .post('/api/uploads/commit')
      .send({
        temp_name: tempName,
        project_id: projectId,
        file_type: 'rubric'
      })
      .expect(200);

    expect(res.body).toHaveProperty('rubric_id');
    rubricId = res.body.rubric_id;
    console.log('发布的 Rubric ID:', rubricId);
  });

  // 测试上传草稿文件（Assignment）
  test('POST /api/uploads/drafts - 上传 Assignment 草稿', async () => {
    const res = await request(app)
      .post('/api/uploads/drafts')
      .field('slot', 'assignment1')
      .attach('file', ASSIGNMENT_PDF)
      .expect(200);

    expect(res.body.slot).toBe('assignment1');
    tempName = res.body.temp_name;
    console.log('Assignment 临时文件名:', tempName);
  });

  // 测试发布 Assignment 文件
  test('POST /api/uploads/commit - 发布 Assignment 文件', async () => {
    const res = await request(app)
      .post('/api/uploads/commit')
      .send({
        temp_name: tempName,
        project_id: projectId,
        file_type: 'assignment',
        round: 1,
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .expect(200);

    expect(res.body).toHaveProperty('assignment_id');
    assignmentId = res.body.assignment_id;
    console.log('发布的 Assignment ID:', assignmentId);
  });

  // 测试获取项目状态
  test('GET /api/uploads/project/:project_id/status - 获取项目状态', async () => {
    const res = await request(app)
      .get(`/api/uploads/project/${projectId}/status`)
      .expect(200);

    expect(res.body.project.project_id).toBe(projectId);
    expect(res.body.status_info.has_rubric).toBe(true);
    expect(res.body.status_info.has_assignments).toBe(true);
  });

  // 简化测试：只测试基本功能
  test('GET /api/uploads/projects - 获取所有项目', async () => {
    const res = await request(app)
      .get('/api/uploads/projects')
      .expect(200);

    expect(Array.isArray(res.body.projects)).toBe(true);
  });

  // 测试删除项目
  test('DELETE /api/uploads/project/:project_id - 删除项目', async () => {
    const res = await request(app)
      .delete(`/api/uploads/project/${projectId}`)
      .expect(200);

    expect(res.body.deleted_project.project_id).toBe(projectId);
  });
});

// 清理测试文件
afterAll(() => {
  console.log('清理测试环境...');
  // 这里可以选择是否删除测试文件
  // 如果保留测试文件，下次测试可以重复使用
});