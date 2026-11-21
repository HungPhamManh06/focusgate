namespace FocusGate.Agent.Poc.Models;

/// <summary>A single foreground window observation, resolved to a real application.</summary>
public sealed record ForegroundApp(
    IntPtr WindowHandle,
    int ProcessId,
    string ProcessName,
    string WindowTitle,
    string WindowClass,
    string? ExecutablePath,
    string? AppUserModelId,
    bool IsUwpHosted,
    DateTimeOffset ObservedAt);
