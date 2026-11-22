using System.Net;
using System.Text.Json;

namespace FocusGate.Agent.Poc.Services;

/// <summary>
/// Durable disk-backed queue for usage events so offline periods or transient API
/// errors never drop usage telemetry, and retries stay idempotent via ClientEventId.
/// </summary>
public sealed class OfflineUsageQueue
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly string _filePath;
    private readonly Lock _gate = new();

    public OfflineUsageQueue(string? filePath = null)
    {
        _filePath = filePath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FocusGate",
            "Agent",
            "usage-queue.json");
    }

    public int Count
    {
        get
        {
            lock (_gate)
            {
                return ReadUnsafe().Count;
            }
        }
    }

    public void Enqueue(UsageEventUpload item)
    {
        ArgumentNullException.ThrowIfNull(item);
        lock (_gate)
        {
            var items = ReadUnsafe();
            if (!items.Any(existing => string.Equals(existing.ClientEventId, item.ClientEventId, StringComparison.Ordinal)))
            {
                items.Add(item);
                WriteUnsafe(items);
            }
        }
    }

    public async Task<UsageUploadResult> FlushAsync(
        AgentSyncClient client,
        string apiBaseUrl,
        string accessToken,
        string deviceId,
        CancellationToken cancellationToken = default)
    {
        List<UsageEventUpload> batch;
        lock (_gate)
        {
            var items = ReadUnsafe();
            if (items.Count == 0)
            {
                return new UsageUploadResult(0, 0);
            }
            batch = items.Take(100).ToList();
        }

        try
        {
            var result = await client.PushUsageEventsAsync(
                apiBaseUrl,
                accessToken,
                deviceId,
                batch,
                cancellationToken);

            lock (_gate)
            {
                var items = ReadUnsafe();
                var sentIds = batch.Select(b => b.ClientEventId).ToHashSet(StringComparer.Ordinal);
                items.RemoveAll(item => sentIds.Contains(item.ClientEventId));
                WriteUnsafe(items);
            }

            return result;
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.Forbidden)
        {
            throw;
        }
    }

    private List<UsageEventUpload> ReadUnsafe()
    {
        if (!File.Exists(_filePath)) return [];
        var json = File.ReadAllText(_filePath);
        if (string.IsNullOrWhiteSpace(json)) return [];
        return JsonSerializer.Deserialize<List<UsageEventUpload>>(json, JsonOptions) ?? [];
    }

    private void WriteUnsafe(List<UsageEventUpload> items)
    {
        var dir = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        if (items.Count == 0)
        {
            if (File.Exists(_filePath)) File.Delete(_filePath);
            return;
        }

        File.WriteAllText(_filePath, JsonSerializer.Serialize(items, JsonOptions));
    }
}
