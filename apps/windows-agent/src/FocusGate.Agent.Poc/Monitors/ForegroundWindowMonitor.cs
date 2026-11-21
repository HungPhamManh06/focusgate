using FocusGate.Agent.Poc.Native;

namespace FocusGate.Agent.Poc.Monitors;

/// <summary>
/// Event-driven foreground tracking. SetWinEventHook(EVENT_SYSTEM_FOREGROUND)
/// fires when the user switches applications, which is far cheaper and faster
/// than polling the process list. Poll() remains as a safety net because some
/// full-screen transitions and secure-desktop events do not raise the hook.
/// </summary>
public sealed class ForegroundWindowMonitor : IDisposable
{
    private readonly NativeMethods.WinEventDelegate _callback;
    private IntPtr _hook;
    private Models.ForegroundApp? _current;

    public ForegroundWindowMonitor()
    {
        _callback = (_, _, _, _, _, _, eventTime) =>
        {
            // dwmsEventTime shares the GetTickCount time base, so this is the real
            // delay between the OS raising the event and this handler running.
            var now = unchecked((uint)Environment.TickCount);
            LastEventLatencyMs = unchecked(now - eventTime);
            Poll();
        };
    }

    public Models.ForegroundApp? Current => _current;

    /// <summary>Milliseconds between the OS foreground event and the handler (last event).</summary>
    public uint LastEventLatencyMs { get; private set; }

    public bool HookInstalled => _hook != IntPtr.Zero;

    public event Action<Models.ForegroundApp>? ForegroundChanged;

    public bool Start()
    {
        _hook = NativeMethods.SetWinEventHook(
            NativeMethods.EVENT_SYSTEM_FOREGROUND,
            NativeMethods.EVENT_SYSTEM_FOREGROUND,
            IntPtr.Zero,
            _callback,
            0,
            0,
            NativeMethods.WINEVENT_OUTOFCONTEXT | NativeMethods.WINEVENT_SKIPOWNPROCESS);

        Poll();
        return _hook != IntPtr.Zero;
    }

    /// <summary>Reads the current foreground window and raises a change event if it moved.</summary>
    public Models.ForegroundApp? Poll()
    {
        var hwnd = NativeMethods.GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return _current;

        var app = WindowInspector.Describe(hwnd);
        if (app is null) return _current;

        if (_current is not null &&
            _current.ProcessId == app.ProcessId &&
            string.Equals(_current.WindowTitle, app.WindowTitle, StringComparison.Ordinal))
        {
            return _current;
        }

        _current = app;
        ForegroundChanged?.Invoke(app);
        return app;
    }

    public void Dispose()
    {
        if (_hook != IntPtr.Zero)
        {
            NativeMethods.UnhookWinEvent(_hook);
            _hook = IntPtr.Zero;
        }
    }
}
