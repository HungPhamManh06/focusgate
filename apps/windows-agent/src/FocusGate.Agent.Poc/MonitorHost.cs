using System.Diagnostics;
using FocusGate.Agent.Poc.Models;
using FocusGate.Agent.Poc.Monitors;
using FocusGate.Agent.Poc.Services;
using FocusGate.Agent.Poc.UI;

namespace FocusGate.Agent.Poc;

/// <summary>
/// Runs the observation/enforcement loop inside a WinForms message pump, because
/// SetWinEventHook delivers callbacks on the installing thread's message loop.
/// </summary>
public sealed class MonitorHost : ApplicationContext
{
    private readonly AgentOptions _options;
    private readonly SqliteEventStore _store;
    private readonly EnforcementEngine _engine;
    private readonly ForegroundWindowMonitor _monitor = new();
    private readonly System.Windows.Forms.Timer _ticker;
    private readonly Stopwatch _elapsed = Stopwatch.StartNew();

    private BlockOverlayForm? _overlay;
    private string? _overlayProcess;
    private int _observations;
    private int _blockedObservations;
    private double _maxEventLatencyMs;

    public MonitorHost(AgentOptions options, BlockPolicy policy, SqliteEventStore store)
    {
        _options = options;
        _store = store;
        _engine = new EnforcementEngine(policy);

        Console.WriteLine("FocusGate Windows Agent – Phase 0 monitor");
        Console.WriteLine($"Policy:      {Path.GetFullPath(options.PolicyPath)}");
        Console.WriteLine($"Database:    {store.DatabasePath}");
        Console.WriteLine($"Enforcement: {options.Enforcement}  (log = observe only)");
        Console.WriteLine($"Duration:    {options.Seconds}s. Switch between apps to generate events.");
        Console.WriteLine();

        _monitor.ForegroundChanged += OnForegroundChanged;

        _ticker = new System.Windows.Forms.Timer { Interval = 500 };
        _ticker.Tick += OnTick;
        _ticker.Start();

        if (!_monitor.Start())
        {
            Console.Error.WriteLine("WARNING: foreground event hook failed; relying on 500 ms polling.");
        }
    }

    public int ExitCode { get; private set; }

    private void OnTick(object? sender, EventArgs e)
    {
        // Safety net: some transitions (secure desktop, full-screen mode changes)
        // do not raise EVENT_SYSTEM_FOREGROUND.
        try
        {
            _monitor.Poll();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Poll error: {ex.Message}");
        }

        if (_elapsed.Elapsed.TotalSeconds >= _options.Seconds)
        {
            Finish();
        }
    }

    private void OnForegroundChanged(ForegroundApp app)
    {
        var timer = Stopwatch.StartNew();
        EnforcementDecision decision;
        try
        {
            decision = _engine.Evaluate(app);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Policy evaluation failed for {app.ProcessName}: {ex.Message}");
            return;
        }

        var actionNote = "none";
        if (decision.ShouldBlock)
        {
            actionNote = ApplyEnforcement(app, decision);
        }

        timer.Stop();

        try
        {
            _store.RecordEvent(app, decision, actionNote, timer.Elapsed.TotalMilliseconds);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Could not persist event: {ex.Message}");
        }

        _observations++;
        if (decision.ShouldBlock) _blockedObservations++;
        _maxEventLatencyMs = Math.Max(_maxEventLatencyMs, _monitor.LastEventLatencyMs);

        var verdict = decision.ShouldBlock ? $"BLOCK[{decision.Category}] -> {actionNote}" : "allow";
        Console.WriteLine(
            $"{app.ObservedAt:HH:mm:ss.fff}  {app.ProcessName,-22} {verdict,-28} " +
            $"hook={_monitor.LastEventLatencyMs,3}ms apply={timer.Elapsed.TotalMilliseconds,5:F1}ms  " +
            $"\"{Shorten(app.WindowTitle, 42)}\"");
    }

    private string ApplyEnforcement(ForegroundApp app, EnforcementDecision decision)
    {
        switch (_options.Enforcement)
        {
            case EnforcementAction.Log:
                return "log";

            case EnforcementAction.Minimize:
                if (app.WindowHandle == IntPtr.Zero) return "minimize-skipped";
                var minimized = Native.NativeMethods.ShowWindow(app.WindowHandle, Native.NativeMethods.SW_MINIMIZE);
                return minimized ? "minimize" : "minimize-failed";

            case EnforcementAction.Terminate:
                return Terminate(app);

            case EnforcementAction.Overlay:
                ShowOverlay(app, decision.Category ?? "blocked");
                return "overlay";

            default:
                return "none";
        }
    }

    private static string Terminate(ForegroundApp app)
    {
        // Never touch system-critical processes even if a policy file says so.
        if (app.ProcessId <= 4) return "terminate-refused-critical";
        try
        {
            using var process = Process.GetProcessById(app.ProcessId);
            process.Kill();
            return "terminate";
        }
        catch (Exception ex)
        {
            return $"terminate-failed({ex.GetType().Name})";
        }
    }

    private void ShowOverlay(ForegroundApp app, string category)
    {
        if (_overlay is { IsDisposed: false } && _overlayProcess == app.ProcessName)
        {
            _overlay.UpdateBlockedApp(app, category);
            if (!_overlay.Visible) _overlay.Show();
            _overlay.BringToFront();
            return;
        }

        _overlay?.Close();
        _overlay = new BlockOverlayForm(app, category);
        _overlayProcess = app.ProcessName;
        _overlay.FormClosed += (_, _) =>
        {
            _overlay = null;
            _overlayProcess = null;
        };
        _overlay.Show();
    }

    private void Finish()
    {
        _ticker.Stop();
        _monitor.ForegroundChanged -= OnForegroundChanged;
        _monitor.Dispose();
        _overlay?.Close();

        Console.WriteLine();
        Console.WriteLine("Summary");
        Console.WriteLine($"  observations:        {_observations}");
        Console.WriteLine($"  blocked observations:{_blockedObservations}");
        Console.WriteLine($"  max event latency:   {_maxEventLatencyMs:F0} ms (OS event time -> handler)");
        try
        {
            Console.WriteLine($"  rows stored:         {_store.CountEvents()} (blocked: {_store.CountBlockedEvents()})");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  rows stored:         unavailable ({ex.Message})");
            ExitCode = 1;
        }

        ExitThread();
    }

    private static string Shorten(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        return value.Length <= max ? value : value[..max] + "…";
    }
}
