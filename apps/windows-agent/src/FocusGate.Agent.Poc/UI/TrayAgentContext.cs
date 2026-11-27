using System.Diagnostics;
using FocusGate.Agent.Poc.Models;
using FocusGate.Agent.Poc.Monitors;
using FocusGate.Agent.Poc.Native;
using FocusGate.Agent.Poc.Services;

namespace FocusGate.Agent.Poc.UI;

/// <summary>
/// Phase 1.4 Windows Tray Shell: hosts the system tray icon, surfaces registration
/// and policy pull status, and triggers periodic background policy pulls without enforcing yet.
/// </summary>
public sealed class TrayAgentContext : ApplicationContext
{
    private readonly AgentOptions _options;
    private readonly DpapiCredentialStore _credentialStore;
    private readonly PolicyCacheStore _policyCache;
    private readonly OfflineUsageQueue _usageQueue;
    private readonly StructuredLogger _logger;
    private readonly AgentSyncClient _syncClient;
    private readonly NotifyIcon _trayIcon;
    private readonly ToolStripMenuItem _statusItem;
    private readonly ToolStripMenuItem _policyItem;
    private readonly ToolStripMenuItem _openAppItem;
    private readonly ToolStripMenuItem _syncNowItem;
    private readonly ToolStripMenuItem _unlockPassItem;
    private readonly ToolStripMenuItem _startupItem;
    private readonly ToolStripMenuItem _showStatusItem;
    private readonly ToolStripMenuItem _openLogsItem;
    private readonly ToolStripMenuItem _exitItem;
    private readonly System.Windows.Forms.Timer _syncTimer;
    private readonly System.Windows.Forms.Timer _enforceTimer;
    private readonly EnforcementEngine _enforcementEngine;
    private BlockOverlayForm? _overlayForm;
    private FloatingTimerForm? _floatingTimer;
    private AiAssistantForm? _aiForm;

    private AgentCredentials? _credentials;
    private AgentPolicySnapshot? _lastPolicy;
    private DesktopAppForm? _desktopForm;
    private EnforcementAction? _enforcementMode = EnforcementAction.Overlay;
    private string? _lastBlockedKey;

