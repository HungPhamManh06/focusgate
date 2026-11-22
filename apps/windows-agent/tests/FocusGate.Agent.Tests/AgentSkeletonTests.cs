using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FocusGate.Agent.Poc.Models;
using FocusGate.Agent.Poc.Services;
using Xunit;

namespace FocusGate.Agent.Tests;

public sealed class AgentSkeletonTests : IDisposable
{
    private readonly string _tempDir;

    public AgentSkeletonTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"focusgate-agent-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    [Fact]
    public void DpapiCredentialStore_SurvivesRestart_AndEncryptsOnDisk()
    {
        var path = Path.Combine(_tempDir, "credentials.dpapi");
        var writer = new DpapiCredentialStore(path);
        var creds = new AgentCredentials(
            ApiBaseUrl: "http://localhost:3000",
            DeviceId: "dev-1234-5678",
            DeviceName: "Workstation",
            AccessToken: "secret-access-token-value",
            RefreshToken: "secret-refresh-token",
            RegisteredAtUtc: new DateTimeOffset(2026, 11, 22, 8, 0, 0, TimeSpan.Zero));

        writer.Save(creds);

        // Verify disk contents are DPAPI-protected, not plaintext JSON
        var rawDisk = File.ReadAllBytes(path);
        var rawText = Encoding.UTF8.GetString(rawDisk);
        Assert.DoesNotContain("secret-access-token-value", rawText, StringComparison.Ordinal);

        // Simulate restart with a fresh DpapiCredentialStore instance
        var reader = new DpapiCredentialStore(path);
        var loaded = reader.Load();
        Assert.NotNull(loaded);
        Assert.Equal(creds, loaded);

        // Tampering with ciphertext fails decryption
        rawDisk[0] ^= 0xFF;
        File.WriteAllBytes(path, rawDisk);
        Assert.ThrowsAny<CryptographicException>(() => reader.Load());
    }

    [Fact]
    public void StructuredLogger_WritesValidJsonLines()
    {
        var logDir = Path.Combine(_tempDir, "logs");
        var logger = new StructuredLogger(logDir);

        logger.Info("agent.started", "Windows agent skeleton started.", new Dictionary<string, object?>
        {
            ["mode"] = "tray",
            ["deviceName"] = "Work PC",
        });
        logger.Warn("agent.offline", "Server unreachable.");

        var lines = File.ReadAllLines(logger.CurrentLogFilePath);
        Assert.Equal(2, lines.Length);

        using var doc1 = JsonDocument.Parse(lines[0]);
        Assert.Equal("info", doc1.RootElement.GetProperty("Level").GetString());
        Assert.Equal("agent.started", doc1.RootElement.GetProperty("Event").GetString());
        Assert.Equal("tray", doc1.RootElement.GetProperty("Fields").GetProperty("mode").GetString());

        using var doc2 = JsonDocument.Parse(lines[1]);
        Assert.Equal("warn", doc2.RootElement.GetProperty("Level").GetString());
    }

    [Fact]
    public async Task AgentSyncClient_RegistersDeviceAndPullsPolicy()
    {
        var seenRequests = new List<(HttpMethod Method, string PathAndQuery, string? Auth)>();
        var handler = new StubHttpMessageHandler((request) =>
        {
            seenRequests.Add((
                request.Method,
                request.RequestUri!.PathAndQuery,
                request.Headers.Authorization?.ToString()));

            if (request.RequestUri.AbsolutePath == "/api/devices/register")
            {
                return JsonResponse(HttpStatusCode.OK, new
                {
                    deviceId = "dev-999",
                    name = "Test Laptop",
                    platform = "windows",
                    status = "active",
                });
            }

            if (request.RequestUri.AbsolutePath == "/api/agent/policy")
            {
                return JsonResponse(HttpStatusCode.OK, new
                {
                    pulledAtUtc = "2026-11-22T08:30:00Z",
                    lockActive = true,
                    blockedProcesses = new[] { "steam", "discord" },
                    allowedProcesses = new[] { "code" },
                });
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        });

        using var http = new HttpClient(handler);
        using var client = new AgentSyncClient(http);

        var reg = await client.RegisterDeviceAsync("http://localhost:3000", "jwt-token", "Test Laptop", "0.1.0");
        Assert.Equal("dev-999", reg.DeviceId);
        Assert.Equal("windows", reg.Platform);

        var policy = await client.PullPolicyAsync("http://localhost:3000", "jwt-token", reg.DeviceId);
        Assert.True(policy.LockActive);
        Assert.Equal(["steam", "discord"], policy.BlockedProcesses);
        Assert.Equal(2, seenRequests.Count);
        Assert.All(seenRequests, req => Assert.Equal("Bearer jwt-token", req.Auth));
    }

    [Fact]
    public void AgentOptions_ParsesTrayStatusAndApiUrlFlags()
    {
        var tray = AgentOptions.Parse(["--tray", "--api-url", "https://focus.example", "--device-name", "Desk"]);
        Assert.Equal(AgentMode.Tray, tray.Mode);
        Assert.Equal("https://focus.example", tray.ApiBaseUrl);
        Assert.Equal("Desk", tray.DeviceName);

        var status = AgentOptions.Parse(["--status"]);
        Assert.Equal(AgentMode.Status, status.Mode);
    }

    private static HttpResponseMessage JsonResponse(HttpStatusCode status, object body) =>
        new(status)
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
        };

    private sealed class StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            Task.FromResult(handler(request));
    }
}
