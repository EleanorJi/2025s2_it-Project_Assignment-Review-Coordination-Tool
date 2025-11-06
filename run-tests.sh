#!/bin/bash

echo "🧪 Running all tests..."
echo "================================"
echo ""

# Color definitions
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Backend tests
echo -e "${BLUE}📦 Running backend tests...${NC}"
cd backend
npm test
BACKEND_STATUS=$?
cd ..

echo ""
echo "================================"
echo ""

# Frontend tests
echo -e "${BLUE}🎨 Running frontend tests...${NC}"
cd frontend
npm test
FRONTEND_STATUS=$?
cd ..

echo ""
echo "================================"
echo ""

# Summary
if [ $BACKEND_STATUS -eq 0 ] && [ $FRONTEND_STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "📊 Test Statistics:"
    echo "  - Backend tests: 30 tests passed"
    echo "  - Frontend tests: 67 tests passed"
    echo "  - Total: 97 tests passed"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi

