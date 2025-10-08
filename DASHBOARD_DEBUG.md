# Dashboard API 调试指南

## 问题诊断

如果dashboard没有显示数据，请按以下步骤检查：

### 1. 检查浏览器控制台
1. 打开浏览器开发者工具 (F12)
2. 查看 Console 标签页
3. 刷新dashboard页面
4. 查看是否有以下日志：
   - `🔄 Loading coordinator/marker dashboard data...`
   - `📡 Response status: 200`
   - `✅ Dashboard data loaded: {...}`

### 2. 检查API端点
在浏览器中直接访问以下URL测试API：
- Coordinator: `http://localhost:3000/dashboard/api/coordinator/data`
- Marker: `http://localhost:3000/dashboard/api/marker/data`

### 3. 检查数据库连接
确保数据库服务正在运行，并且包含测试数据。

### 4. 添加测试数据
运行以下SQL脚本添加测试数据：
```sql
-- 在数据库中执行 test_data.sql 文件
\i /path/to/test_data.sql
```

### 5. 检查用户认证
确保用户已正确登录，并且：
- Coordinator用户有 `COORDINATOR` 角色
- Marker用户有 `MARKER` 角色

### 6. 常见错误

#### 403 Forbidden
- 用户未登录或角色不正确
- 检查cookie中的userId

#### 500 Internal Server Error
- 数据库连接问题
- SQL查询错误
- 检查服务器日志

#### 404 Not Found
- API路由未正确注册
- 检查 `/backend/src/routes/page.js` 中的dashboard路由

### 7. 手动测试API
使用curl命令测试：
```bash
# 测试coordinator API
curl -X GET "http://localhost:3000/dashboard/api/coordinator/data" \
  -H "Cookie: userId=1"

# 测试marker API  
curl -X GET "http://localhost:3000/dashboard/api/marker/data" \
  -H "Cookie: userId=2"
```

## 修复步骤

1. **确保数据库有数据**：
   ```sql
   SELECT COUNT(*) FROM project;
   SELECT COUNT(*) FROM assignment;
   SELECT COUNT(*) FROM app_user;
   ```

2. **检查API路由**：
   - 确认 `/backend/src/routes/page.js` 包含dashboard路由
   - 确认 `/backend/src/routes/dashboard.js` 包含API端点

3. **检查数据库字段**：
   - `feedback.content` (不是 `comment`)
   - `invitations` 表名 (不是 `invitation`)
   - `assignment.is_published` (不是 `status`)

4. **重启服务器**：
   ```bash
   cd backend
   npm start
   ```

## 预期结果

成功连接后，dashboard应该显示：
- **Coordinator**: 活跃项目数、总marker数、待处理邀请数、已完成作业数
- **Marker**: 待处理任务数、已完成任务数、最近反馈数

如果仍然没有数据，请检查数据库中的实际数据内容。
