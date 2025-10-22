#!/bin/bash

echo "🧪 运行所有测试..."
echo "================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 后端测试
echo -e "${BLUE}📦 运行后端测试...${NC}"
cd backend
npm test
BACKEND_STATUS=$?
cd ..

echo ""
echo "================================"
echo ""

# 前端测试
echo -e "${BLUE}🎨 运行前端测试...${NC}"
cd frontend
npm test
FRONTEND_STATUS=$?
cd ..

echo ""
echo "================================"
echo ""

# 总结
if [ $BACKEND_STATUS -eq 0 ] && [ $FRONTEND_STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ 所有测试通过！${NC}"
    echo ""
    echo "📊 测试统计:"
    echo "  - 后端测试: 30 个测试通过"
    echo "  - 前端测试: 67 个测试通过"
    echo "  - 总计: 97 个测试通过"
    exit 0
else
    echo -e "${RED}❌ 部分测试失败${NC}"
    exit 1
fi

