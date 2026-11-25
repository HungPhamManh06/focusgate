using System.Diagnostics;
using System.Text.Json;

namespace FocusGate.Agent.Poc.Services;

public sealed record WindowsUpdateInfo(string TagName, string DownloadUrl);

/// <summary>
/// Checks GitHub Releases for newer FocusGate Windows Agent builds and opens
/// the release download cleanly in 1 click.
/// </summary>
public static class WindowsAppUpdater
{
    private const string LatestReleaseApi =
        "https://api.github.com/repos/HungPhamManh06/focusgate/releases/latest";

    public static async Task<WindowsUpdateInfo?> CheckLatestReleaseAsync(
        HttpClient? httpClient = null,
        CancellationToken cancellationToken = default)
    {
        using var owned = httpClient is null ? new HttpClient { Timeout = TimeSpan.FromSeconds(10) } : null;
        var client = httpClient ?? owned!;
        using var request = new HttpRequestMessage(HttpMethod.Get, LatestReleaseApi);
        request.Headers.UserAgent.ParseAdd("FocusGate-WindowsAgent/1.0");
        request.Headers.Accept.ParseAdd("application/vnd.github+json");

        try
        {
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            var root = doc.RootElement;
            var tag = root.TryGetProperty("tag_name", out var t) ? t.GetString() ?? "" : "";
            var htmlUrl = root.TryGetProperty("html_url", out var h) ? h.GetString() ?? "" : "";

            string? zipUrl = null;
            if (root.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
            {
                foreach (var asset in assets.EnumerateArray())
                {
                    var name = asset.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                    if (name.Contains("Windows", StringComparison.OrdinalIgnoreCase) &&
                        name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                    {
                        zipUrl = asset.TryGetProperty("browser_download_url", out var u) ? u.GetString() : null;
                        break;
                    }
                }
            }

            var target = !string.IsNullOrWhiteSpace(zipUrl) ? zipUrl! : htmlUrl;
            if (string.IsNullOrWhiteSpace(tag) || string.IsNullOrWhiteSpace(target)) return null;
            return new WindowsUpdateInfo(tag, target);
        }
        catch
        {
            return null;
        }
    }

    public static void OpenDownload(string url)
    {
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }
}
