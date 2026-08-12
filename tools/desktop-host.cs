using System;
using System.Runtime.InteropServices;

internal static class DesktopHost
{
    private const int GWL_STYLE = -16;
    private const int GWL_EXSTYLE = -20;
    private const long WS_CHILD = 0x40000000L;
    private const long WS_POPUP = unchecked((long)0x80000000);
    private const long WS_EX_TOOLWINDOW = 0x00000080L;
    private const long WS_EX_NOACTIVATE = 0x08000000L;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const uint SMTO_ABORTIFHUNG = 0x0002;

    private static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
    private static IntPtr worker;

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string cls, string title);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] private static extern uint SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll")] private static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] private static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
    [DllImport("user32.dll")] private static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);

    private static long GetLong(IntPtr value) { return IntPtr.Size == 8 ? value.ToInt64() : value.ToInt32(); }
    private static IntPtr Ptr(long value) { return IntPtr.Size == 8 ? new IntPtr(value) : new IntPtr((int)value); }

    private static IntPtr FindWorker()
    {
        var progman = FindWindow("Progman", null);
        if (progman != IntPtr.Zero)
        {
            IntPtr ignored;
            SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 1000, out ignored);
        }

        worker = IntPtr.Zero;
        EnumWindows((top, unused) =>
        {
            var shellView = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shellView != IntPtr.Zero)
            {
                worker = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return worker != IntPtr.Zero ? worker : progman;
    }

    private static void Attach(IntPtr hwnd)
    {
        var parent = FindWorker();
        if (parent == IntPtr.Zero) throw new Exception("desktop host not found");
        RECT oldRect;
        if (!GetWindowRect(hwnd, out oldRect)) throw new Exception("window rect unavailable");
        RECT parentRect;
        GetWindowRect(parent, out parentRect);

        var style = GetLong(GetWindowLongPtr(hwnd, GWL_STYLE));
        var exStyle = GetLong(GetWindowLongPtr(hwnd, GWL_EXSTYLE));
        SetWindowLongPtr(hwnd, GWL_STYLE, Ptr((style & ~WS_POPUP) | WS_CHILD));
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, Ptr(exStyle | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE));
        SetParent(hwnd, parent);
        SetWindowPos(hwnd, HWND_BOTTOM, oldRect.Left - parentRect.Left, oldRect.Top - parentRect.Top,
            oldRect.Right - oldRect.Left, oldRect.Bottom - oldRect.Top, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        Console.WriteLine("attached parent=" + parent.ToInt64());
    }

    private static void Detach(IntPtr hwnd)
    {
        RECT oldRect;
        GetWindowRect(hwnd, out oldRect);
        var parent = FindWorker();
        SetParent(hwnd, IntPtr.Zero);
        var style = GetLong(GetWindowLongPtr(hwnd, GWL_STYLE));
        SetWindowLongPtr(hwnd, GWL_STYLE, Ptr((style & ~WS_CHILD) | WS_POPUP));
        SetWindowPos(hwnd, HWND_BOTTOM, oldRect.Left, oldRect.Top,
            oldRect.Right - oldRect.Left, oldRect.Bottom - oldRect.Top, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        Console.WriteLine("detached");
    }

    public static void Main(string[] args)
    {
        if (args.Length < 2) throw new ArgumentException("usage: desktop-host.exe <hwnd> <attach|detach>");
        var hwnd = new IntPtr(long.Parse(args[0]));
        if (args[1].Equals("attach", StringComparison.OrdinalIgnoreCase)) Attach(hwnd);
        else if (args[1].Equals("detach", StringComparison.OrdinalIgnoreCase)) Detach(hwnd);
        else throw new ArgumentException("unknown operation");
    }
}
