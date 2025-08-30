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