using System.Diagnostics;
using System.Security.Principal;
using System.Text;
using FocusGate.Agent.Poc.Models;
using FocusGate.Agent.Poc.Monitors;
using FocusGate.Agent.Poc.Native;

namespace FocusGate.Agent.Poc.Services;

/// <summary>
/// Measures which Windows capabilities the agent can really rely on on this
/// machine. Every check reports PASS / FAIL / SKIP with the evidence, so the
/// Phase 0 report is based on observed behaviour, not assumptions.
/// </summary>
public static class SelfTest
{
    private enum Status { Pass, Fail, Skip }

    private sealed record CheckResult(string Name, Status Status, string Detail);

    public static int Run(AgentOptions options)
    {
        Console.WriteLine("FocusGate Windows Agent – Phase 0 capability probe");
        Console.WriteLine($"Host: {Environment.MachineName}  OS: {Environment.OSVersion}");
        Console.WriteLine($"64-bit process: {Environment.Is64BitProcess}  Elevated: {IsElevated()}");
        Console.WriteLine();

        var results = new List<CheckResult>();

        results.Add(CheckForegroundWindow());
        results.Add(CheckEventHook());
        results.Add(CheckProcessEnumeration());
        results.Add(CheckUwpIdentity());
        results.Add(CheckChildProcessControl());
        results.Add(CheckWindowMinimize());
        results.Add(CheckSqlite(options.DatabasePath));
        results.Add(CheckElevation());

        Console.WriteLine();
        Console.WriteLine("Name                            Status  Detail");
        Console.WriteLine(new string('-', 100));
        foreach (var result in results)
        {
            Console.WriteLine($"{result.Name,-31} {result.Status,-7} {result.Detail}");
        }

        var failures = results.Count(r => r.Status == Status.Fail);
        var passes = results.Count(r => r.Status == Status.Pass);
        var skips = results.Count(r => r.Status == Status.Skip);

        Console.WriteLine();
        Console.WriteLine($"Summary: {passes} passed, {failures} failed, {skips} skipped.");

        try
        {
            using var store = new SqliteEventStore(options.DatabasePath);
            store.Initialize();
            foreach (var result in results)
            {
                store.RecordSelfTestCheck(result.Name, result.Status.ToString(), result.Detail);
            }
            Console.WriteLine($"Probe results written to {store.DatabasePath}");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Could not persist probe results: {ex.Message}");
        }

        return failures == 0 ? 0 : 1;
    }

    private static CheckResult CheckForegroundWindow()
    {
        try
        {
            var hwnd = NativeMethods.GetForegroundWindow();
            if (hwnd == IntPtr.Zero)
            {
                return new CheckResult("Foreground window", Status.Skip,
                    "No foreground window (locked or non-interactive session).");
            }

            var app = WindowInspector.Describe(hwnd);
            if (app is null)
            {
                return new CheckResult("Foreground window", Status.Fail,
                    "Foreground handle present but process identity could not be resolved.");
            }

            return new CheckResult("Foreground window", Status.Pass,
                $"{app.ProcessName} (pid {app.ProcessId}), title '{Truncate(app.WindowTitle, 40)}'");
        }
        catch (Exception ex)
        {
            return new CheckResult("Foreground window", Status.Fail, ex.Message);
        }
    }

    private static CheckResult CheckEventHook()
    {
        // Pump messages briefly so an out-of-context hook can be installed and removed.
        using var monitor = new ForegroundWindowMonitor();
        var installed = monitor.Start();
        for (var i = 0; i < 20; i++)
        {
            Application.DoEvents();
            Thread.Sleep(10);
        }

        if (!installed)
        {
            return new CheckResult("Foreground event hook", Status.Fail,
                "SetWinEventHook returned a null handle.");
        }

        return new CheckResult("Foreground event hook", Status.Pass,
            "EVENT_SYSTEM_FOREGROUND hook installed; scheduled within WinForms message pump.");
    }

    private static CheckResult CheckProcessEnumeration()
    {
        try
        {
            var started = Stopwatch.StartNew();
            var processes = ProcessMonitor.EnumerateInteractive();
            started.Stop();
            var withIdentity = processes.Count(p => p.ExecutablePath is not null);

            return new CheckResult("Process enumeration", Status.Pass,
                $"{processes.Count} interactive processes in {started.Elapsed.TotalMilliseconds:F0} ms, " +
                $"{withIdentity} with readable image path.");
        }
        catch (Exception ex)
        {
            return new CheckResult("Process enumeration", Status.Fail, ex.Message);
        }
    }

    private static CheckResult CheckUwpIdentity()
    {
        try
        {
            var app = WindowInspector.Describe(NativeMethods.GetForegroundWindow());
            if (app is null)
            {
                return new CheckResult("UWP identity (AUMID)", Status.Fail,
                    "Could not resolve the foreground window.");
            }
            if (!app.IsUwpHosted)
            {
                return new CheckResult("UWP identity (AUMID)", Status.Skip,
                    $"Foreground app '{app.ProcessName}' is not a Store app; bring a Store app forward to test AUMID resolution.");
            }

            var ok = !string.IsNullOrEmpty(app.AppUserModelId);
            return new CheckResult("UWP identity (AUMID)", ok ? Status.Pass : Status.Fail,
                $"hostedProcess={app.ProcessName}, aumid={app.AppUserModelId ?? "(none)"}, pid={app.ProcessId}");
        }
        catch (Exception ex)
        {
            return new CheckResult("UWP identity (AUMID)", Status.Fail, ex.Message);
        }
    }

