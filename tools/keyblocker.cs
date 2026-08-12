using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

internal static class KeyBlocker
{
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int VK_LWIN = 0x5B;
    private const int VK_RWIN = 0x5C;
    private const int VK_D = 0x44;
    private static readonly HookProc Callback = Hook;
    private static IntPtr hook;

    [StructLayout(LayoutKind.Sequential)] private struct KBDLLHOOKSTRUCT
    {
        public uint vkCode, scanCode, flags, time;
        public IntPtr dwExtraInfo;
    }
    private delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int id, HookProc callback, IntPtr module, uint threadId);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern int GetMessage(out MSG msg, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref MSG msg);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref MSG msg);
    [DllImport("kernel32.dll")] private static extern IntPtr GetModuleHandle(string name);
    [StructLayout(LayoutKind.Sequential)] private struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int x, y; }

    private static IntPtr Hook(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0 && (wParam.ToInt32() == WM_KEYDOWN || wParam.ToInt32() == WM_SYSKEYDOWN))
        {
            var key = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam).vkCode;
            var winDown = GetAsyncKeyState(VK_LWIN) < 0 || GetAsyncKeyState(VK_RWIN) < 0;
            if (key == VK_D && winDown) return new IntPtr(1);
        }
        return CallNextHookEx(hook, code, wParam, lParam);
    }

    public static void Main()
    {
        hook = SetWindowsHookEx(WH_KEYBOARD_LL, Callback, GetModuleHandle(Process.GetCurrentProcess().MainModule.ModuleName), 0);
        if (hook == IntPtr.Zero) return;
        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) { TranslateMessage(ref msg); DispatchMessage(ref msg); }
        UnhookWindowsHookEx(hook);
    }
}
