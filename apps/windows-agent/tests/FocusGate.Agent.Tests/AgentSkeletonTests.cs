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
    public void StructuredLogger_FallsBackWithoutThrowingWhenPrimaryLogIsLocked()
    {
        var logDir = Path.Combine(_tempDir, "locked-logs");
        Directory.CreateDirectory(logDir);
        var logger = new StructuredLogger(logDir);

        // Simulate another process holding an exclusive lock on today's log file.
        using var lockStream = new FileStream(
            logger.CurrentLogFilePath,
            FileMode.OpenOrCreate,
            FileAccess.ReadWrite,
            FileShare.None);

        var ex = Record.Exception(() => logger.Info("agent.heartbeat", "Fallback write test."));
        Assert.Null(ex);

        var fallbackPath = Path.Combine(
            logDir,
            $"agent-{DateTimeOffset.UtcNow:yyyy-MM-dd}-pid{Environment.ProcessId}.jsonl");
        Assert.True(File.Exists(fallbackPath));
        var fallbackLines = File.ReadAllLines(fallbackPath);
        Assert.Single(fallbackLines);
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

            if (request.RequestUri.AbsolutePath == "/api/agent/usage")
            {
                return JsonResponse(HttpStatusCode.OK, new
                {
                    accepted = 1,
                    duplicates = 0,
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

        var upload = await client.PushUsageEventsAsync("http://localhost:3000", "jwt-token", reg.DeviceId,
        [
            new UsageEventUpload(
                ClientEventId: "evt-12345678",
                Identifier: "steam.exe",
                DisplayName: "Steam",
                StartedAt: new DateTimeOffset(2026, 11, 22, 8, 25, 0, TimeSpan.Zero),
                EndedAt: new DateTimeOffset(2026, 11, 22, 8, 26, 0, TimeSpan.Zero),
                DurationSeconds: 60,
                WasBlocked: true),
        ]);
        Assert.Equal(1, upload.Accepted);
        Assert.Equal(3, seenRequests.Count);
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

    [Fact]
    public void PolicyCacheStore_PersistsSnapshot_AndMapsBlockPolicy()
    {
        var cachePath = Path.Combine(_tempDir, "policy-cache.json");
        var cache = new PolicyCacheStore(cachePath);
        var snapshot = new AgentPolicySnapshot(
            PulledAtUtc: new DateTimeOffset(2026, 11, 22, 9, 0, 0, TimeSpan.Zero),
            LockActive: true,
            BlockedProcesses: ["steam.exe", "discord.exe"],
            AllowedProcesses: ["code.exe"]);

        cache.Save(snapshot);
        var loaded = cache.Load();
        Assert.NotNull(loaded);
        Assert.True(loaded.LockActive);
        Assert.Equal(["steam.exe", "discord.exe"], loaded.BlockedProcesses);

        var steamApp = new ForegroundApp(0, 1, "steam", "Steam", "SDL_app", null, null, false, DateTimeOffset.UtcNow);
        var codeApp = new ForegroundApp(0, 2, "code", "VS Code", "Chrome_WidgetWin_1", null, null, false, DateTimeOffset.UtcNow);

        var lockedPolicy = PolicyCacheStore.ToBlockPolicy(loaded);
        Assert.Single(lockedPolicy.Blocked);
        Assert.NotNull(lockedPolicy.Match(steamApp));
        Assert.Null(lockedPolicy.Match(codeApp));

        var unlockedPolicy = PolicyCacheStore.ToBlockPolicy(loaded with { LockActive = false });
        Assert.Empty(unlockedPolicy.Blocked);
        Assert.Null(unlockedPolicy.Match(steamApp));
    }

    [Fact]
    public async Task OfflineUsageQueue_RetainsEventsOnFailure_AndClearsAfterRetry()
    {
        var queuePath = Path.Combine(_tempDir, "usage-queue.json");
        var queue = new OfflineUsageQueue(queuePath);
        queue.Enqueue(new UsageEventUpload(
            ClientEventId: "evt-offline-001",
            Identifier: "steam.exe",
            DisplayName: "Steam",
            StartedAt: DateTimeOffset.UtcNow.AddMinutes(-2),
            EndedAt: DateTimeOffset.UtcNow,
            DurationSeconds: 120,
            WasBlocked: true));

        Assert.Equal(1, queue.Count);

        var failFirst = true;
        var handler = new StubHttpMessageHandler(_ =>
        {
            if (failFirst)
            {
                return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
            }
            return JsonResponse(HttpStatusCode.OK, new { accepted = 1, duplicates = 0 });
        });

        using var http = new HttpClient(handler);
        using var client = new AgentSyncClient(http);

        await Assert.ThrowsAsync<HttpRequestException>(() =>
            queue.FlushAsync(client, "http://localhost:3000", "jwt", "dev-1"));
        Assert.Equal(1, queue.Count);

        failFirst = false;
        var res = await queue.FlushAsync(client, "http://localhost:3000", "jwt", "dev-1");
        Assert.Equal(1, res.Accepted);
        Assert.Equal(0, queue.Count);
    }

    [Fact]
    public void EnforcementEngine_UpdatePolicy_SwapsRulesAtomically()
    {
        var steamApp = new ForegroundApp(0, 1, "steam", "Steam", "SDL_app", null, null, false, DateTimeOffset.UtcNow);
        var engine = new EnforcementEngine(new BlockPolicy());
        Assert.False(engine.Evaluate(steamApp).ShouldBlock);

        engine.UpdatePolicy(new BlockPolicy
        {
            Blocked = [new PolicyEntry { Category = "games", ProcessNames = ["steam.exe"] }],
        });
        Assert.True(engine.Evaluate(steamApp).ShouldBlock);
    }

    [Fact]
    public void AgentPolicySnapshot_DeserializesLanguage_DefaultsToEnWhenOmitted()
    {
        var opts = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var vi = JsonSerializer.Deserialize<AgentPolicySnapshot>(
            """{"pulledAtUtc":"2026-11-24T01:00:00Z","lockActive":true,"blockedProcesses":[],"allowedProcesses":[],"language":"vi"}""",
            opts);
        Assert.NotNull(vi);
        Assert.Equal("vi", vi.Language);

        var defaultLang = JsonSerializer.Deserialize<AgentPolicySnapshot>(
            """{"pulledAtUtc":"2026-11-24T01:00:00Z","lockActive":false,"blockedProcesses":[],"allowedProcesses":[]}""",
            opts);
        Assert.NotNull(defaultLang);
        Assert.Equal("en", defaultLang.Language);
    }

    [Fact]
    public void WindowsDesktopCulture_SupportsLcid1033ForWinFormsAndWebView2()
    {
        var culture = System.Globalization.CultureInfo.GetCultureInfo(1033);
        Assert.Equal("en-US", culture.Name);
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
