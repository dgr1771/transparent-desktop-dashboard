using System;
using System.Runtime.InteropServices;
using System.Text;

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
    private const uint SWP_FRAMECHANGED = 0x0020;
    private const uint SMTO_ABORTIFHUNG = 0x0002;

    private static readonly IntPtr HWND_TOP = IntPtr.Zero;
    private static IntPtr worker;

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string cls, string title);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] private static extern uint SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll")] private static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] private static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
    [DllImport("user32.dll")] private static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hwnd, int command);

    private static long GetLong(IntPtr value) { return IntPtr.Size == 8 ? value.ToInt64() : value.ToInt32(); }
    private static IntPtr Ptr(long value) { return IntPtr.Size == 8 ? new IntPtr(value) : new IntPtr((int)value); }
    private static bool IsClass(IntPtr hwnd, string expected)
    {
        var name = new StringBuilder(64);
        return hwnd != IntPtr.Zero && GetClassName(hwnd, name, name.Capacity) > 0 && name.ToString() == expected;
    }

    private static void ApplyToolStyle(IntPtr hwnd)
    {
        var exStyle = GetLong(GetWindowLongPtr(hwnd, GWL_EXSTYLE));
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, Ptr(exStyle | WS_EX_TOOLWINDOW));
        SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOACTIVATE | SWP_FRAMECHANGED);
        ShowWindow(hwnd, 8);
    }

    private static IntPtr FindWorker()
    {
        var progman = FindWindow("Progman", null);
        if (progman != IntPtr.Zero)
        {
            IntPtr ignored;
            // 不同 Windows 版本对 Progman 的桌面宿主创建消息参数不同，
            // 两种形式都发送，确保独立 WorkerW 被创建出来。
            SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0xD), SMTO_ABORTIFHUNG, 1000, out ignored);
            SendMessageTimeout(progman, 0x052C, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 1000, out ignored);
        }

        IntPtr iconHost = IntPtr.Zero;
        EnumWindows((top, unused) =>
        {
            var shellView = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shellView != IntPtr.Zero)
            {
                // 这是承载桌面图标的宿主，不能把看板挂到它上面。
                iconHost = top;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        if (iconHost != IntPtr.Zero)
        {
            // 标准桌面层：取图标宿主之后的独立 WorkerW。
            worker = FindWindowEx(IntPtr.Zero, iconHost, "WorkerW", null);
            if (worker != IntPtr.Zero) return worker;
        }

        // 某些 Windows 版本会创建多个 WorkerW，但枚举顺序不同；
        // 选择不包含 SHELLDLL_DefView 的 WorkerW，绝不使用 Progman。
        worker = IntPtr.Zero;
        EnumWindows((top, unused) =>
        {
            if (FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null) == IntPtr.Zero && IsClass(top, "WorkerW"))
            {
                worker = top;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return worker;
    }

    private static void Attach(IntPtr hwnd)
    {
        var parent = FindWorker();
        if (parent == IntPtr.Zero)
        {
            // 某些 Windows 桌面/远程桌面环境没有独立 WorkerW，
            // 仍然强化工具窗口样式，避免回到普通应用窗口参与 Win+D。
            ApplyToolStyle(hwnd);
            Console.WriteLine("tool-style fallback (desktop host unavailable)");
            return;
        }
        RECT oldRect;
        if (!GetWindowRect(hwnd, out oldRect)) throw new Exception("window rect unavailable");
        RECT parentRect;
        GetWindowRect(parent, out parentRect);

        var style = GetLong(GetWindowLongPtr(hwnd, GWL_STYLE));
        var exStyle = GetLong(GetWindowLongPtr(hwnd, GWL_EXSTYLE));
        SetWindowLongPtr(hwnd, GWL_STYLE, Ptr((style & ~WS_POPUP) | WS_CHILD));
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, Ptr(exStyle | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE));
        SetParent(hwnd, parent);
        var x = oldRect.Left - parentRect.Left;
        var y = oldRect.Top - parentRect.Top;
        var width = oldRect.Right - oldRect.Left;
        var height = oldRect.Bottom - oldRect.Top;
        SetWindowPos(hwnd, HWND_TOP, x, y, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED);
        ShowWindow(hwnd, 8); // SW_SHOWNA：显示但不抢焦点
        SetWindowPos(hwnd, HWND_TOP, x, y, width, height, SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED);
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
        SetWindowPos(hwnd, HWND_TOP, oldRect.Left, oldRect.Top,
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
