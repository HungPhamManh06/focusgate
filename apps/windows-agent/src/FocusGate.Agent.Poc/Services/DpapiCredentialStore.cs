using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace FocusGate.Agent.Poc.Services;

public sealed record AgentCredentials(
    string ApiBaseUrl,
    string DeviceId,
    string DeviceName,
    string AccessToken,
    string? RefreshToken,
    DateTimeOffset RegisteredAtUtc);

/// <summary>
/// Persists device credentials encrypted with Windows DPAPI (CurrentUser scope)
/// so the agent survives restarts without writing plaintext tokens to disk.
/// </summary>
public sealed class DpapiCredentialStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("FocusGate.Agent.Credentials.v1");
    private readonly string _filePath;

    public DpapiCredentialStore(string? filePath = null)
    {
        _filePath = filePath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FocusGate",
            "Agent",
            "credentials.dpapi");
    }

    public string FilePath => _filePath;

    public void Save(AgentCredentials credentials)
    {
        ArgumentNullException.ThrowIfNull(credentials);
        var directory = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var jsonBytes = JsonSerializer.SerializeToUtf8Bytes(credentials);
        var encrypted = ProtectedData.Protect(jsonBytes, Entropy, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(_filePath, encrypted);
    }

    public AgentCredentials? Load()
    {
        if (!File.Exists(_filePath))
        {
            return null;
        }

        var encrypted = File.ReadAllBytes(_filePath);
        if (encrypted.Length == 0)
        {
            return null;
        }

        var decrypted = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
        return JsonSerializer.Deserialize<AgentCredentials>(decrypted);
    }

    public void Clear()
    {
        if (File.Exists(_filePath))
        {
            File.Delete(_filePath);
        }
    }
}
