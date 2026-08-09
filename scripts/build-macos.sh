#!/bin/bash
# ============================================================
# macOS 打包脚本
# 在 macOS 上执行（Terminal 运行），生成 .dmg 安装包
#
# 用法：
#   1. 把整个项目文件夹拷到 Mac
#   2. 打开 Terminal，cd 到项目目录
#   3. chmod +x scripts/build-macos.sh
#   4. ./scripts/build-macos.sh
#
# 产物：release/透明桌面看板-0.2.0.dmg（含 Intel + Apple Silicon）
# 安装：双击 .dmg，拖到 Applications
# ============================================================
set -e

# 检测是否在 macOS 上运行
if [ "$(uname)" != "Darwin" ]; then
  echo "✗ 此脚本必须在 macOS 上运行"
  echo "  当前系统: $(uname)"
  echo "  Windows 版请用 npm run build:win"
  echo "  UOS/Linux 版请用 scripts/wsl-build-deb.sh"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "================================================"
echo "  macOS 打包 - 透明桌面看板 v0.2.0"
echo "================================================"
echo ""

# 检查 Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "✗ 未检测到 Node.js，请先安装：https://nodejs.org/"
  exit 1
fi
echo "✓ Node.js $(node --v)"

# 检查 npm
if ! command -v npm >/dev/null 2>&1; then
  echo "✗ 未检测到 npm"
  exit 1
fi
echo "✓ npm $(npm -v)"

echo ""
echo "[1/3] 安装依赖..."
npm install --no-audit --no-fund --loglevel=error
echo "  ✓ 依赖就绪"

echo ""
echo "[2/3] 打包（生成 .dmg，含 Intel + Apple Silicon）..."
# 使用国内镜像加速（如在海外可删除这两行）
export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"

npx electron-builder --mac
echo "  ✓ 打包完成"

echo ""
echo "[3/3] 验证产物..."
DMG=$(ls release/*.dmg 2>/dev/null | head -1)
if [ -z "$DMG" ]; then
  echo "✗ 未找到 .dmg 文件，请检查打包日志"
  exit 1
fi

echo ""
echo "================================================"
echo "  ✅ macOS 打包完成！"
echo "================================================"
ls -lh "$DMG"
echo ""
echo "📦 安装包：$DMG"
echo ""
echo "安装方式：双击 .dmg → 拖动应用到 Applications"
echo ""
echo "⚠️ 首次运行可能需要在 系统设置 → 隐私与安全 中允许运行"
echo "   （应用未签名，这是未上架应用的通用提示）"
echo ""
echo "⚠️ 全局快捷键需在 系统设置 → 隐私与安全 → 辅助功能 中授权"
