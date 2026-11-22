using System.Text.Json;
using FocusGate.Agent.Poc.Models;

namespace FocusGate.Agent.Poc.Services;

/// <summary>
/// Persists the last pulled AgentPolicySnapshot to disk so the agent can retain
/// lock state across restarts or temporary offline periods.
/// </summary>
public sealed class PolicyCacheStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
    };

    private readonly string _filePath;

    public PolicyCacheStore(string? filePath = null)
    {
        _filePath = filePath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FocusGate",
            "Agent",
            "policy-cache.json");
    }

    public string FilePath => _filePath;

    public void Save(AgentPolicySnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        var dir = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var json = JsonSerializer.Serialize(snapshot, JsonOptions);
        File.WriteAllText(_filePath, json);
    }

    public AgentPolicySnapshot? Load()
    {
        if (!File.Exists(_filePath)) return null;
        var json = File.ReadAllText(_filePath);
        if (string.IsNullOrWhiteSpace(json)) return null;
        return JsonSerializer.Deserialize<AgentPolicySnapshot>(json, JsonOptions);
    }

    public static BlockPolicy ToBlockPolicy(AgentPolicySnapshot snapshot)
    {
        if (!snapshot.LockActive)
        {
            return new BlockPolicy
            {
                AllowlistProcessNames = [.. snapshot.AllowedProcesses],
            };
        }

        return new BlockPolicy
        {
            AllowlistProcessNames = [.. snapshot.AllowedProcesses],
            Blocked = snapshot.BlockedProcesses.Count > 0
                ?
                [
                    new PolicyEntry
                    {
                        Category = "synced",
                        ProcessNames = [.. snapshot.BlockedProcesses],
                    },
                ]
                : [],
        };
    }
}