    public TrayAgentContext(
        AgentOptions options,
        DpapiCredentialStore credentialStore,
        PolicyCacheStore policyCache,
        OfflineUsageQueue usageQueue,
        StructuredLogger logger,
        AgentSyncClient syncClient,
        bool showDesktopWindow = false)
    {
        _options = options;
        _credentialStore = credentialStore;
        _policyCache = policyCache;
        _usageQueue = usageQueue;
        _logger = logger;
        _syncClient = syncClient;
        _enforcementEngine = new EnforcementEngine(new BlockPolicy());

        _statusItem = new ToolStripMenuItem("Status: Initializing...") { Enabled = false };
        _policyItem = new ToolStripMenuItem("Policy: Not pulled yet") { Enabled = false };

        _openAppItem = new ToolStripMenuItem("Open FocusGate App", null, (_, _) => ShowDesktopWindow());
        var askAiItem = new ToolStripMenuItem("Ask FocusGate AI (Text & Voice)...", null, (_, _) => ShowAiAssistantWindow());
        var openFocusStudioItem = new ToolStripMenuItem("Open Focus Studio (Web)", null, (_, _) =>
        {
            var baseUrl = string.IsNullOrWhiteSpace(_options.ApiBaseUrl) ? "https://focusgate-blue.vercel.app" : _options.ApiBaseUrl.TrimEnd('/');
            try { Process.Start(new ProcessStartInfo($"{baseUrl}/focus") { UseShellExecute = true }); } catch { }
        });
        var quickFocus25Item = new ToolStripMenuItem("Start 25m Quick Focus (Floating)", null, (_, _) =>
        {
            _floatingTimer ??= new FloatingTimerForm();
            _floatingTimer.UpdateSession("Quick Focus (25m)", false);
        });
        var toggleFloatingItem = new ToolStripMenuItem("Toggle Floating Timer", null, (_, _) =>
        {
            if (_floatingTimer is { Visible: true }) _floatingTimer.HideSession();
            else
            {
                _floatingTimer ??= new FloatingTimerForm();
                _floatingTimer.UpdateSession("Focus Sprint", false);
            }
        });
        _syncNowItem = new ToolStripMenuItem("Sync policy now", null, async (_, _) => await SyncPolicyAsync());
        _unlockPassItem = new ToolStripMenuItem("Use 10m Earned Time Pass", null, async (_, _) => await UseUnlockPassAsync());
        _startupItem = new ToolStripMenuItem("Auto-start with Windows")
        {
            Checked = StartupRegistrar.IsInstalled(),
            CheckOnClick = true,
        };
        _startupItem.Click += (_, _) =>
        {
            if (_startupItem.Checked) StartupRegistrar.Install();
            else StartupRegistrar.Uninstall();
        };
        _showStatusItem = new ToolStripMenuItem("Show status", null, (_, _) => ShowStatusDialog());
        var checkUpdatesItem = new ToolStripMenuItem("Check for updates", null, async (_, _) => await CheckForUpdatesAsync());
        _openLogsItem = new ToolStripMenuItem("Open logs folder", null, (_, _) => OpenLogsFolder());
        _exitItem = new ToolStripMenuItem("Exit", null, (_, _) => ConfirmExit());

        var menu = new ContextMenuStrip();
        menu.Items.AddRange([
            _statusItem,
            _policyItem,
            new ToolStripSeparator(),
            askAiItem,
            _openAppItem,
            quickFocus25Item,
            toggleFloatingItem,
            openFocusStudioItem,
            _syncNowItem,
            _unlockPassItem,
            _startupItem,
            _showStatusItem,
            checkUpdatesItem,
            _openLogsItem,
            new ToolStripSeparator(),
            _exitItem,
        ]);

        _trayIcon = new NotifyIcon
        {
            Icon = FocusGateBrand.AppIcon,
            Text = "FocusGate Agent",
            ContextMenuStrip = menu,
            Visible = true,
        };
        _trayIcon.DoubleClick += (_, _) => ShowDesktopWindow();

        _syncTimer = new System.Windows.Forms.Timer { Interval = 15_000 };
        _syncTimer.Tick += async (_, _) => await SyncPolicyAsync();

        _enforceTimer = new System.Windows.Forms.Timer { Interval = 600 };
        _enforceTimer.Tick += (_, _) => EnforceForegroundWindow();

        LoadInitialCredentials();
        _lastPolicy = _policyCache.Load();
        if (_lastPolicy is not null)
        {
            _enforcementEngine.UpdatePolicy(PolicyCacheStore.ToBlockPolicy(_lastPolicy));
        }
        UpdateMenuLabels();
        _syncTimer.Start();
        _enforceTimer.Start();
        _ = SyncPolicyAsync();
        _ = CheckForUpdatesSilentlyAsync();
        if (showDesktopWindow)
        {
            ShowDesktopWindow();
        }
    }

    private void LoadInitialCredentials()
    {
        try
        {
            _credentials = _credentialStore.Load();
            if (_credentials is not null)
            {
                _logger.Info("agent.credentials_loaded", "Loaded DPAPI credentials on startup.", new Dictionary<string, object?>
                {
                    ["deviceId"] = _credentials.DeviceId,
                    ["deviceName"] = _credentials.DeviceName,
                    ["apiBaseUrl"] = _credentials.ApiBaseUrl,
                });
            }
            else
            {
                _logger.Warn("agent.unregistered", "No DPAPI credentials found; running in unregistered skeleton mode.");
            }
        }
        catch (Exception ex)
        {
            _logger.Error("agent.credentials_error", "Failed to decrypt DPAPI credentials.", new Dictionary<string, object?>
            {
                ["error"] = ex.Message,
            });
        }

        UpdateMenuLabels();
    }

