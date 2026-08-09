#!/bin/bash
# ============================================================
# UOS 规范 deb 打包脚本
# 在统信 UOS / deepin / Debian 系 Linux 上执行
#
# 用法：
#   chmod +x scripts/build-uos-deb.sh
#   ./scripts/build-uos-deb.sh
#
# 产物：release/com.dashboard.transparent_0.5.8_amd64.deb
# 安装：sudo dpkg -i release/com.dashboard.transparent_0.5.8_amd64.deb
# 卸载：sudo dpkg -r com.dashboard.transparent
# ============================================================
set -e

APPID="com.dashboard.transparent"
VERSION="0.5.8"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "================================================"
echo "  UOS deb 打包 - $APPID v$VERSION"
echo "================================================"

# ---------- 第 1 步：electron-builder 打 Linux 包 ----------
echo ""
echo "[1/5] 用 electron-builder 生成 Linux 应用包..."
# 使用国内镜像加速下载
export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"

npx electron-builder --linux AppImage --x64
echo "✓ Linux 包生成完成"

# ---------- 第 2 步：解压 AppImage，提取应用文件 ----------
echo ""
echo "[2/5] 提取应用文件..."
APPIMAGE=$(ls release/*.AppImage 2>/dev/null | head -1)
if [ -z "$APPIMAGE" ]; then
  echo "✗ 未找到 AppImage，请检查 electron-builder 是否成功"
  exit 1
fi
echo "  AppImage: $APPIMAGE"

# AppImage 用 --appimage-extract 解压
WORKDIR="$ROOT/build/uos-staging"
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
cd "$WORKDIR"
chmod +x "$ROOT/$APPIMAGE"
"$ROOT/$APPIMAGE" --appimage-extract >/dev/null 2>&1 || {
  # 备用方案：直接挂载提取
  echo "  --appimage-extract 失败，尝试直接解压..."
  cp "$ROOT/$APPIMAGE" ./app.squashfs
}
echo "✓ 提取完成"

# ---------- 第 3 步：重组到 UOS 规范目录结构 ----------
echo ""
echo "[3/5] 重组到 UOS /opt/apps 规范目录..."
PKGDIR="$WORKDIR/pkg"
APPDIR="$PKGDIR/opt/apps/$APPID"
FILESDIR="$APPDIR/files"

# 清理并重建
rm -rf "$PKGDIR"
mkdir -p "$FILESDIR"

# 从 squashfs-root 拷贝应用文件
SRC="$WORKDIR/squashfs-root"
if [ ! -d "$SRC" ]; then
  echo "✗ 解压后未找到 squashfs-root"
  exit 1
fi

# Electron 应用主文件（exe + 资源）
cp -r "$SRC/." "$FILESDIR/" 2>/dev/null || true
# 重命名主程序（AppImage 里的 AppRun 或主 exe）
if [ -f "$FILESDIR/AppRun" ]; then
  cp "$FILESDIR/AppRun" "$FILESDIR/transparent-dashboard"
fi
# 清理不需要的文件
rm -f "$FILESDIR/AppRun" "$FILESDIR/.DirIcon" "$FILESDIR/*.desktop" 2>/dev/null || true
rm -rf "$FILESDIR/usr/share/applications" 2>/dev/null || true

# 拷贝 UOS 规范文件（info.json、entries、desktop、icon、启动脚本）
cp -r "$ROOT/build/uos/opt/apps/$APPID/info.json" "$APPDIR/"
cp -r "$ROOT/build/uos/opt/apps/$APPID/entries" "$APPDIR/"
cp "$ROOT/build/uos/opt/apps/$APPID/files/bin/transparent-dashboard.sh" "$FILESDIR/bin/" 2>/dev/null || {
  mkdir -p "$FILESDIR/bin"
  cp "$ROOT/build/uos/opt/apps/$APPID/files/bin/transparent-dashboard.sh" "$FILESDIR/bin/"
}
chmod +x "$FILESDIR/bin/transparent-dashboard.sh"
chmod +x "$FILESDIR/transparent-dashboard" 2>/dev/null || true

# DEBIAN/control + postinst/prerm
mkdir -p "$PKGDIR/DEBIAN"
cp "$ROOT/build/uos/DEBIAN/control" "$PKGDIR/DEBIAN/"
cp "$ROOT/build/uos/DEBIAN/postinst" "$PKGDIR/DEBIAN/" 2>/dev/null || true
cp "$ROOT/build/uos/DEBIAN/prerm" "$PKGDIR/DEBIAN/" 2>/dev/null || true
chmod 755 "$PKGDIR/DEBIAN/postinst" 2>/dev/null || true
chmod 755 "$PKGDIR/DEBIAN/prerm" 2>/dev/null || true

# 更新 control 中的实际安装大小
INSTALLED_SIZE=$(du -sk "$PKGDIR" | cut -f1)
sed -i "s/^Installed-Size:.*/Installed-Size: $INSTALLED_SIZE/" "$PKGDIR/DEBIAN/control"

echo "✓ 目录结构重组完成"
echo ""
echo "  最终结构："
find "$PKGDIR" -maxdepth 4 -type d | sed "s|$PKGDIR||" | head -20

# ---------- 第 4 步：生成 deb ----------
echo ""
echo "[4/5] 生成 deb 包..."
# 必须用 fakeroot 或 root 保证权限正确
mkdir -p "$ROOT/release"
DEB_NAME="${APPID}_${VERSION}_amd64.deb"
# dpkg-deb 要求目录内文件权限正确，先修正
chmod -R go-w "$PKGDIR" 2>/dev/null || true
find "$PKGDIR" -type d -exec chmod 755 {} \; 2>/dev/null || true

if command -v fakeroot >/dev/null 2>&1; then
  fakeroot dpkg-deb -Zxz --build "$PKGDIR" "$ROOT/release/$DEB_NAME"
else
  dpkg-deb -Zxz --build "$PKGDIR" "$ROOT/release/$DEB_NAME"
fi
echo "✓ deb 包生成完成"

# ---------- 第 5 步：验证 ----------
echo ""
echo "[5/5] 验证 deb 包..."
DEB_PATH="$ROOT/release/$DEB_NAME"
ls -lh "$DEB_PATH"
echo ""
echo "  deb 内容（前 20 项）："
dpkg-deb -c "$DEB_PATH" 2>/dev/null | head -20
echo ""
echo "  control 信息："
dpkg-deb -I "$DEB_PATH" 2>/dev/null

echo ""
echo "================================================"
echo "  ✅ UOS deb 打包完成！"
echo "================================================"
echo ""
echo "📦 安装包：$ROOT/release/$DEB_NAME"
echo ""
echo "安装命令：sudo dpkg -i release/$DEB_NAME"
echo "卸载命令：sudo dpkg -r $APPID"
echo ""
echo "应用路径：/opt/apps/$APPID/"
echo "启动方式：应用菜单搜索\"透明桌面看板\"，或终端运行 transparent-dashboard.sh"
