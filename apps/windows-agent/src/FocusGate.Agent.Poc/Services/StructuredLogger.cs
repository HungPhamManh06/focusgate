using System.Text;
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

        var payload = line + Environment.NewLine;

        lock (_gate)
        {
            Directory.CreateDirectory(_logDirectory);
            var primaryPath = CurrentLogFilePath;
            if (TryAppendLine(primaryPath, payload))
            {
                return;
            }

            // Another process may hold an exclusive lock on the shared daily log.
            // Fall back to a per-process log file so logging never crashes the UI.
            var fallbackPath = Path.Combine(
                _logDirectory,
                $"agent-{DateTimeOffset.UtcNow:yyyy-MM-dd}-pid{Environment.ProcessId}.jsonl");
            TryAppendLine(fallbackPath, payload);
        }
    }

    private static bool TryAppendLine(string path, string payload)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                using var stream = new FileStream(
                    path,
                    FileMode.Append,
                    FileAccess.Write,
                    FileShare.ReadWrite);
                using var writer = new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
                writer.Write(payload);
                return true;
            }
            catch (IOException) when (attempt < 2)
            {
                Thread.Sleep(15 * (attempt + 1));
            }
            catch (IOException)
            {
                return false;
            }
            catch (UnauthorizedAccessException)
            {
                return false;
            }
        }

        return false;
    }

    private sealed record LogEntry(
        string TimestampUtc,
        string Level,
        string Event,
        string Message,
        IReadOnlyDictionary<string, object?>? Fields);
}
