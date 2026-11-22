using System.Text.Json;
using System.Text.Json.Serialization;

namespace FocusGate.Agent.Poc.Services;

public enum LogLevel
{
    Info,
    Warn,
    Error,
}

/// <summary>
/// Appends structured JSON-lines events to a daily log file so agent lifecycle,
/// registration, and policy sync decisions can be inspected after restarts.
/// </summary>
public sealed class StructuredLogger
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly string _logDirectory;
    private readonly Lock _gate = new();

    public StructuredLogger(string? logDirectory = null)
    {
        _logDirectory = logDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FocusGate",
            "Agent",
            "logs");
    }

    public string LogDirectory => _logDirectory;

    public string CurrentLogFilePath =>
        Path.Combine(_logDirectory, $"agent-{DateTimeOffset.UtcNow:yyyy-MM-dd}.jsonl");

    public void Info(string eventName, string message, IReadOnlyDictionary<string, object?>? fields = null) =>
        Write(LogLevel.Info, eventName, message, fields);

    public void Warn(string eventName, string message, IReadOnlyDictionary<string, object?>? fields = null) =>
        Write(LogLevel.Warn, eventName, message, fields);

    public void Error(string eventName, string message, IReadOnlyDictionary<string, object?>? fields = null) =>
        Write(LogLevel.Error, eventName, message, fields);

    public void Write(
        LogLevel level,
        string eventName,
        string message,
        IReadOnlyDictionary<string, object?>? fields = null)
    {
        var entry = new LogEntry(
            TimestampUtc: DateTimeOffset.UtcNow.ToString("O"),
            Level: level.ToString().ToLowerInvariant(),
            Event: eventName,
            Message: message,
            Fields: fields);

        var line = JsonSerializer.Serialize(entry, JsonOptions);

        lock (_gate)
        {
            Directory.CreateDirectory(_logDirectory);
            File.AppendAllText(CurrentLogFilePath, line + Environment.NewLine);
        }
    }

    private sealed record LogEntry(
        string TimestampUtc,
        string Level,
        string Event,
        string Message,
        IReadOnlyDictionary<string, object?>? Fields);
}
