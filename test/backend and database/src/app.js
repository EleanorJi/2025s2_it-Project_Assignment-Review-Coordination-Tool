const express = require('express');
const path = require('path');
const uploadRoutes = require('./routes/uploads_v2');

const app = express();
app.use(express.json());

// 提交后文件的静态访问（用于预览）
app.use('/static', express.static(path.join(__dirname, '../uploads')));

app.use('/api/uploads', uploadRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on :${PORT}`));
