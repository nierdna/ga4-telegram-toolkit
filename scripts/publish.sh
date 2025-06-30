#!/bin/bash

# Script để publish phiên bản mới lên npm

# Màu sắc cho output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Kiểm tra đã đăng nhập npm chưa
echo -e "${YELLOW}Kiểm tra trạng thái đăng nhập npm...${NC}"
npm whoami &> /dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}Bạn chưa đăng nhập npm. Đăng nhập ngay:${NC}"
    npm login
fi

# Lấy phiên bản hiện tại
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${YELLOW}Phiên bản hiện tại: ${CURRENT_VERSION}${NC}"

# Kiểm tra và yêu cầu loại phiên bản
echo -e "${YELLOW}Chọn loại phiên bản cần tăng:${NC}"
echo "1) patch (1.0.0 -> 1.0.1) - Fix lỗi nhỏ"
echo "2) minor (1.0.0 -> 1.1.0) - Thêm tính năng, tương thích ngược"
echo "3) major (1.0.0 -> 2.0.0) - Thay đổi lớn, có thể không tương thích ngược"
read -p "Nhập lựa chọn (1-3): " VERSION_CHOICE

case $VERSION_CHOICE in
    1)
        VERSION_TYPE="patch"
        ;;
    2)
        VERSION_TYPE="minor"
        ;;
    3)
        VERSION_TYPE="major"
        ;;
    *)
        echo -e "${RED}Lựa chọn không hợp lệ. Thoát.${NC}"
        exit 1
        ;;
esac

# Build dự án
echo -e "${YELLOW}Đang build dự án...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}Build thất bại! Thoát.${NC}"
    exit 1
fi

# Tăng phiên bản
echo -e "${YELLOW}Đang tăng phiên bản (${VERSION_TYPE})...${NC}"
npm version $VERSION_TYPE --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}Phiên bản mới: ${NEW_VERSION}${NC}"

# Kiểm tra nội dung sẽ publish
echo -e "${YELLOW}Kiểm tra nội dung sẽ publish:${NC}"
npm pack --dry-run

# Xác nhận publish
read -p "Bạn có chắc chắn muốn publish phiên bản này? (y/n): " CONFIRM
if [[ $CONFIRM != "y" && $CONFIRM != "Y" ]]; then
    echo -e "${YELLOW}Đã hủy quá trình publish.${NC}"
    exit 0
fi

# Publish lên npm
echo -e "${YELLOW}Đang publish lên npm...${NC}"
npm publish

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Publish thành công phiên bản ${NEW_VERSION}!${NC}"
    
    # Đề xuất commit và tạo git tag
    read -p "Commit thay đổi và tạo git tag cho phiên bản mới? (y/n): " CREATE_TAG
    if [[ $CREATE_TAG == "y" || $CREATE_TAG == "Y" ]]; then
        git add package.json
        git commit -m "chore: bump version to ${NEW_VERSION}"
        git tag v$NEW_VERSION
        git push && git push --tags
        echo -e "${GREEN}✅ Đã commit, tạo và push tag v${NEW_VERSION}${NC}"
    fi
else
    echo -e "${RED}❌ Publish thất bại!${NC}"
    echo -e "${YELLOW}Đang khôi phục phiên bản cũ...${NC}"
    # Sửa lại version cũ trong package.json
    npm version $CURRENT_VERSION --no-git-tag-version --allow-same-version
fi 