    private async Task SyncPolicyAsync()
    {
        if (_credentials is null)
        {
            UpdateMenuLabels();
            return;
        }

        try
        {
            var policy = await _syncClient.PullPolicyAsync(
                _credentials.ApiBaseUrl,
                _credentials.AccessToken,
                _credentials.DeviceId);
            _lastPolicy = policy;
            _policyCache.Save(policy);
            _enforcementEngine.UpdatePolicy(PolicyCacheStore.ToBlockPolicy(policy));
            _logger.Info("agent.policy_pulled", "Pulled policy snapshot from server.", new Dictionary<string, object?>
            {
                ["deviceId"] = _credentials.DeviceId,
                ["lockActive"] = policy.LockActive,
                ["blockedCount"] = policy.BlockedProcesses.Count,
            });

            if (_usageQueue.Count > 0)
            {
                var uploaded = await _usageQueue.FlushAsync(
                    _syncClient,
                    _credentials.ApiBaseUrl,
                    _credentials.AccessToken,
                    _credentials.DeviceId);
                _logger.Info("agent.usage_flushed", "Flushed queued usage events.", new Dictionary<string, object?>
                {
                    ["accepted"] = uploaded.Accepted,
                    ["duplicates"] = uploaded.Duplicates,
                });
            }

            var apps = ProcessMonitor.EnumerateInteractive()
                .GroupBy(p => p.ProcessName, StringComparer.OrdinalIgnoreCase)
                .Select(g => new DiscoveredAppUpload(
                    $"{g.Key}.exe",
                    g.Key))
                .Take(40)
                .ToList();
            if (apps.Count > 0)
            {
                await _syncClient.PushDiscoveredAppsAsync(
                    _credentials.ApiBaseUrl,
                    _credentials.AccessToken,
                    _credentials.DeviceId,
                    apps);
            }

            // Poll & execute remote AI device commands queued from Web or Android
            var remoteCommands = await _syncClient.PollDeviceCommandsAsync(
                _credentials.ApiBaseUrl,
                _credentials.AccessToken,
                "windows");
            foreach (var remoteCmd in remoteCommands)
            {
                var (ok, resultMsg) = PcCommandExecutor.Execute(
                    remoteCmd.Payload,
                    onToggleFloatingTimer: () =>
                    {
                        if (_floatingTimer is { Visible: true }) _floatingTimer.HideSession();
                        else
                        {
                            _floatingTimer ??= new FloatingTimerForm();
                            _floatingTimer.UpdateSession("Focus Sprint", IsVi);
                        }
                    });
                await _syncClient.AckDeviceCommandAsync(
                    _credentials.ApiBaseUrl,
                    _credentials.AccessToken,
                    remoteCmd.Id,
                    ok,
                    resultMsg);
            }
        }
        catch (Exception ex)
        {
            _logger.Warn("agent.policy_pull_failed", "Policy pull failed; retaining cached policy.", new Dictionary<string, object?>
            {
                ["error"] = ex.Message,
                ["queuedEvents"] = _usageQueue.Count,
            });
        }

        UpdateMenuLabels();
    }

    private bool IsVi => string.Equals(_lastPolicy?.Language, "vi", StringComparison.OrdinalIgnoreCase);

    private string Tr(string en, string vi) => IsVi ? vi : en;

