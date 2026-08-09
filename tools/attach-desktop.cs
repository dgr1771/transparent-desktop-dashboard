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

    IntPtr progman = FindWindowEx(IntPtr.Zero, IntPtr.Zero, "Progman", null);
    if (progman == IntPtr.Zero) { Console.WriteLine("NO_PROGMAN"); return 2; }

    SendMessage(progman, 0x052C, IntPtr.Zero, IntPtr.Zero);

    IntPtr desktop = GetDesktopWindow();
    IntPtr workerW = IntPtr.Zero;
    IntPtr targetWorkerW = IntPtr.Zero;

    while (true) {
      workerW = FindWindowEx(desktop, workerW, "WorkerW", null);
      if (workerW == IntPtr.Zero) break;
      targetWorkerW = workerW;
    }

    if (targetWorkerW == IntPtr.Zero) {
      IntPtr result = SetParent(hwnd, progman);
      if (result != IntPtr.Zero) { Console.WriteLine("OK_PROGMAN"); return 0; }
      Console.WriteLine("SETPARENT_FAILED_PROGMAN");
      return 5;
    }

    IntPtr res = SetParent(hwnd, targetWorkerW);
    if (res != IntPtr.Zero) { Console.WriteLine("OK"); return 0; }
    Console.WriteLine("SETPARENT_FAILED");
    return 6;
  }
}
