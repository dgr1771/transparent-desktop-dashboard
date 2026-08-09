using System;
using System.Runtime.InteropServices;

class AttachDesktop {
  [DllImport("user32.dll")]
  static extern IntPtr FindWindowEx(IntPtr p, IntPtr c, string cls, string win);
  [DllImport("user32.dll")]
  static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")]
  static extern IntPtr GetDesktopWindow();
  [DllImport("user32.dll")]
  static extern IntPtr SetParent(IntPtr c, IntPtr p);

  static int Main(string[] args) {
    if (args.Length < 1) {
      Console.WriteLine("USAGE: attach-desktop.exe <hwnd>");
      return 1;
    }
    long hwndVal = long.Parse(args[0]);
    IntPtr hwnd = new IntPtr(hwndVal);

    // 1. 找 Progman
    IntPtr progman = FindWindowEx(IntPtr.Zero, IntPtr.Zero, "Progman", null);
    if (progman == IntPtr.Zero) { Console.WriteLine("NO_PROGMAN"); return 2; }

    // 2. 发送 0x052C 触发 WorkerW 创建
    SendMessage(progman, 0x052C, IntPtr.Zero, IntPtr.Zero);

    // 3. 找包含 SHELLDLL_DefView 的 WorkerW
    IntPtr desktop = GetDesktopWindow();
    IntPtr workerW = IntPtr.Zero;
    IntPtr shellView = IntPtr.Zero;
    do {
      workerW = FindWindowEx(desktop, workerW, "WorkerW", null);
      if (workerW != IntPtr.Zero) {
        shellView = FindWindowEx(workerW, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (shellView != IntPtr.Zero) break;
      }
    } while (workerW != IntPtr.Zero);

    if (shellView == IntPtr.Zero) { Console.WriteLine("NO_SHELLVIEW"); return 3; }

    // 4. 取下一个 WorkerW
    IntPtr nextWorkerW = FindWindowEx(desktop, workerW, "WorkerW", null);
    if (nextWorkerW == IntPtr.Zero) { Console.WriteLine("NO_NEXT_WORKERW"); return 4; }

    // 5. SetParent
    IntPtr result = SetParent(hwnd, nextWorkerW);
    if (result != IntPtr.Zero) { Console.WriteLine("OK"); return 0; }
    Console.WriteLine("SETPARENT_FAILED");
    return 5;
  }
}
