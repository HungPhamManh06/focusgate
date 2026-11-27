using System.Diagnostics;
using System.Reflection;
using System.Text.Json;

namespace FocusGate.Agent.Poc.Services;

public sealed record WindowsUpdateInfo(
    string TagName,
    string DownloadUrl,
    bool IsDirectExe,
    bool IsNewerThanCurrent);

/// <summary>
/// Checks GitHub Releases for newer FocusGate Windows Agent (`windows-v*`) builds
/// and performs 1-click in-place self-update (download -> swap EXE -> relaunch).
/// </summary>
public static class WindowsAppUpdater
{
    private const string ReleasesListApi =
        "https://api.github.com/repos/HungPhamManh06/focusgate/releases?per_page=15";

    public static Version CurrentVersion =>
        Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 1, 0);

    public static async Task<WindowsUpdateInfo?> CheckLatestReleaseAsync(
        HttpClient? httpClient = null,
        CancellationToken cancellationToken = default)
    {
        using var owned = httpClient is null ? new HttpClient { Timeout = TimeSpan.FromSeconds(12) } : null;
        var client = httpClient ?? owned!;
        using var request = new HttpRequestMessage(HttpMethod.Get, ReleasesListApi);
        request.Headers.UserAgent.ParseAdd("FocusGate-WindowsAgent/1.0");
        request.Headers.Accept.ParseAdd("application/vnd.github+json");

        try
        {
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return null;

            foreach (var release in doc.RootElement.EnumerateArray())
            {
                var tag = release.TryGetProperty("tag_name", out var t) ? t.GetString() ?? "" : "";
                var htmlUrl = release.TryGetProperty("html_url", out var h) ? h.GetString() ?? "" : "";

                string? exeUrl = null;
                if (release.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
                {
                    foreach (var asset in assets.EnumerateArray())
                    {
                        var name = asset.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                        if (name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                        {
                            exeUrl = asset.TryGetProperty("browser_download_url", out var u) ? u.GetString() : null;
                            break;
                        }
                    }
                }

                if (!tag.StartsWith("windows-", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(exeUrl))
                {
                    continue;
                }

                var isDirectExe = !string.IsNullOrWhiteSpace(exeUrl);
                var target = isDirectExe ? exeUrl! : htmlUrl;
                if (string.IsNullOrWhiteSpace(tag) || string.IsNullOrWhiteSpace(target)) continue;

                return new WindowsUpdateInfo(
                    TagName: tag,
                    DownloadUrl: target,
                    IsDirectExe: isDirectExe,
                    IsNewerThanCurrent: IsNewerTag(tag, CurrentVersion));
            }
            return null;
        }
        catch
        {
            return null;
        }
    }

    public static bool IsNewerTag(string tagName, Version currentVersion)
    {
        var numeric = tagName
            .Replace("windows-v", "", StringComparison.OrdinalIgnoreCase)
            .Replace("v", "", StringComparison.OrdinalIgnoreCase)
            .Trim();
        if (!Version.TryParse(numeric, out var remoteVer)) return true;
        var cur = new Version(
            Math.Max(0, currentVersion.Major),
            Math.Max(0, currentVersion.Minor),
            Math.Max(0, currentVersion.Build));
        var rem = new Version(
            Math.Max(0, remoteVer.Major),
            Math.Max(0, remoteVer.Minor),
            Math.Max(0, remoteVer.Build));
        return rem > cur;
    }

    /// <summary>
    /// Downloads the new FocusGate.exe to %TEMP%, launches a detached self-swap script,
    /// and invokes <paramref name="exitCurrentApp"/> so the running executable replaces itself in place.
    /// </summary>
    public static async Task DownloadAndInstallInPlaceAsync(
        WindowsUpdateInfo update,
        IProgress<int>? progress,
        Action exitCurrentApp,
        CancellationToken cancellationToken = default)
    {
        if (!update.IsDirectExe)
        {
            OpenDownload(update.DownloadUrl);
            return;
        }

        var currentExePath = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(currentExePath) ||
            !currentExePath.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            OpenDownload(update.DownloadUrl);
            return;
        }

        var tempExePath = Path.Combine(Path.GetTempPath(), $"FocusGate-update-{Guid.NewGuid():N}.exe");
        var scriptPath = Path.Combine(Path.GetTempPath(), $"focusgate-swap-{Guid.NewGuid():N}.cmd");

        using (var client = new HttpClient { Timeout = TimeSpan.FromMinutes(5) })
        {
            client.DefaultRequestHeaders.UserAgent.ParseAdd("FocusGate-WindowsAgent/1.0");
            using var response = await client.GetAsync(
                update.DownloadUrl,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);
            response.EnsureSuccessStatusCode();

            var totalBytes = response.Content.Headers.ContentLength ?? -1L;
            await using var remoteStream = await response.Content.ReadAsStreamAsync(cancellationToken);
            await using var fileStream = new FileStream(tempExePath, FileMode.Create, FileAccess.Write, FileShare.None, 65536, true);

            var buffer = new byte[65536];
            long downloaded = 0;
            int lastPercent = -1;
            int bytesRead;
            while ((bytesRead = await remoteStream.ReadAsync(buffer, cancellationToken)) > 0)
            {
                await fileStream.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken);
                downloaded += bytesRead;
                if (totalBytes > 0)
                {
                    var pct = (int)Math.Clamp((downloaded * 100L) / totalBytes, 0, 100);
                    if (pct != lastPercent)
                    {
                        lastPercent = pct;
                        progress?.Report(pct);
                    }
                }
            }
        }

        var pid = Environment.ProcessId;
        var script = $"""
            @echo off
            setlocal
            :waitloop
            tasklist /FI "PID eq {pid}" 2>NUL | find /I "{pid}" >NUL
            if "%ERRORLEVEL%"=="0" (
              timeout /t 1 /nobreak >NUL
              goto waitloop
            )
            timeout /t 1 /nobreak >NUL
            move /Y "{tempExePath}" "{currentExePath}" >NUL
            if errorlevel 1 (
              copy /Y "{tempExePath}" "{currentExePath}" >NUL
              del /F /Q "{tempExePath}" >NUL
            )
            start "" "{currentExePath}"
            del /F /Q "%~f0" >NUL
            """;
        await File.WriteAllTextAsync(scriptPath, script, cancellationToken);

        Process.Start(new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = $"/c \"\"{scriptPath}\"\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        });

        exitCurrentApp();
    }

    public static void OpenDownload(string url)
    {
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }
}
