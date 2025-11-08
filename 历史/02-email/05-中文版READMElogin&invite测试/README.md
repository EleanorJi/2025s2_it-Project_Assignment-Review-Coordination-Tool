# IT-Project-80
Repository for IT Project - Group 80

Project: Assignment Moderation Tool

## Team Members

**Scrum Master:** Hanyu Ji

**Product Owner:** Ruonan Xiong

**Team Members:**
- Hanyu Ji, 1400387, hanyuj2@student.unimelb.edu.au
- Ruonan Xiong, 1345959, xionrx@student.unimelb.edu.au
- Yuqiao Cui, 1407018, yuqcui1@student.unimelb.edu.au
- Renchuan Xu, 1473816, renchuanx@student.unimelb.edu.au
- Yangchenxu Zhang, 1393078, yangchenxuz@student.unimelb.edu.au

## Project Structure

```
assignment-moderation-tool/
├── README.md
├── .gitignore
├── docker-compose.yml          # Local development environment
├── 
├── backend/                    # Node.js API Service
│   ├── package.json
│   ├── .env.example
│   ├── .env                   # Local environment variables
│   ├── src/
│   │   ├── app.js            # Main application file
│   │   ├── config/           # Configuration files
│   │   │   ├── database.js
│   │   │   ├── auth.js
│   │   │   └── constants.js
│   │   ├── middleware/       # Middleware
│   │   │   ├── auth.js
│   │   │   ├── validation.js
│   │   │   └── errorHandler.js
│   │   ├── routes/           # Modularized routes
│   │   │   ├── index.js
│   │   │   ├── auth.js
│   │   │   ├── invitations.js
│   │   │   ├── assignments.js
│   │   │   └── scoring.js
│   │   ├── controllers/      # Controllers
│   │   │   ├── authController.js
│   │   │   ├── invitationController.js
│   │   │   └── assignmentController.js
│   │   ├── models/           # Data models
│   │   │   ├── User.js
│   │   │   ├── Assignment.js
│   │   │   └── Submission.js
│   │   ├── services/         # Business logic
│   │   │   ├── authService.js
│   │   │   ├── emailService.js
│   │   │   └── scoringService.js
│   │   └── utils/            # Utility functions
│   │       ├── encryption.js
│   │       ├── validation.js
│   │       └── helpers.js
│   └── tests/               # Test files
│       ├── unit/
│       └── integration/
├── 
├── frontend/                # React/Vue Frontend Application
│   ├── package.json
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── main.js          # Entry file
│   │   ├── App.vue          # Main component
│   │   ├── router/          # Routing configuration
│   │   ├── components/      # Common components
│   │   │   ├── common/
│   │   │   ├── forms/
│   │   │   └── layout/
│   │   ├── views/           # Page components
│   │   │   ├── Login.vue
│   │   │   ├── Signup.vue
│   │   │   ├── Dashboard.vue
│   │   │   └── Assignment/
│   │   ├── stores/          # State management
│   │   │   ├── auth.js
│   │   │   └── assignments.js
│   │   ├── services/        # API calls
│   │   │   ├── api.js
│   │   │   ├── auth.js
│   │   │   └── assignments.js
│   │   ├── utils/           # Utility functions
│   │   └── assets/          # Static resources
│   └── dist/               # Build output
│
├── database/               # Database related
│   ├── migrations/         # Database migrations
│   │   ├── 001_initial.sql
│   │   └── 002_add_indexes.sql
│   ├── seeds/             # Initial data
│   │   └── initial_data.sql
│   └── scripts/           # Database scripts
│       ├── setup.sh
│       └── backup.sh
│
├── docs/                  # Documentation
│   ├── API.md            # API documentation
│   ├── DATABASE.md       # Database design documentation
│   └── DEPLOYMENT.md     # Deployment documentation
│
└── scripts/              # Deployment and development scripts
    ├── dev-start.sh
    ├── build.sh
    └── deploy.sh
```

## 登录和邀请测试步骤：

1. 在本地创建数据库。
   - 确保你已经安装了PostgreSQL数据库。如果没有安装，可以从[PostgreSQL官网](https://www.postgresql.org/download/)下载并安装。
   - 打开数据库pgAdmin4（如果找不到可以开始界面搜索pgAdmin4）
   - 登录你的PostgreSQL服务器（通常是localhost，端口5432，用户名postgres，密码是你安装时设置的密码）。
   - 创建一个新的数据库，命名为`assignment_mod`。
   - 设置一个初始用户（例如用户名`admin`，密码`password`），并确保该用户对`assignment_mod`数据库有所有权限。
   - 插入一个初始admin的数据库表中，可以使用以下SQL命令：
     ```sql
     INSERT INTO app_user (name, email, password_hash, role, is_active)
     VALUES (
      'admin',
      'admin@grading.com',
      -- 这里需要填入加密后的密码，不是明文！详见下面的密码加密说明
      'admin123',
      'COORDINATOR',
      true
     );
     ```
   - 确保backend/src/config/database.js中的数据库连接配置与你的数据库设置匹配（例如用户名、密码-是你安装时设置的密码、主机和端口）。
2. 启动后端服务器：
   - 确保你已经安装了所有依赖项（`npm install`,`node.js`,`express`等）。
   - 打开在当前项目位置终端
   - 运行 `node backend/src/app.js` 启动服务器。
3. 测试login：
   1. 登录 `http://localhost:3000/login.html`
      应该可以看到这样的界面
      ![img.png](img.png)
   2. 输入刚刚的admin邮箱和密码
   
      如果用的是上面的的sql，那就输入：
         - 邮箱/用户名：admin@grading.com/admin
         - 密码：admin123
      
      应该可以看到 "Login successful!"：
      ![img_1.png](img_1.png)

4. 测试invitation
   1. 打开postman输入POST http://localhost:3000/api/invitations
   2. 带上headers
        ```
        Content-Type: application/json
        x-user-id: 1
        ```
        ![img_2.png](img_2.png)
   3. 在Body中选择raw，选择JSON格式，输入以下内容：
      ```json
      {
       "email": "marker1@example.com"
      }
       ```
   4. 点击Send按钮
   5. 在终端中，复制token得到的token: XXX
   6. 打开浏览器，输入http://localhost:3000/signup.html?token=XXX
      
      会看到这样的界面：
      ![img_3.png](img_3.png)
      输入用户名和密码，，勾选同意条款，点击Sign Up
   7. 如果成功会看到
      ![img_4.png](img_4.png)
      点击Sign in跳转到登录页面
   8. 会回到刚刚的login界面
      ![img_5.png](img_5.png)
   9. 输入刚刚注册的邮箱和密码
      - 邮箱/用户名：
      - 密码：
   10. 点击Sign In会得到 "Login successful!"：
      ![img_6.png](img_6.png)