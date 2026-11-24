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
        _openLogsItem = new ToolStripMenuItem("Open logs folder", null, (_, _) => OpenLogsFolder());
        _exitItem = new ToolStripMenuItem("Exit", null, (_, _) => ConfirmExit());

        var menu = new ContextMenuStrip();
        menu.Items.AddRange([
            _statusItem,
            _policyItem,
            new ToolStripSeparator(),
            _openAppItem,
            _syncNowItem,
            _unlockPassItem,
            _startupItem,
            _showStatusItem,
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
        HideOverlay();
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        _logger.Info("agent.shutdown", "Tray agent exited cleanly.");
        base.ExitThreadCore();
    }
}
