#!/bin/bash
set -e

echo "=== [1/7] 准备 WSL 本地工作目录 ==="
WORK="$HOME/td-build"
rm -rf "$WORK"
mkdir -p "$WORK"
echo "  工作目录: $WORK"

echo ""
echo "=== [2/7] 复制项目源码到 WSL 本地 ==="
SRC="/mnt/c/Users/67842/ZCodeProject/transparent-desktop-dashboard"
cp -r "$SRC/src" "$WORK/"
cp -r "$SRC/build" "$WORK/"
cp -r "$SRC/scripts" "$WORK/"
cp -r "$SRC/assets" "$WORK/"
cp "$SRC/package.json" "$WORK/"
cp "$SRC/package-lock.json" "$WORK/" 2>/dev/null || echo "  (无 lock 文件)"
echo "  源码已复制"

echo ""
echo "=== [3/7] 安装依赖 ==="
cd "$WORK"
echo "  安装中...（首次约2-4分钟）"
npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -5
echo "  ✓ 依赖安装完成"

echo ""
echo "=== [4/7] 用 electron-builder 打 AppImage ==="
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npx electron-builder --linux AppImage --x64 2>&1 | tail -10
echo "  ✓ AppImage 生成完成"
ls -lh release/*.AppImage

echo ""
echo "=== [5/7] 解压 AppImage 并重组到 UOS 规范 ==="
APPID="com.dashboard.transparent"
APPIMAGE=$(ls release/*.AppImage | head -1)
chmod +x "$APPIMAGE"
STAGING="$HOME/uos-staging"
rm -rf "$STAGING"
mkdir -p "$STAGING"
cd "$STAGING"
"$WORK/$APPIMAGE" --appimage-extract >/dev/null 2>&1
echo "  ✓ AppImage 已解压"
ls squashfs-root/ | head

echo ""
echo "=== [6/7] 构建 UOS /opt/apps 目录结构 ==="
PKGDIR="$STAGING/pkg"
APPDIR="$PKGDIR/opt/apps/$APPID"
FILESDIR="$APPDIR/files"
rm -rf "$PKGDIR"
mkdir -p "$FILESDIR/bin"

# 拷贝应用文件
cp -r squashfs-root/* "$FILESDIR/" 2>/dev/null || true
# 删除 AppImage 专用的 AppRun（脱离 AppImage 结构后无法运行，会报错）
rm -f "$FILESDIR/AppRun" "$FILESDIR/.DirIcon" 2>/dev/null || true
rm -f "$FILESDIR"/*.desktop 2>/dev/null || true

# 找到真实的 Electron 可执行文件（electron-builder 用 productName 命名）
# 名字可能是 "透明桌面看板" 或 ASCII 名（取决于文件系统支持中文）
REAL_BIN=""
for name in "透明桌面看板" "transparent-desktop-dashboard"; do
  if [ -f "$FILESDIR/$name" ]; then
    REAL_BIN="$name"
    break
  fi
done
# 如果没找到，找任何可执行的大文件（Electron 主程序通常 >100MB）
if [ -z "$REAL_BIN" ]; then
  REAL_BIN=$(find "$FILESDIR" -maxdepth 1 -executable -type f -size +50M 2>/dev/null | head -1 | xargs basename 2>/dev/null)
fi

if [ -n "$REAL_BIN" ]; then
  echo "  ✓ 找到主程序: $REAL_BIN"
  # 如果名字不是 transparent-dashboard，建一个软链接
  if [ "$REAL_BIN" != "transparent-dashboard" ]; then
    ln -sf "$REAL_BIN" "$FILESDIR/transparent-dashboard"
  fi
else
  echo "  ⚠️ 未找到主程序可执行文件，列出 files/ 内容供诊断："
  ls -la "$FILESDIR/" | head -10
fi

# UOS 规范文件
cp "$WORK/build/uos/opt/apps/$APPID/info.json" "$APPDIR/"
cp -r "$WORK/build/uos/opt/apps/$APPID/entries" "$APPDIR/"
cp "$WORK/build/uos/opt/apps/$APPID/files/bin/transparent-dashboard.sh" "$FILESDIR/bin/"
chmod +x "$FILESDIR/bin/transparent-dashboard.sh"
chmod +x "$FILESDIR/transparent-dashboard" 2>/dev/null || true

# 复制图标资源到 files/icons/（asar 打包后 assets 在 asar 内无法直接读取，
# 这里独立放一份供托盘代码用）
mkdir -p "$FILESDIR/icons"
cp "$WORK/assets/icons/"icon-16.png "$FILESDIR/icons/" 2>/dev/null || true
cp "$WORK/assets/icons/"icon-22.png "$FILESDIR/icons/" 2>/dev/null || cp "$WORK/assets/icons/icon-32.png" "$FILESDIR/icons/icon-22.png" 2>/dev/null || true
cp "$WORK/assets/icons/"icon-32.png "$FILESDIR/icons/" 2>/dev/null || true
echo "  ✓ 图标已复制到 files/icons/"

# DEBIAN/control（更新实际大小 + 版本号）+ postinst/prerm 脚本
mkdir -p "$PKGDIR/DEBIAN"
cp "$WORK/build/uos/DEBIAN/control" "$PKGDIR/DEBIAN/"
# 安装后/卸载前脚本（注册桌面入口到系统目录，让启动器显示图标）
cp "$WORK/build/uos/DEBIAN/postinst" "$PKGDIR/DEBIAN/" 2>/dev/null || true
cp "$WORK/build/uos/DEBIAN/prerm" "$PKGDIR/DEBIAN/" 2>/dev/null || true
INSTALLED_SIZE=$(du -sk "$PKGDIR" | cut -f1)
sed -i "s/^Installed-Size:.*/Installed-Size: $INSTALLED_SIZE/" "$PKGDIR/DEBIAN/control"
# 更新 control 里的版本号（从 package.json 读取）
PKG_VERSION=$(grep -o '"version": *"[^"]*"' "$SRC/package.json" | head -1 | sed 's/.*"version": *"//;s/".*//')
sed -i "s/^Version:.*/Version: $PKG_VERSION/" "$PKGDIR/DEBIAN/control"
echo "  control 版本号: $PKG_VERSION"

