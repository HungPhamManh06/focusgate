using FocusGate.Agent.Poc.Models;
using Microsoft.Data.Sqlite;

namespace FocusGate.Agent.Poc.Services;

/// <summary>
/// Local SQLite event log for the PoC. The production agent needs durable local
/// storage for offline usage events; SQLite + WAL is the chosen mechanism.
/// </summary>
public sealed class SqliteEventStore : IDisposable
{
    private readonly SqliteConnection _connection;

    public SqliteEventStore(string databasePath)
    {
        var directory = Path.GetDirectoryName(Path.GetFullPath(databasePath));
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);

        _connection = new SqliteConnection($"Data Source={databasePath};Cache=Shared");
        _connection.Open();
    }

    public string DatabasePath => _connection.DataSource;

    public void Initialize()
    {
        using var command = _connection.CreateCommand();
        command.CommandText =
            """
            PRAGMA journal_mode = WAL;

            CREATE TABLE IF NOT EXISTS poc_usage_events (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                observed_at   TEXT    NOT NULL,
                process_id    INTEGER NOT NULL,
                process_name  TEXT    NOT NULL,
                window_title  TEXT    NOT NULL,
                category      TEXT    NULL,
                blocked       INTEGER NOT NULL,
                action        TEXT    NOT NULL,
                enforcer_ms   REAL    NOT NULL
            );

            CREATE INDEX IF NOT EXISTS ix_poc_usage_events_time
                ON poc_usage_events (observed_at);

            CREATE TABLE IF NOT EXISTS poc_self_test_results (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ran_at      TEXT    NOT NULL,
                check_name  TEXT    NOT NULL,
                status      TEXT    NOT NULL,
                detail      TEXT    NOT NULL
            );
            """;
        command.ExecuteNonQuery();
    }

    public void RecordEvent(ForegroundApp app, EnforcementDecision decision, string action, double enforcerMs)
    {
        using var command = _connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO poc_usage_events
                (observed_at, process_id, process_name, window_title, category, blocked, action, enforcer_ms)
            VALUES
                ($observedAt, $processId, $processName, $windowTitle, $category, $blocked, $action, $enforcerMs);
            """;
        command.Parameters.AddWithValue("$observedAt", app.ObservedAt.ToString("O"));
        command.Parameters.AddWithValue("$processId", app.ProcessId);
        command.Parameters.AddWithValue("$processName", app.ProcessName);
        command.Parameters.AddWithValue("$windowTitle", app.WindowTitle);
        command.Parameters.AddWithValue("$category", (object?)decision.Category ?? DBNull.Value);
        command.Parameters.AddWithValue("$blocked", decision.ShouldBlock ? 1 : 0);
        command.Parameters.AddWithValue("$action", action);
        command.Parameters.AddWithValue("$enforcerMs", enforcerMs);
        command.ExecuteNonQuery();
    }

    public void RecordSelfTestCheck(string name, string status, string detail)
    {
        using var command = _connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO poc_self_test_results (ran_at, check_name, status, detail)
            VALUES ($ranAt, $name, $status, $detail);
            """;
        command.Parameters.AddWithValue("$ranAt", DateTimeOffset.Now.ToString("O"));
        command.Parameters.AddWithValue("$name", name);
        command.Parameters.AddWithValue("$status", status);
        command.Parameters.AddWithValue("$detail", detail);
        command.ExecuteNonQuery();
    }

    public int CountEvents()
    {
        using var command = _connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM poc_usage_events;";
        return Convert.ToInt32(command.ExecuteScalar());
    }

    public int CountBlockedEvents()
    {
        using var command = _connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM poc_usage_events WHERE blocked = 1;";
        return Convert.ToInt32(command.ExecuteScalar());
    }

    public void Dispose() => _connection.Dispose();
}