    private void UpdateMenuLabels()
    {
        _openAppItem.Text = Tr("Open FocusGate App", "Mở ứng dụng FocusGate");
        _syncNowItem.Text = Tr("Sync policy now", "Đồng bộ ngay");
        _unlockPassItem.Text = Tr("Use 10m Earned Time Pass", "Dùng thẻ 10 phút tích lũy");
        _startupItem.Text = Tr("Auto-start with Windows", "Tự khởi động cùng Windows");
        _showStatusItem.Text = Tr("Show status", "Xem trạng thái");
        _openLogsItem.Text = Tr("Open logs folder", "Mở thư mục log");
        _exitItem.Text = Tr("Exit", "Thoát");

        if (_credentials is null)
        {
            _statusItem.Text = Tr(
                $"Status: Unregistered ({_options.DeviceName ?? Environment.MachineName})",
                $"Trạng thái: Chưa đăng ký ({_options.DeviceName ?? Environment.MachineName})");
            _policyItem.Text = Tr("Policy: Waiting for registration", "Chính sách: Chờ đăng ký");
            _trayIcon.Text = Tr("FocusGate Agent (Unregistered)", "FocusGate Agent (Chưa đăng ký)");
            return;
        }

        _statusItem.Text = Tr(
            $"Device: {_credentials.DeviceName} ({_credentials.DeviceId[..Math.Min(8, _credentials.DeviceId.Length)]})",
            $"Thiết bị: {_credentials.DeviceName} ({_credentials.DeviceId[..Math.Min(8, _credentials.DeviceId.Length)]})");
        _policyItem.Text = _lastPolicy is null
            ? Tr("Policy: Syncing...", "Chính sách: Đang đồng bộ...")
            : Tr(
                $"Policy: {(_lastPolicy.LockActive ? "Lock Active" : "Unlocked")} ({_lastPolicy.PulledAtUtc.ToLocalTime():HH:mm:ss})",
                $"Chính sách: {(_lastPolicy.LockActive ? "Đang khóa" : "Đã mở khóa")} ({_lastPolicy.PulledAtUtc.ToLocalTime():HH:mm:ss})");
        _trayIcon.Text = $"FocusGate Agent — {_credentials.DeviceName}";
        _desktopForm?.UpdateStatusText(
            $"FocusGate PC · {_credentials.DeviceName} · {(_lastPolicy is null ? Tr("Syncing...", "Đang đồng bộ...") : _lastPolicy.LockActive ? Tr($"Lock Active ({_lastPolicy.BlockedProcesses.Count} rules)", $"Đang khóa ({_lastPolicy.BlockedProcesses.Count} quy tắc)") : Tr("Unlocked", "Đã mở khóa"))}");
    }

    private void ShowDesktopWindow()
    {
        if (_desktopForm is null || _desktopForm.IsDisposed)
        {
            _desktopForm = new DesktopAppForm(
                _credentials?.ApiBaseUrl ?? _options.ApiBaseUrl,
                _enforcementMode,
                OnWebViewSessionTokenAsync,
                SyncPolicyAsync,
                next =>
                {
                    _enforcementMode = next;
                    if (next is null) HideOverlay();
                });
        }
        _desktopForm.Show();
        if (_desktopForm.WindowState == FormWindowState.Minimized)
        {
            _desktopForm.WindowState = FormWindowState.Normal;
        }
        _desktopForm.Activate();
        UpdateMenuLabels();
    }

    private async Task OnWebViewSessionTokenAsync(string accessToken, string? refreshToken)
    {
        try
        {
            if (_credentials is not null && _credentials.AccessToken == accessToken) return;
            var apiUrl = _credentials?.ApiBaseUrl ?? _options.ApiBaseUrl;
            var deviceName = _credentials?.DeviceName ?? _options.DeviceName ?? Environment.MachineName;
            var reg = await _syncClient.RegisterDeviceAsync(apiUrl, accessToken, deviceName, "0.1.0");
            _credentials = new AgentCredentials(
                ApiBaseUrl: apiUrl,
                DeviceId: reg.DeviceId,
                DeviceName: reg.Name,
                AccessToken: accessToken,
                RefreshToken: refreshToken,
                RegisteredAtUtc: DateTimeOffset.UtcNow);
            _credentialStore.Save(_credentials);
            await SyncPolicyAsync();
        }
        catch (Exception ex)
        {
            _logger.Warn("agent.webview_bridge_failed", "Could not bridge WebView session.", new Dictionary<string, object?>
            {
                ["error"] = ex.Message,
            });
        }
    }

    private void HideOverlay()
    {
        if (_overlayForm is not null && !_overlayForm.IsDisposed)
        {
            _overlayForm.Close();
            _overlayForm.Dispose();
        }
        _overlayForm = null;
    }

