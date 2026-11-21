using System.Diagnostics;
using System.Text;
using FocusGate.Agent.Poc.Models;
using FocusGate.Agent.Poc.Native;

namespace FocusGate.Agent.Poc.Monitors;

/// <summary>
/// Resolves a window handle to the real application behind it.
/// UWP/Store apps are hosted by ApplicationFrameHost.exe, so the hosted
/// process (and its AppUserModelId) has to be resolved explicitly, otherwise
/// every Store app would look identical to the blocker.
/// </summary>
public static class WindowInspector
{
    public static ForegroundApp? Describe(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return null;

        NativeMethods.GetWindowThreadProcessId(hwnd, out var framePid);
        if (framePid == 0) return null;

        var title = ReadText(hwnd, NativeMethods.GetWindowText);
        var className = ReadText(hwnd, NativeMethods.GetClassName);
        var frameName = SafeProcessName((int)framePid);

        var pid = (int)framePid;
        var isUwpHosted = false;

        if (string.Equals(frameName, "ApplicationFrameHost", StringComparison.OrdinalIgnoreCase))
        {
            // The frame window is a shell host; the child window belongs to the app.
            var hostedPid = FindHostedProcess(hwnd, framePid);
            if (hostedPid is not null)
            {
                pid = hostedPid.Value;
                isUwpHosted = true;
            }
        }

        var processName = SafeProcessName(pid);
        ProcessQuery.TryGetIdentity(pid, out var path, out var aumid);

        return new ForegroundApp(
            WindowHandle: hwnd,
            ProcessId: pid,
            ProcessName: processName,
            WindowTitle: title,
            WindowClass: className,
            ExecutablePath: path,
            AppUserModelId: aumid,
            IsUwpHosted: isUwpHosted,
            ObservedAt: DateTimeOffset.Now);
    }

    private static int? FindHostedProcess(IntPtr frameWindow, uint framePid)
    {
        int? found = null;
        NativeMethods.EnumChildWindows(frameWindow, (child, _) =>
        {
            NativeMethods.GetWindowThreadProcessId(child, out var childPid);
            if (childPid != 0 && childPid != framePid &&
                !string.Equals(SafeProcessName((int)childPid), "ApplicationFrameHost",
                    StringComparison.OrdinalIgnoreCase))
            {
                found = (int)childPid;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    private static string ReadText(IntPtr hwnd, Func<IntPtr, StringBuilder, int, int> read)
    {
        var buffer = new StringBuilder(512);
        var length = read(hwnd, buffer, buffer.Capacity);
        return length <= 0 ? string.Empty : buffer.ToString(0, Math.Min(length, buffer.Length));
    }

    private static string SafeProcessName(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            return process.ProcessName;
        }
        catch (ArgumentException)
        {
            return $"pid-{pid}";
        }
        catch (InvalidOperationException)
        {
            return $"pid-{pid}";
        }
    }
}

/// <summary>Process identity helpers that keep working for processes we cannot open fully.</summary>
public static class ProcessQuery
{
    public static bool TryGetIdentity(int pid, out string? executablePath, out string? appUserModelId)
    {
        executablePath = null;
        appUserModelId = null;

        var handle = NativeMethods.OpenProcess(
            NativeMethods.PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (handle == IntPtr.Zero) return false;

        try
        {
            var buffer = new StringBuilder(1024);
            var size = buffer.Capacity;
            if (NativeMethods.QueryFullProcessImageName(handle, 0, buffer, ref size))
            {
                executablePath = buffer.ToString(0, size);
            }

            appUserModelId = TryGetAppUserModelId(handle);
            return true;
        }
        finally
        {
            NativeMethods.CloseHandle(handle);
        }
    }

    private static string? TryGetAppUserModelId(IntPtr processHandle)
    {
        try
        {
            uint length = 0;
            var probe = NativeMethods.GetApplicationUserModelId(processHandle, ref length, null);
            if (probe != 122 /* ERROR_INSUFFICIENT_BUFFER */ || length == 0) return null;

            var buffer = new StringBuilder((int)length);
            var result = NativeMethods.GetApplicationUserModelId(processHandle, ref length, buffer);
            return result == 0 ? buffer.ToString() : null;
        }
        catch (EntryPointNotFoundException)
        {
            return null;
        }
    }

    public static bool CanOpen(int pid, uint access, out int win32Error)
    {
        win32Error = 0;
        var handle = NativeMethods.OpenProcess(access, false, pid);
        if (handle == IntPtr.Zero)
        {
            win32Error = System.Runtime.InteropServices.Marshal.GetLastWin32Error();
            return false;
        }
        NativeMethods.CloseHandle(handle);
        return true;
    }
}
