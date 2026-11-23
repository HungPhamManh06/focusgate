using System.Text.Json;
using FocusGate.Agent.Poc.Models;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FocusGate.Agent.Poc.UI;

public sealed class DesktopAppForm : Form
{
    private readonly string _apiBaseUrl;
    private readonly Func<string, string?, Task> _onSessionToken;
    private readonly Func<Task> _onSyncNow;
    private readonly Action<EnforcementAction?> _onEnforcementChanged;
    private readonly Label _statusLabel;
    private readonly ComboBox _enforceBox;
    private readonly WebView2 _webView;
    private string? _lastBridgedToken;
    private bool _allowClose;

    public DesktopAppForm(
        string apiBaseUrl,
        EnforcementAction? initialEnforcement,
        Func<string, string?, Task> onSessionToken,
        Func<Task> onSyncNow,
        Action<EnforcementAction?> onEnforcementChanged)
    {
        _apiBaseUrl = apiBaseUrl.TrimEnd('/');
        _onSessionToken = onSessionToken;
        _onSyncNow = onSyncNow;
        _onEnforcementChanged = onEnforcementChanged;

        Text = "FocusGate";
        Width = 1280;
        Height = 820;
        MinimumSize = new Size(920, 620);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(17, 19, 24);
        Icon = SystemIcons.Shield;

        var topBar = new Panel
        {
            Dock = DockStyle.Top,
            Height = 42,
            BackColor = Color.FromArgb(20, 23, 30),
            Padding = new Padding(12, 6, 12, 6),
        };

        _statusLabel = new Label
        {
            Text = "FocusGate PC · Initializing...",
            ForeColor = Color.FromArgb(228, 232, 240),
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            AutoSize = false,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
        };

        var rightPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Right,
            Width = 430,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            BackColor = Color.Transparent,
        };

        var hideBtn = new Button
        {
            Text = "Minimize to Tray",
            AutoSize = true,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(36, 40, 52),
            ForeColor = Color.White,
            Margin = new Padding(4, 2, 0, 2),
        };
        hideBtn.FlatAppearance.BorderSize = 0;
        hideBtn.Click += (_, _) => Hide();

        var syncBtn = new Button
        {
            Text = "Sync Now",
            AutoSize = true,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(63, 102, 235),
            ForeColor = Color.White,
            Margin = new Padding(6, 2, 4, 2),
        };
        syncBtn.FlatAppearance.BorderSize = 0;
        syncBtn.Click += async (_, _) => await _onSyncNow();

        _enforceBox = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Width = 135,
            BackColor = Color.FromArgb(30, 34, 44),
            ForeColor = Color.White,
            Margin = new Padding(6, 3, 4, 2),
        };
        _enforceBox.Items.AddRange(["Block: Overlay", "Block: Terminate", "Block: Off"]);
        _enforceBox.SelectedIndex = initialEnforcement switch
        {
            EnforcementAction.Terminate => 1,
            null => 2,
            _ => 0,
        };
        _enforceBox.SelectedIndexChanged += (_, _) =>
        {
            EnforcementAction? next = _enforceBox.SelectedIndex switch
            {
                0 => EnforcementAction.Overlay,
                1 => EnforcementAction.Terminate,
                _ => null,
            };
            _onEnforcementChanged(next);
        };

        rightPanel.Controls.Add(hideBtn);
        rightPanel.Controls.Add(syncBtn);
        rightPanel.Controls.Add(_enforceBox);

        topBar.Controls.Add(_statusLabel);
        topBar.Controls.Add(rightPanel);

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(17, 19, 24),
        };

        Controls.Add(_webView);
        Controls.Add(topBar);

        Load += async (_, _) => await InitializeWebViewAsync();
        FormClosing += (_, e) =>
        {
            if (!_allowClose && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
            }
        };
    }

    public void UpdateStatusText(string text)
    {
        if (IsDisposed) return;
        if (InvokeRequired)
        {
            BeginInvoke(() => _statusLabel.Text = text);
            return;
        }
        _statusLabel.Text = text;
    }

    public void ForceClose()
    {
        _allowClose = true;
        if (!IsDisposed) Close();
    }

    private async Task InitializeWebViewAsync()
    {
        try
        {
            var userDataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FocusGate",
                "WebView2");
            Directory.CreateDirectory(userDataDir);

            var env = await CoreWebView2Environment.CreateAsync(null, userDataDir);
            await _webView.EnsureCoreWebView2Async(env);
            _webView.CoreWebView2.NavigationCompleted += async (_, _) => await TryBridgeSessionAsync();
            _webView.Source = new Uri(_apiBaseUrl);
        }
        catch (Exception ex)
        {
            UpdateStatusText($"WebView2 init error: {ex.Message}");
        }
    }

    private async Task TryBridgeSessionAsync()
    {
        try
        {
            var currentUri = _webView.Source;
            if (currentUri is null || !currentUri.Host.Equals(new Uri(_apiBaseUrl).Host, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            const string script = """
                (async () => {
                  try {
                    const res = await fetch('/api/agent/session', { credentials: 'include' });
                    if (!res.ok) return null;
                    return await res.json();
                  } catch {
                    return null;
                  }
                })()
                """;
            var raw = await _webView.ExecuteScriptAsync(script);
            if (string.IsNullOrWhiteSpace(raw) || raw == "null") return;

            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return;
            if (!root.TryGetProperty("accessToken", out var tokenEl)) return;
            var token = tokenEl.GetString();
            if (string.IsNullOrWhiteSpace(token) || token == _lastBridgedToken) return;

            _lastBridgedToken = token;
            var refresh = root.TryGetProperty("refreshToken", out var refEl) ? refEl.GetString() : null;
            await _onSessionToken(token, refresh);
        }
        catch
        {
            // Ignore transient script errors during redirects.
        }
    }
}