    private void EnforceForegroundWindow()
    {
        if (_enforcementMode is null || _lastPolicy is null || !_lastPolicy.LockActive)
        {
            HideOverlay();
            _lastBlockedKey = null;
            return;
        }

        var hwnd = NativeMethods.GetForegroundWindow();
        var app = WindowInspector.Describe(hwnd);
        if (app is null) return;

        var decision = _enforcementEngine.Evaluate(app);
        if (!decision.ShouldBlock)
        {
            HideOverlay();
            _lastBlockedKey = null;
            return;
        }

        var key = $"{app.ProcessId}:{app.ProcessName}";
        if (_lastBlockedKey != key)
        {
            _lastBlockedKey = key;
            _usageQueue.Enqueue(new UsageEventUpload(
                ClientEventId: Guid.NewGuid().ToString("N"),
                Identifier: $"{app.ProcessName}.exe",
                DisplayName: app.ProcessName,
                StartedAt: DateTimeOffset.UtcNow,
                EndedAt: DateTimeOffset.UtcNow,
                DurationSeconds: 1,
                WasBlocked: true));
        }

        if (_enforcementMode == EnforcementAction.Terminate)
        {
            try
            {
                using var proc = Process.GetProcessById(app.ProcessId);
                proc.Kill(entireProcessTree: true);
            }
            catch
            {
                // Ignore if process already exited or elevated.
            }
            return;
        }

        if (_enforcementMode == EnforcementAction.Overlay)
        {
            if (_overlayForm is null || _overlayForm.IsDisposed || !_overlayForm.Visible)
            {
                HideOverlay();
                _overlayForm = new BlockOverlayForm(app, decision.Category ?? "blocked", IsVi);
                _overlayForm.Show();
            }
        }
    }