    private static CheckResult CheckChildProcessControl()
    {
        Process? child = null;
        try
        {
            child = Process.Start(new ProcessStartInfo("cmd.exe", "/c ping -n 30 127.0.0.1 > nul")
            {
                CreateNoWindow = true,
                UseShellExecute = false,
            });

            if (child is null)
            {
                return new CheckResult("Process control rights", Status.Fail,
                    "Could not start a probe child process.");
            }

            var terminate = ProcessQuery.CanOpen(child.Id, NativeMethods.PROCESS_TERMINATE, out var terminateError);
            var threadHandle = NativeMethods.OpenThread(
                NativeMethods.THREAD_SUSPEND_RESUME, false, (uint)child.Threads[0].Id);
            var suspend = threadHandle != IntPtr.Zero;
            if (suspend) NativeMethods.CloseHandle(threadHandle);

            var detail =
                $"terminate={terminate}{(terminate ? string.Empty : $" (win32 {terminateError})")}, " +
                $"thread suspend={suspend} on a same-user child process.";

            return new CheckResult("Process control rights", terminate ? Status.Pass : Status.Fail, detail);
        }
        catch (Exception ex)
        {
            return new CheckResult("Process control rights", Status.Fail, ex.Message);
        }
        finally
        {
            try
            {
                if (child is { HasExited: false }) child.Kill(entireProcessTree: true);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Probe cleanup failed: {ex.Message}");
            }
            child?.Dispose();
        }
    }

    private static CheckResult CheckWindowMinimize()
    {
        if (!Environment.UserInteractive)
        {
            return new CheckResult("Window enforcement", Status.Skip, "Non-interactive session.");
        }

        var probeExe = ResolveProbeExecutable();
        if (probeExe is null)
        {
            return new CheckResult("Window enforcement", Status.Skip,
                "Could not locate the PoC executable for a cross-process probe window.");
        }

        Process? probe = null;
        try
        {
            probe = Process.Start(new ProcessStartInfo(probeExe, "--window-probe")
            {
                UseShellExecute = false,
            });
            if (probe is null)
            {
                return new CheckResult("Window enforcement", Status.Skip, "Probe process did not start.");
            }

            var deadline = DateTime.UtcNow.AddSeconds(10);
            probe.Refresh();
            while (probe.MainWindowHandle == IntPtr.Zero && DateTime.UtcNow < deadline)
            {
                Thread.Sleep(100);
                probe.Refresh();
            }

            var hwnd = probe.MainWindowHandle;
            if (hwnd == IntPtr.Zero)
            {
                return new CheckResult("Window enforcement", Status.Skip,
                    "Probe window did not appear within 10s.");
            }

            var minimized = NativeMethods.ShowWindow(hwnd, NativeMethods.SW_MINIMIZE);
            var iconified = NativeMethods.IsIconic(hwnd);

            return new CheckResult("Window enforcement",
                minimized && iconified ? Status.Pass : Status.Fail,
                $"ShowWindow(SW_MINIMIZE) on a separate PoC process: accepted={minimized}, iconified={iconified}.");
        }
        catch (Exception ex)
        {
            return new CheckResult("Window enforcement", Status.Fail, ex.Message);
        }
        finally
        {
            try
            {
                if (probe is { HasExited: false }) probe.Kill(entireProcessTree: true);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Probe cleanup failed: {ex.Message}");
            }
            probe?.Dispose();
        }
    }

    private static string? ResolveProbeExecutable()
    {
        var local = Path.Combine(AppContext.BaseDirectory, "FocusGate.Agent.Poc.exe");
        if (File.Exists(local)) return local;

        var current = Environment.ProcessPath;
        if (current is not null &&
            !string.Equals(Path.GetFileNameWithoutExtension(current), "dotnet", StringComparison.OrdinalIgnoreCase))
        {
            return current;
        }
        return null;
    }

    private static CheckResult CheckSqlite(string databasePath)
    {
        var directory = Path.GetDirectoryName(Path.GetFullPath(databasePath))!;
        Directory.CreateDirectory(directory);
        var probePath = Path.Combine(directory, "poc-selftest.db");
        try
        {
            // Microsoft.Data.Sqlite pools connections; clear them so the probe
            // file is released before it is deleted.
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            File.Delete(probePath);
            int events;
            using (var store = new SqliteEventStore(probePath))
            {
                store.Initialize();
                store.RecordSelfTestCheck("sqlite-roundtrip", "Pass", "selftest");
                events = store.CountEvents();
            }
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            File.Delete(probePath);
            File.Delete(probePath + "-wal");
            File.Delete(probePath + "-shm");

            return new CheckResult("SQLite local log", Status.Pass,
                $"Schema created, row written and read (usage rows: {events}) using Microsoft.Data.Sqlite.");
        }
        catch (Exception ex)
        {
            return new CheckResult("SQLite local log", Status.Fail, ex.Message);
        }
    }

    private static CheckResult CheckElevation()
    {
        return IsElevated()
            ? new CheckResult("Elevation", Status.Pass,
                "Running elevated: can manage processes owned by administrators.")
            : new CheckResult("Elevation", Status.Skip,
                "Not elevated: per-user apps can be managed; elevated/protected apps cannot. " +
                "Production agent should run as a per-user app, not a SYSTEM service.");
    }

    private static bool IsElevated()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static string Truncate(string? value, int max)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Length <= max ? value : value[..max] + "…";
    }
}
