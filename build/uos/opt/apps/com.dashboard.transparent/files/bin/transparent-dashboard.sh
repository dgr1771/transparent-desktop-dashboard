#!/bin/bash
# 透明桌面看板 UOS 启动脚本
# 自动定位 Electron 主程序并启动

# 应用根目录（UOS 规范安装路径）
APP_DIR="/opt/apps/com.dashboard.transparent/files"

# 定位主程序：优先 transparent-dashboard 软链接，其次按名称找
MAIN_BIN=""
if [ -x "$APP_DIR/transparent-dashboard" ]; then
  MAIN_BIN="$APP_DIR/transparent-dashboard"
elif [ -x "$APP_DIR/透明桌面看板" ]; then
  MAIN_BIN="$APP_DIR/透明桌面看板"
else
  # 兜底：找 files 下最大的可执行文件（Electron 主程序）
  MAIN_BIN=$(find "$APP_DIR" -maxdepth 1 -executable -type f -size +50M 2>/dev/null | head -1)
fi

if [ -z "$MAIN_BIN" ] || [ ! -x "$MAIN_BIN" ]; then
  echo "✗ 未找到透明桌面看板主程序，请检查 $APP_DIR"
  echo "  目录内容："
  ls -la "$APP_DIR/" 2>&1 | head -10
  exit 1
fi

# 设置库搜索路径（自包含依赖，不污染系统目录）
APP_LIB="$APP_DIR/lib"
if [ -d "$APP_LIB" ]; then
  export LD_LIBRARY_PATH="$APP_LIB:${LD_LIBRARY_PATH}"
fi

# 解决部分 Linux 桌面下 Electron 透明窗口黑屏问题
export ELECTRON_OZONE_PLATFORM_HINT=auto

# 切换到应用目录启动（Electron 需要在资源目录下运行以找到 resources/app）
cd "$APP_DIR"
exec "$MAIN_BIN" "$@"
