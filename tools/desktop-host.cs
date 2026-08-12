using System;
using System.Runtime.InteropServices;

internal static class DesktopHost
{
    [DllImport("user32.dll", EntryPoint="FindWindowW", CharSet=CharSet.Unicode)]
    private static extern IntPtr FindWindow(string cls, string title);

    [DllImport("user32.dll", EntryPoint="FindWindowExW", CharSet=CharSet.Unicode)]
    private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string cls, string title);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);

    [DllImport("user32.dll")]
    private static extern IntPtr SetParent(IntPtr child, IntPtr newParent);

    [DllImport("user32.dll")]
    private static extern IntPtr GetParent(IntPtr child);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hwnd, int command);

    private static IntPtr FindTargetWorkerW()
    {
        // 方法1：标准路径（Progman → SendMessage → 找包含 DefView 的 WorkerW → 取下一个）
        IntPtr progman = FindWindow("Progman", null);
        if (progman != IntPtr.Zero)
        {
            SendMessage(progman, 0x052C, IntPtr.Zero, IntPtr.Zero);
            IntPtr workerW = IntPtr.Zero, shellView;
            do {
                workerW = FindWindowEx(IntPtr.Zero, workerW, "WorkerW", null);
                if (workerW != IntPtr.Zero) {
                    shellView = FindWindowEx(workerW, IntPtr.Zero, "SHELLDLL_DefView", null);
                    if (shellView != IntPtr.Zero) {
                        IntPtr next = FindWindowEx(IntPtr.Zero, workerW, "WorkerW", null);
                        if (next != IntPtr.Zero) return next;
                    }
                }
            } while (workerW != IntPtr.Zero);
        }

        // 方法2：直接用第一个 WorkerW（Progman 不存在时的 fallback）
        IntPtr firstWorkerW = FindWindowEx(IntPtr.Zero, IntPtr.Zero, "WorkerW", null);
        if (firstWorkerW != IntPtr.Zero) return firstWorkerW;

        return IntPtr.Zero;
    }

    private static void Attach(IntPtr hwnd)
    {
        IntPtr worker = FindTargetWorkerW();
        if (worker == IntPtr.Zero) {
            Console.WriteLine("WORKERW_NOT_FOUND");
            return;
        }

        IntPtr currentParent = GetParent(hwnd);
        if (currentParent == worker) {
            Console.WriteLine("ALREADY_ATTACHED");
            return;
        }

        // 使用 SetParent（真正的 parent，不是 owner）
        IntPtr result = SetParent(hwnd, worker);
        if (result != IntPtr.Zero) {
            ShowWindow(hwnd, 8); // SW_SHOWNA
            Console.WriteLine("ATTACHED " + worker.ToInt64());
        } else {
            Console.WriteLine("SETPARENT_FAILED");
        }
    }

    private static void Detach(IntPtr hwnd)
    {
        SetParent(hwnd, IntPtr.Zero);
        ShowWindow(hwnd, 8);
        Console.WriteLine("DETACHED OK");
    }

    public static void Main(string[] args)
    {
        if (args.Length < 2) {
            Console.WriteLine("Usage: desktop-host.exe <hwnd> attach|detach");
            return;
        }
        IntPtr hwnd = new IntPtr(long.Parse(args[0]));
        string action = args[1].ToLower();
        if (action == "attach") Attach(hwnd);
        else if (action == "detach") Detach(hwnd);
    }
}
