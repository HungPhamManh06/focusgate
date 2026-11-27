using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace FocusGate.Agent.Poc.Services;

/// <summary>
/// Safe, structured Windows OS & app executor for FocusGate AI Omni-Controller.
/// Never executes arbitrary shell commands — only structured allowlisted actions.
/// </summary>
public static class PcCommandExecutor
{
    private const uint KeyEventFKeyUp = 0x0002;
    private const byte VkVolumeMute = 0xAD;
    private const byte VkVolumeDown = 0xAE;
    private const byte VkVolumeUp = 0xAF;
    private const byte VkMediaNextTrack = 0xB0;
    private const byte VkMediaPrevTrack = 0xB1;
    private const byte VkMediaPlayPause = 0xB3;

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern bool LockWorkStation();

    private static readonly Dictionary<string, string[]> BrowserCandidates = new(StringComparer.OrdinalIgnoreCase)
    {
        ["chrome"] =
        [
            @"C:\Program Files\Google\Chrome\Application\chrome.exe",
            @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe"),
            "chrome.exe",
        ],
        ["edge"] =
        [
            @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            "msedge.exe",
        ],
        ["firefox"] =
        [
            @"C:\Program Files\Mozilla Firefox\firefox.exe",
            @"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
            "firefox.exe",
        ],
        ["brave"] =
        [
            @"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"BraveSoftware\Brave-Browser\Application\brave.exe"),
            "brave.exe",
        ],
        ["coccoc"] =
        [
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"CocCoc\Browser\Application\browser.exe"),
            @"C:\Program Files\CocCoc\Browser\Application\browser.exe",
        ],
    };

    private static readonly Dictionary<string, string> KnownAppAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["vs code"] = "code",
        ["vscode"] = "code",
        ["visual studio code"] = "code",
        ["notepad"] = "notepad.exe",
        ["calculator"] = "calc.exe",
        ["máy tính"] = "calc.exe",
        ["explorer"] = "explorer.exe",
        ["file explorer"] = "explorer.exe",
        ["paint"] = "mspaint.exe",
        ["terminal"] = "wt.exe",
        ["word"] = "winword.exe",
        ["excel"] = "excel.exe",
        ["powerpoint"] = "powerpnt.exe",
        ["chrome"] = "chrome.exe",
        ["edge"] = "msedge.exe",
        ["firefox"] = "firefox.exe",
        ["brave"] = "brave.exe",
        ["spotify"] = "spotify.exe",
        ["zalo"] = "Zalo.exe",
        ["discord"] = "Discord.exe",
        ["notion"] = "Notion.exe",
        ["telegram"] = "Telegram.exe",
    };

    public static (bool Ok, string Message) Execute(JsonElement command, Action? onToggleFloatingTimer = null)
    {
        if (command.ValueKind != JsonValueKind.Object)
        {
            return (false, "Invalid command payload.");
        }

        var type = command.TryGetProperty("type", out var typeEl) ? typeEl.GetString() : null;
        return type switch
        {
            "open_url_in_browser" => ExecuteOpenUrl(command),
            "launch_app" => ExecuteLaunchApp(command),
            "close_app" => ExecuteCloseApp(command),
            "media_control" => ExecuteMediaControl(command),
            "system_action" => ExecuteSystemAction(command, onToggleFloatingTimer),
            _ => (false, $"Unsupported PC command: {type ?? "unknown"}"),
        };
    }

    private static (bool Ok, string Message) ExecuteOpenUrl(JsonElement cmd)
    {
        var url = cmd.TryGetProperty("url", out var urlEl) ? urlEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(url) ||
            !Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            return (false, "Invalid or unsafe URL.");
        }

        var browser = cmd.TryGetProperty("browser", out var brEl) ? brEl.GetString() : null;
        if (!string.IsNullOrWhiteSpace(browser) && BrowserCandidates.TryGetValue(browser, out var candidates))
        {
            foreach (var exe in candidates)
            {
                if (Path.IsPathRooted(exe) && !File.Exists(exe)) continue;
                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = exe,
                        Arguments = $"\"{uri.AbsoluteUri}\"",
                        UseShellExecute = true,
                    });
                    return (true, $"Opened {uri.Host} in {browser}.");
                }
                catch
                {
                    // Try next candidate
                }
            }
        }

        try
        {
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
            return (true, $"Opened {uri.Host} in default browser.");
        }
        catch (Exception ex)
        {
            return (false, $"Could not open URL: {ex.Message}");
        }
    }

    private static (bool Ok, string Message) ExecuteLaunchApp(JsonElement cmd)
    {
        var appName = cmd.TryGetProperty("appName", out var appEl) ? appEl.GetString()?.Trim() : null;
        if (string.IsNullOrWhiteSpace(appName)) return (false, "Missing app name.");

        // 1. Check browser shortcuts first
        if (BrowserCandidates.TryGetValue(appName, out var browserExes))
        {
            foreach (var exe in browserExes)
            {
                if (Path.IsPathRooted(exe) && !File.Exists(exe)) continue;
                try
                {
                    Process.Start(new ProcessStartInfo(exe) { UseShellExecute = true });
                    return (true, $"Launched {appName}.");
                }
                catch { }
            }
        }

        // 2. Check Start Menu shortcuts (.lnk) for installed desktop apps (Zalo, Spotify, VS Code, etc.)
        var lnkPath = FindStartMenuShortcut(appName);
        if (lnkPath is not null)
        {
            try
            {
                Process.Start(new ProcessStartInfo(lnkPath) { UseShellExecute = true });
                return (true, $"Launched {appName}.");
            }
            catch { }
        }

        // 3. Check known alias executables
        if (KnownAppAliases.TryGetValue(appName, out var target))
        {
            try
            {
                Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
                return (true, $"Launched {appName}.");
            }
            catch { }
        }

        return (false, $"Could not find installed app '{appName}' on this PC.");
    }

    private static string? FindStartMenuShortcut(string appName)
    {
        var roots = new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.Programs),
            Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms),
        };
        var needle = appName.Trim();
        foreach (var root in roots)
        {
            if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root)) continue;
            try
            {
                foreach (var file in Directory.EnumerateFiles(root, "*.lnk", SearchOption.AllDirectories))
                {
                    var name = Path.GetFileNameWithoutExtension(file);
                    if (name.Contains(needle, StringComparison.OrdinalIgnoreCase))
                    {
                        return file;
                    }
                }
            }
            catch
            {
                // Ignore restricted directories
            }
        }
        return null;
    }

    private static (bool Ok, string Message) ExecuteCloseApp(JsonElement cmd)
    {
        var appName = cmd.TryGetProperty("appName", out var appEl) ? appEl.GetString()?.Trim() : null;
        if (string.IsNullOrWhiteSpace(appName)) return (false, "Missing app name.");

        var normalized = appName.Replace(".exe", "", StringComparison.OrdinalIgnoreCase).Trim();
        var closed = 0;
        foreach (var proc in Process.GetProcesses())
        {
            try
            {
                if (proc.ProcessName.Contains(normalized, StringComparison.OrdinalIgnoreCase) ||
                    (!string.IsNullOrWhiteSpace(proc.MainWindowTitle) &&
                     proc.MainWindowTitle.Contains(normalized, StringComparison.OrdinalIgnoreCase)))
                {
                    if (proc.CloseMainWindow())
                    {
                        closed++;
                    }
                }
            }
            catch
            {
                // Ignore protected processes
            }
        }

        return closed > 0
            ? (true, $"Closed {closed} window(s) of {appName}.")
            : (false, $"No open window matched '{appName}'.");
    }

    private static (bool Ok, string Message) ExecuteMediaControl(JsonElement cmd)
    {
        var action = cmd.TryGetProperty("action", out var actEl) ? actEl.GetString() : null;
        byte? vk = action switch
        {
            "mute" => VkVolumeMute,
            "volume_up" => VkVolumeUp,
            "volume_down" => VkVolumeDown,
            "play_pause" => VkMediaPlayPause,
            "next" => VkMediaNextTrack,
            "prev" => VkMediaPrevTrack,
            _ => null,
        };
        if (vk is null) return (false, $"Unknown media action: {action}");

        var repeat = (action == "volume_up" || action == "volume_down") ? 4 : 1;
        for (var i = 0; i < repeat; i++)
        {
            keybd_event(vk.Value, 0, 0, UIntPtr.Zero);
            keybd_event(vk.Value, 0, KeyEventFKeyUp, UIntPtr.Zero);
        }
        return (true, $"Executed media control: {action}.");
    }

    private static (bool Ok, string Message) ExecuteSystemAction(JsonElement cmd, Action? onToggleFloatingTimer)
    {
        var action = cmd.TryGetProperty("action", out var actEl) ? actEl.GetString() : null;
        if (action == "lock_pc")
        {
            LockWorkStation();
            return (true, "Locked Windows workstation.");
        }
        if (action == "toggle_floating_timer")
        {
            onToggleFloatingTimer?.Invoke();
            return (true, "Toggled floating focus timer.");
        }
        return (false, $"Unsupported system action on Windows: {action}");
    }
}
