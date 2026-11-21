using System.Diagnostics;
using FocusGate.Agent.Poc.Models;

namespace FocusGate.Agent.Poc.Monitors;

public sealed record ProcessSnapshot(
    int ProcessId,
    string ProcessName,
    string WindowTitle,
    string? ExecutablePath,
    string? AppUserModelId,
    long WorkingSetBytes);

/// <summary>
/// Process discovery. Only interactive processes (those owning a visible main
/// window) are reported; background services are intentionally ignored so the
/// agent never inventories unrelated software.
/// </summary>
public static class ProcessMonitor
{
    public static IReadOnlyList<ProcessSnapshot> EnumerateInteractive()
    {
        var results = new List<ProcessSnapshot>();

        foreach (var process in Process.GetProcesses())
        {
            using (process)
            {
                try
                {
                    if (process.MainWindowHandle == IntPtr.Zero) continue;
                    if (string.IsNullOrWhiteSpace(process.MainWindowTitle)) continue;

                    ProcessQuery.TryGetIdentity(process.Id, out var path, out var aumid);

                    results.Add(new ProcessSnapshot(
                        ProcessId: process.Id,
                        ProcessName: process.ProcessName,
                        WindowTitle: process.MainWindowTitle,
                        ExecutablePath: path,
                        AppUserModelId: aumid,
                        WorkingSetBytes: process.WorkingSet64));
                }
                catch (InvalidOperationException)
                {
                    // Process exited between enumeration and inspection.
                }
                catch (System.ComponentModel.Win32Exception)
                {
                    // Protected process; identity is not readable without elevation.
                }
            }
        }

        return results
            .OrderBy(r => r.ProcessName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
