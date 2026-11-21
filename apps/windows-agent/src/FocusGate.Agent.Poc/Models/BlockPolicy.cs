using System.Text.Json;
using System.Text.Json.Serialization;

namespace FocusGate.Agent.Poc.Models;

/// <summary>
/// PoC policy: a user-chosen block list plus a mandatory allow list.
/// The allow list always wins so essential system software keeps working.
/// </summary>
public sealed class BlockPolicy
{
    [JsonPropertyName("blocked")]
    public List<PolicyEntry> Blocked { get; init; } = [];

    [JsonPropertyName("allowlistProcessNames")]
    public List<string> AllowlistProcessNames { get; init; } = [];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public static BlockPolicy Load(string path)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"Policy file not found: {path}", path);
        }
        var json = File.ReadAllText(path);
        var policy = JsonSerializer.Deserialize<BlockPolicy>(json, JsonOptions)
                     ?? throw new InvalidDataException($"Policy file '{path}' is empty or invalid.");
        return policy;
    }

    public PolicyMatch? Match(ForegroundApp app)
    {
        if (IsAllowlisted(app)) return null;

        foreach (var entry in Blocked)
        {
            if (entry.ProcessNames.Any(name => NameEquals(name, app.ProcessName)) ||
                (app.AppUserModelId is not null &&
                 entry.AppUserModelIds.Any(id => AppIdEquals(id, app.AppUserModelId))))
            {
                return new PolicyMatch(entry, entry.Category);
            }
        }
        return null;
    }

    public bool IsAllowlisted(ForegroundApp app) =>
        AllowlistProcessNames.Any(name =>
            NameEquals(name, app.ProcessName) ||
            (app.AppUserModelId is not null && AppIdEquals(name, app.AppUserModelId)));

    private static bool NameEquals(string expected, string actual) =>
        string.Equals(StripExe(expected), StripExe(actual), StringComparison.OrdinalIgnoreCase);

    private static bool AppIdEquals(string expected, string actual) =>
        string.Equals(expected, actual, StringComparison.OrdinalIgnoreCase) ||
        actual.StartsWith(expected + "_", StringComparison.OrdinalIgnoreCase) ||
        actual.Contains("!" + expected, StringComparison.OrdinalIgnoreCase);

    private static string StripExe(string value) =>
        value.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? value[..^4] : value;
}

public sealed class PolicyEntry
{
    public string Category { get; init; } = "general";
    public List<string> ProcessNames { get; init; } = [];
    public List<string> AppUserModelIds { get; init; } = [];
}

public sealed record PolicyMatch(PolicyEntry Entry, string Category);
