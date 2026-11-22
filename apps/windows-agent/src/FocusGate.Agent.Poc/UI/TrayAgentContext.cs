using System.Diagnostics;
using FocusGate.Agent.Poc.Models;
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
    private readonly System.Windows.Forms.Timer _syncTimer;

    private AgentCredentials? _credentials;
    private AgentPolicySnapshot? _lastPolicy;

    public TrayAgentContext(
        AgentOptions options,
        DpapiCredentialStore credentialStore,
        PolicyCacheStore policyCache,
        OfflineUsageQueue usageQueue,
        StructuredLogger logger,
        AgentSyncClient syncClient)
    {
        _options = options;
        _credentialStore = credentialStore;
        _policyCache = policyCache;
        _usageQueue = usageQueue;
        _logger = logger;
        _syncClient = syncClient;

        _statusItem = new ToolStripMenuItem("Status: Initializing...") { Enabled = false };
        _policyItem = new ToolStripMenuItem("Policy: Not pulled yet") { Enabled = false };

        var syncNowItem = new ToolStripMenuItem("Sync policy now", null, async (_, _) => await SyncPolicyAsync());
        var showStatusItem = new ToolStripMenuItem("Show status", null, (_, _) => ShowStatusDialog());
        var openLogsItem = new ToolStripMenuItem("Open logs folder", null, (_, _) => OpenLogsFolder());
        var exitItem = new ToolStripMenuItem("Exit", null, (_, _) => ExitThread());

        var menu = new ContextMenuStrip();
        menu.Items.AddRange([
            _statusItem,
            _policyItem,
            new ToolStripSeparator(),
            syncNowItem,
            showStatusItem,
            openLogsItem,
            new ToolStripSeparator(),
            exitItem,
        ]);

        _trayIcon = new NotifyIcon
        {
            Icon = SystemIcons.Shield,
            Text = "FocusGate Agent",
            ContextMenuStrip = menu,
            Visible = true,
        };
        _trayIcon.DoubleClick += (_, _) => ShowStatusDialog();

        _syncTimer = new System.Windows.Forms.Timer { Interval = 60_000 };
        _syncTimer.Tick += async (_, _) => await SyncPolicyAsync();

        LoadInitialCredentials();
        _lastPolicy = _policyCache.Load();
        UpdateMenuLabels();
        _syncTimer.Start();
        _ = SyncPolicyAsync();
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

    private void UpdateMenuLabels()
    {
        if (_credentials is null)
        {
            _statusItem.Text = $"Status: Unregistered ({_options.DeviceName ?? Environment.MachineName})";
            _policyItem.Text = "Policy: Waiting for registration";
            _trayIcon.Text = "FocusGate Agent (Unregistered)";
            return;
        }

        _statusItem.Text = $"Device: {_credentials.DeviceName} ({_credentials.DeviceId[..Math.Min(8, _credentials.DeviceId.Length)]})";
        _policyItem.Text = _lastPolicy is null
            ? "Policy: Syncing..."
            : $"Policy: {(_lastPolicy.LockActive ? "Lock Active" : "Unlocked")} ({_lastPolicy.PulledAtUtc.ToLocalTime():HH:mm:ss})";
        _trayIcon.Text = $"FocusGate Agent — {_credentials.DeviceName}";
    }

    private void ShowStatusDialog()
    {
        var summary = _credentials is null
            ? $"Device: Unregistered ({_options.DeviceName ?? Environment.MachineName})\nCredentials: Not stored\nLogs: {_logger.LogDirectory}"
            : $"Device: {_credentials.DeviceName}\nID: {_credentials.DeviceId}\nAPI: {_credentials.ApiBaseUrl}\nRegistered: {_credentials.RegisteredAtUtc.ToLocalTime():g}\nLogs: {_logger.LogDirectory}";

        MessageBox.Show(summary, "FocusGate Agent Status", MessageBoxButtons.OK, MessageBoxIcon.Information);
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

    protected override void ExitThreadCore()
    {
        _syncTimer.Stop();
        _syncTimer.Dispose();
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        _logger.Info("agent.shutdown", "Tray agent exited cleanly.");
        base.ExitThreadCore();
    }
}