# 修正权限（deb 规范：DEBIAN 下脚本需可执行，control 等只读）
find "$PKGDIR" -type d -exec chmod 755 {} \;
find "$PKGDIR/DEBIAN" -type f -exec chmod 644 {} \;
chmod 755 "$PKGDIR/DEBIAN/postinst" 2>/dev/null || true
chmod 755 "$PKGDIR/DEBIAN/prerm" 2>/dev/null || true
chmod 755 "$FILESDIR/bin/transparent-dashboard.sh"
chmod 755 "$FILESDIR/transparent-dashboard" 2>/dev/null || true

echo "  ✓ UOS 目录结构就绪"
find "$PKGDIR" -maxdepth 3 -type d | sed "s|$PKGDIR||" | head -15

echo ""
echo "=== [7/7] 用 dpkg-deb 生成 deb 包 ==="
mkdir -p "$WORK/release"
# 从 package.json 读取版本号
VERSION=$(grep -o '"version": *"[^"]*"' "$SRC/package.json" | head -1 | sed 's/.*"version": *"//;s/".*//')
echo "  版本号: $VERSION"
DEB_NAME="${APPID}_${VERSION}_amd64.deb"
# 用 -Zxz 强制 xz 压缩（兼容 UOS/deepin 老版本 dpkg，避免 zstd 不支持报错）
fakeroot dpkg-deb -Zxz --build "$PKGDIR" "$WORK/release/$DEB_NAME"
echo "  ✓ deb 生成完成（xz 压缩，兼容 UOS）"

echo ""
echo "================================================"
echo "  ✅ UOS deb 打包完成！"
echo "================================================"
ls -lh "$WORK/release/$DEB_NAME"
echo ""
echo "=== deb 内容验证 ==="
dpkg-deb -c "$WORK/release/$DEB_NAME" | head -15
echo "..."
echo ""
echo "=== control 信息 ==="
dpkg-deb -I "$WORK/release/$DEB_NAME"

# 复制回 Windows 可访问的 release 目录
cp "$WORK/release/$DEB_NAME" "/mnt/c/Users/67842/ZCodeProject/transparent-desktop-dashboard/release/" 2>/dev/null && echo "✓ 已复制到 Windows release 目录"
