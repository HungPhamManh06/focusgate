using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace FocusGate.Agent.Poc.Services;

public sealed record DeviceRegistrationResult(
    string DeviceId,
    string Name,
    string Platform,
    string Status);

public sealed record ActiveFocusSummary(
    string Id,
    string? TaskTitle,
    string Status);

public sealed record AgentPolicySnapshot(
    DateTimeOffset PulledAtUtc,
    bool LockActive,
    IReadOnlyList<string> BlockedProcesses,
    IReadOnlyList<string> AllowedProcesses,
    bool WhitelistFocusMode = false,
    int EarnedMinutesBalance = 0,
    ActiveFocusSummary? ActiveFocusSession = null,
    string Language = "en");

public sealed record DiscoveredAppUpload(
    string Identifier,
    string DisplayName);

public sealed record UsageEventUpload(
    string ClientEventId,
    string Identifier,
    string? DisplayName,
    DateTimeOffset StartedAt,
    DateTimeOffset? EndedAt,
    int DurationSeconds,
    bool WasBlocked);

public sealed record UsageUploadResult(int Accepted, int Duplicates);

/// <summary>
/// HTTP client for registering this Windows device and pulling enforcement policy
/// without executing enforcement yet (Phase 1.4 skeleton).
/// </summary>
public sealed class AgentSyncClient : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _http;
    private readonly bool _ownsHttp;

    public AgentSyncClient(HttpClient? httpClient = null)
    {
        _http = httpClient ?? new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        _ownsHttp = httpClient is null;
    }

    public async Task<DeviceRegistrationResult> RegisterDeviceAsync(
        string apiBaseUrl,
        string accessToken,
        string deviceName,
        string appVersion,
        CancellationToken cancellationToken = default)
    {
        var baseUri = NormalizeBaseUrl(apiBaseUrl);
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(baseUri, "/api/devices/register"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = JsonContent.Create(new
        {
            name = deviceName,
            platform = "windows",
            osVersion = Environment.OSVersion.VersionString,
            appVersion,
        });

        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException(
                $"Device registration failed ({(int)response.StatusCode}): {body}",
                null,
                response.StatusCode);
        }

        var result = await response.Content.ReadFromJsonAsync<DeviceRegistrationResult>(JsonOptions, cancellationToken);
        return result ?? throw new InvalidDataException("Empty registration response.");
    }

    public async Task<AgentPolicySnapshot> PullPolicyAsync(
        string apiBaseUrl,
        string accessToken,
        string deviceId,
        CancellationToken cancellationToken = default)
    {
        var baseUri = NormalizeBaseUrl(apiBaseUrl);
        var endpoint = new Uri(baseUri, $"/api/agent/policy?deviceId={Uri.EscapeDataString(deviceId)}");
        using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException(
                $"Policy pull failed ({(int)response.StatusCode}): {body}",
                null,
                response.StatusCode);
        }

        var result = await response.Content.ReadFromJsonAsync<AgentPolicySnapshot>(JsonOptions, cancellationToken);
        return result ?? throw new InvalidDataException("Empty policy response.");
    }

    public async Task<UsageUploadResult> PushUsageEventsAsync(
        string apiBaseUrl,
        string accessToken,
        string deviceId,
        IReadOnlyList<UsageEventUpload> events,
        CancellationToken cancellationToken = default)
    {
        var baseUri = NormalizeBaseUrl(apiBaseUrl);
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(baseUri, "/api/agent/usage"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = JsonContent.Create(new
        {
            deviceId,
            events,
        });

        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException(
                $"Usage upload failed ({(int)response.StatusCode}): {body}",
                null,
                response.StatusCode);
        }

        var result = await response.Content.ReadFromJsonAsync<UsageUploadResult>(JsonOptions, cancellationToken);
        return result ?? throw new InvalidDataException("Empty usage upload response.");
    }

    public async Task<SupabaseAuthResult> SignInWithPasswordAsync(
        string supabaseUrl,
        string anonKey,
        string email,
        string password,
        CancellationToken cancellationToken = default)
    {
        var baseUri = NormalizeBaseUrl(supabaseUrl);
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            new Uri(baseUri, "/auth/v1/token?grant_type=password"));
        request.Headers.TryAddWithoutValidation("apikey", anonKey);
        request.Content = JsonContent.Create(new
        {
            email,
            password,
        });

        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException(
                $"Supabase sign-in failed ({(int)response.StatusCode}): {body}",
                null,
                response.StatusCode);
        }

        using var doc = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
        var root = doc.RootElement;
        if (!root.TryGetProperty("access_token", out var accessTokenEl) ||
            string.IsNullOrWhiteSpace(accessTokenEl.GetString()))
        {
            throw new InvalidDataException("Supabase sign-in response missing access_token.");
        }

        var accessToken = accessTokenEl.GetString()!;
        var refreshToken = root.TryGetProperty("refresh_token", out var refreshEl)
            ? refreshEl.GetString()
            : null;
        return new SupabaseAuthResult(accessToken, refreshToken);
    }

    public async Task PushDiscoveredAppsAsync(
        string apiBaseUrl,
        string accessToken,
        string deviceId,
        IReadOnlyList<DiscoveredAppUpload> apps,
        CancellationToken cancellationToken = default)
    {
        var baseUri = NormalizeBaseUrl(apiBaseUrl);
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(baseUri, "/api/agent/apps"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = JsonContent.Create(new
        {
            deviceId,
            platform = "windows",
            apps,
        });

        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException(
                $"App discovery upload failed ({(int)response.StatusCode}): {body}",
                null,
                response.StatusCode);
        }
    }

    public async Task<int> ActivateUnlockPassAsync(
        string apiBaseUrl,
        string accessToken,
        int minutes = 10,
        CancellationToken cancellationToken = default)
    {
        var baseUri = NormalizeBaseUrl(apiBaseUrl);
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(baseUri, "/api/agent/unlock-pass"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = JsonContent.Create(new { minutes });

        using var response = await _http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException(
                $"Unlock pass failed ({(int)response.StatusCode}): {body}",
                null,
                response.StatusCode);
        }

        using var doc = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
        return doc.RootElement.TryGetProperty("earnedMinutesBalance", out var el) && el.TryGetInt32(out var bal)
            ? bal
            : 0;
    }

    public async Task<AiChatReply> AskAiAsync(
        string apiBaseUrl,
        string accessToken,
        string message,
        CancellationToken cancellationToken = default)
    {
        var baseUri = NormalizeBaseUrl(apiBaseUrl);
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(baseUri, "/api/agent/ai"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = JsonContent.Create(new { message });

        using var response = await _http.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"FocusGate AI failed ({(int)response.StatusCode}): {body}",
                null,
                response.StatusCode);
        }

        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(body) ? "{}" : body);
        var root = doc.RootElement;
        var reply = root.TryGetProperty("reply", out var replyEl) ? replyEl.GetString() ?? "Done." : "Done.";
        var shouldRefresh = root.TryGetProperty("shouldRefresh", out var refreshEl) && refreshEl.GetBoolean();
        string? actionLabel = null;
        var actionExecuted = false;
        if (root.TryGetProperty("action", out var actionEl) && actionEl.ValueKind == JsonValueKind.Object)
        {
            if (actionEl.TryGetProperty("label", out var labelEl)) actionLabel = labelEl.GetString();
            if (actionEl.TryGetProperty("executed", out var execEl)) actionExecuted = execEl.GetBoolean();
        }
        return new AiChatReply(reply, actionLabel, actionExecuted, shouldRefresh);
    }

    private static Uri NormalizeBaseUrl(string apiBaseUrl)
    {
        if (!Uri.TryCreate(apiBaseUrl.Trim(), UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new ArgumentException($"Invalid API base URL: {apiBaseUrl}", nameof(apiBaseUrl));
        }

        return uri;
    }

    public void Dispose()
    {
        if (_ownsHttp)
        {
            _http.Dispose();
        }
    }
}

public sealed record SupabaseAuthResult(string AccessToken, string? RefreshToken);

public sealed record AiChatReply(
    string Reply,
    string? ActionLabel,
    bool ActionExecuted,
    bool ShouldRefresh);