    private void ShowStatusDialog()
    {
        var summary = _credentials is null
            ? Tr(
                $"Device: Unregistered ({_options.DeviceName ?? Environment.MachineName})\nCredentials: Not stored\nLogs: {_logger.LogDirectory}",
                $"Thiết bị: Chưa đăng ký ({_options.DeviceName ?? Environment.MachineName})\nThông tin đăng nhập: Chưa lưu\nThư mục log: {_logger.LogDirectory}")
            : Tr(
                $"Device: {_credentials.DeviceName}\nID: {_credentials.DeviceId}\nAPI: {_credentials.ApiBaseUrl}\nRegistered: {_credentials.RegisteredAtUtc.ToLocalTime():g}\nLogs: {_logger.LogDirectory}",
                $"Thiết bị: {_credentials.DeviceName}\nID: {_credentials.DeviceId}\nAPI: {_credentials.ApiBaseUrl}\nĐăng ký lúc: {_credentials.RegisteredAtUtc.ToLocalTime():g}\nThư mục log: {_logger.LogDirectory}");

        MessageBox.Show(summary, Tr("FocusGate Agent Status", "Trạng thái FocusGate Agent"), MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void OpenLogsFolder()
    {
        Directory.CreateDirectory(_logger.LogDirectory);
        Process.Start(new ProcessStartInfo
        {
            FileName = _logger.LogDirectory,
            UseShellExecute = true,
        });
    }

    private async Task UseUnlockPassAsync()
    {
        if (_credentials is null)
        {
            MessageBox.Show(
                Tr("Register this device first.", "Vui lòng đăng ký thiết bị này trước."),
                "FocusGate",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }
        try
        {
            var remaining = await _syncClient.ActivateUnlockPassAsync(
                _credentials.ApiBaseUrl,
                _credentials.AccessToken,
                10);
            await SyncPolicyAsync();
            MessageBox.Show(
                Tr(
                    $"10m Unlock Pass activated! Remaining Earned Time: {remaining}m.",
                    $"Đã kích hoạt thẻ mở khóa 10 phút! Thời gian tích lũy còn lại: {remaining} phút."),
                "FocusGate",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                Tr($"Could not activate Unlock Pass: {ex.Message}", $"Không thể kích hoạt thẻ mở khóa: {ex.Message}"),
                "FocusGate",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private async Task CheckForUpdatesSilentlyAsync()
    {
        var update = await WindowsAppUpdater.CheckLatestReleaseAsync();
        if (update is null || !update.IsNewerThanCurrent) return;
        _desktopForm?.ShowUpdateAvailable(update.TagName, async progress =>
        {
            await WindowsAppUpdater.DownloadAndInstallInPlaceAsync(
                update,
                progress,
                exitCurrentApp: () => ExitThread());
        });
    }

    private async Task CheckForUpdatesAsync()
    {
        var update = await WindowsAppUpdater.CheckLatestReleaseAsync();
        if (update is null)
        {
            MessageBox.Show(
                Tr("Could not check GitHub Releases right now.", "Không thể kiểm tra bản cập nhật lúc này."),
                "FocusGate",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }
        var answer = MessageBox.Show(
            Tr(
                $"Latest FocusGate Windows release: {update.TagName}. Download and auto-update in place now?",
                $"Phiên bản FocusGate Windows mới nhất: {update.TagName}. Tự động tải và cập nhật đè ngay bây giờ?"),
            "FocusGate Updater",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Information);
        if (answer == DialogResult.Yes)
        {
            try
            {
                await WindowsAppUpdater.DownloadAndInstallInPlaceAsync(
                    update,
                    progress: new Progress<int>(pct => _desktopForm?.UpdateStatusText($"Updating FocusGate... {pct}%")),
                    exitCurrentApp: () => ExitThread());
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    Tr($"Auto-update failed: {ex.Message}", $"Cập nhật thất bại: {ex.Message}"),
                    "FocusGate Updater",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        }
    }

    private void ShowAiAssistantWindow()
    {
        if (_aiForm is null || _aiForm.IsDisposed)
        {
            _aiForm = new AiAssistantForm(
                onSend: async message =>
                {
                    if (_credentials is null || string.IsNullOrWhiteSpace(_credentials.AccessToken))
                    {
                        throw new InvalidOperationException(
                            Tr(
                                "Sign in inside Open FocusGate App first so AI can sync with your account.",
                                "Hãy mở FocusGate App và đăng nhập trước để AI đồng bộ với tài khoản của bạn."));
                    }
                    var apiBase = string.IsNullOrWhiteSpace(_credentials.ApiBaseUrl)
                        ? _options.ApiBaseUrl
                        : _credentials.ApiBaseUrl;
                    return await _syncClient.AskAiAsync(apiBase, _credentials.AccessToken, message);
                },
                onMutated: async () => await SyncPolicyAsync());
        }
        _aiForm.Show();
        if (_aiForm.WindowState == FormWindowState.Minimized)
        {
            _aiForm.WindowState = FormWindowState.Normal;
        }
        _aiForm.Activate();
    }

    private void SyncFloatingTimer()
    {
        var active = _lastPolicy?.ActiveFocusSession;
        if (active is not null && string.Equals(active.Status, "running", StringComparison.OrdinalIgnoreCase))
        {
            if (_floatingTimer is null || _floatingTimer.IsDisposed)
            {
                _floatingTimer = new FloatingTimerForm();
                _floatingTimer.CompleteRequested += (_, _) => ShowDesktopWindow();
                _floatingTimer.AskAiRequested += (_, _) => ShowAiAssistantWindow();
            }
            _floatingTimer.UpdateSession(active.TaskTitle, string.Equals(_lastPolicy?.Language, "vi", StringComparison.OrdinalIgnoreCase));
        }
        else
        {
            _floatingTimer?.HideSession();
        }
    }

    private void ConfirmExit()
    {
        if (_lastPolicy?.LockActive == true)
        {
            var answer = MessageBox.Show(
                Tr(
                    "FocusGate Lock is currently active. Are you sure you want to exit the agent?",
                    "Khóa FocusGate đang bật. Bạn có chắc muốn thoát ứng dụng không?"),
                "FocusGate",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);
            if (answer != DialogResult.Yes) return;
        }
        ExitThread();
    }

    protected override void ExitThreadCore()
    {
        _enforceTimer.Stop();
        _enforceTimer.Dispose();
        _syncTimer.Stop();
        _syncTimer.Dispose();
        _desktopForm?.ForceClose();
        _aiForm?.Dispose();
        _floatingTimer?.Close();
        _floatingTimer?.Dispose();
        HideOverlay();
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        _logger.Info("agent.shutdown", "Tray agent exited cleanly.");
        base.ExitThreadCore();
    }
}
