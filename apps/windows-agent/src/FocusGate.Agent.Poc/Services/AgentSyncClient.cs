using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace FocusGate.Agent.Poc.Services;

public sealed record DeviceRegistrationResult(
    string DeviceId,
    string Name,
    string Platform,
    string Status);

public sealed record AgentPolicySnapshot(
    DateTimeOffset PulledAtUtc,
    bool LockActive,
    IReadOnlyList<string> BlockedProcesses,
    IReadOnlyList<string> AllowedProcesses);

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
