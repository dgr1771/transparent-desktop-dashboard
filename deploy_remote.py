#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
透明桌面看板 - 远程部署/测试助手
用法:
  python deploy_remote.py probe        # 探测远端环境(只读)
  python deploy_remote.py upload       # 上传最新 deb 到 ~/Downloads/
  python deploy_remote.py install      # 上传并安装(sudo dpkg -i)
  python deploy_remote.py status       # 查看已安装版本/服务/进程
  python deploy_remote.py launch       # 尝试启动看板(GUI,需有显示会话)
  python deploy_remote.py logs         # 拉最近日志
  python deploy_remote.py uninstall    # 卸载
"""
import sys, os, time, argparse

HOST = "192.168.1.54"
USER = "dgr"
PASS = "1"
DEB  = r"C:\Users\67842\ZCodeProject\transparent-desktop-dashboard\release\com.dashboard.transparent_0.8.40_amd64.deb"
REMOTE_DIR = "/home/dgr/Downloads"

import paramiko
from scp import SCPClient

def conn():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=12,
              allow_agent=False, look_for_keys=False)
    return c

def run(c, cmd, sudo=False, timeout=120):
    """执行命令,返回 (exit_code, stdout, stderr)。sudo 用 echo password | sudo -S 方式传密码。"""
    if sudo:
        # 用 -S 从 stdin 读密码;bash -c 包一层避免引号问题
        full = f"echo {PASS} | sudo -S -p '' bash -c {repr(cmd)}"
    else:
        full = cmd
    stdin, stdout, stderr = c.exec_command(full, timeout=timeout, get_pty=False)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    rc  = stdout.channel.recv_exit_status()
    return rc, out, err

def probe(c):
    print("===== 远端环境探测 =====")
    cmds = [
        ("系统",       "cat /etc/os-release | head -4"),
        ("内核/架构",  "uname -a"),
        ("当前用户",   "whoami; id"),
        ("桌面环境",   "echo DESKTOP=$XDG_CURRENT_DESKTOP; echo SESSION=$XDG_SESSION_TYPE; echo DISPLAY=$DISPLAY"),
        ("显示器",     "ls /sys/class/drm 2>/dev/null | grep card; (command -v xrandr >/dev/null && xrandr 2>/dev/null | head -15) || echo 'no xrandr'"),
        ("磁盘空间",   "df -h /home / 2>/dev/null | sort -u"),
        ("现有看板包", "dpkg -l | grep -i dashboard || echo '(未安装)'"),
        ("现有看板进程","ps -ef | grep -iE 'dashboard|transparent' | grep -v grep || echo '(无进程)'"),
        ("桌面文件",   "ls -la /usr/share/applications/ 2>/dev/null | grep -i dashboard || echo '(无 desktop 文件)'"),
    ]
    for name, cmd in cmds:
        rc, out, err = run(c, cmd)
        out = out.strip() or "(空)"
        print(f"\n[{name}]")
        print(out)

def upload(c):
    if not os.path.isfile(DEB):
        print(f"找不到 deb: {DEB}"); sys.exit(1)
    size_mb = os.path.getsize(DEB) / 1024 / 1024
    run(c, f"mkdir -p {REMOTE_DIR}")
    print(f"上传 {os.path.basename(DEB)} ({size_mb:.1f} MB) -> {REMOTE_DIR}/ ...")
    t0 = time.time()
    # 用 sftp,paramiko 自带,稳定
    sftp = c.open_sftp()
    sftp.put(DEB, f"{REMOTE_DIR}/{os.path.basename(DEB)}")
    sftp.close()
    print(f"完成,用时 {time.time()-t0:.1f}s")
    rc, out, _ = run(c, f"ls -lh {REMOTE_DIR}/{os.path.basename(DEB)}")
    print(out.strip())

def install(c):
    upload(c)
    name = os.path.basename(DEB)
    remote = f"{REMOTE_DIR}/{name}"
    print("\n===== 安装依赖再 dpkg -i =====")
    # 先 apt 修正依赖,再安装
    rc, out, err = run(c, f"apt-get install -f -y >/dev/null 2>&1; dpkg -i {remote} || apt-get install -f -y",
                       sudo=True, timeout=300)
    print(out)
    if err.strip(): print("[stderr]", err)
    print(f"\n[dpkg exit={rc}]")
    print("\n===== 确认安装结果 =====")
    rc, out, _ = run(c, "dpkg -l | grep -i dashboard")
    print(out.strip() or "(未找到)")

def status(c):
    print("===== 已安装版本 =====")
    rc, out, _ = run(c, "dpkg -l | grep -i dashboard || echo '(未安装)'"); print(out.strip())
    print("\n===== 相关进程 =====")
    rc, out, _ = run(c, "ps -ef | grep -iE 'dashboard|transparent' | grep -v grep || echo '(无)'"); print(out.strip())
    print("\n===== 包内文件清单(前40) =====")
    rc, out, _ = run(c, "dpkg -L com.dashboard.transparent 2>/dev/null | head -40 || echo '(包未安装)'"); print(out.strip())

def launch(c):
    print("===== 尝试启动看板 =====")
    # 先看包里有哪些可执行
    rc, out, _ = run(c, "dpkg -L com.dashboard.transparent 2>/dev/null | grep -E '/bin/|/opt/.+/' || echo '(未安装)'")
    print("候选可执行:")
    print(out.strip())
    # 尝试常见入口
    candidates = ["/opt/apps/com.dashboard.transparent/files/bin/dashboard",
                  "/usr/bin/dashboard",
                  "/usr/bin/com.dashboard.transparent"]
    started = False
    for exe in candidates:
        rc, out, err = run(c, f"test -x {exe} && echo OK || echo NO")
        if "OK" in out:
            print(f"\n找到入口 {exe},尝试以当前用户启动(后台,nohup)...")
            # GUI 需要 DISPLAY;若当前 SSH 会话没有,尝试 :0
            rc, out, err = run(c, f"export DISPLAY=${{DISPLAY:-:0}}; nohup {exe} >/tmp/dashboard.log 2>&1 & sleep 2; echo PID=$!; head -30 /tmp/dashboard.log")
            print(out.strip())
            if err.strip(): print("[err]", err)
            started = True
            break
    if not started:
        print("未自动找到可执行入口。上面候选里挑一个,或看 .desktop 文件里的 Exec=")

def logs(c):
    print("===== /tmp/dashboard.log (若存在) =====")
    rc, out, _ = run(c, "test -f /tmp/dashboard.log && tail -50 /tmp/dashboard.log || echo '(无日志文件)'")
    print(out.strip())
    print("\n===== journalctl 最近相关 (user级) =====")
    rc, out, _ = run(c, "journalctl --user -n 30 --no-pager 2>/dev/null | grep -iE 'dashboard|transparent' | tail -20 || echo '(无)'")
    print(out.strip())

def uninstall(c):
    print("===== 卸载 =====")
    rc, out, err = run(c, "dpkg -P com.dashboard.transparent", sudo=True, timeout=120)
    print(out)
    if err.strip(): print("[stderr]", err)
    print(f"[exit={rc}]")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["probe","upload","install","status","launch","logs","uninstall"])
    a = ap.parse_args()
    print(f"连接 {USER}@{HOST} ...")
    c = conn()
    print("已连接\n")
    {"probe":probe,"upload":upload,"install":install,"status":status,
     "launch":launch,"logs":logs,"uninstall":uninstall}[a.cmd](c)
    c.close()

if __name__ == "__main__":
    main()
