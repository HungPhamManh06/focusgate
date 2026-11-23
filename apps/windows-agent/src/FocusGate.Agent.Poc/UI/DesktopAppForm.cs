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
        BackColor = Color.FromArgb(18, 17, 17);
        Icon = FocusGateBrand.AppIcon;

        var topBar = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 48,
            ColumnCount = 2,
            RowCount = 1,
            BackColor = Color.FromArgb(20, 18, 18),
            Padding = new Padding(12, 6, 12, 6),
        };
        topBar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        topBar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        topBar.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

        var leftPanel = new Panel
        {
            Dock = DockStyle.Fill,
            Margin = Padding.Empty,
        };

        var logoBox = new PictureBox
        {
            Image = FocusGateBrand.CreateLogoBitmap(24),
            SizeMode = PictureBoxSizeMode.Zoom,
            Width = 22,
            Height = 22,
            Dock = DockStyle.Left,
            Margin = new Padding(0, 4, 8, 4),
        };

        _statusLabel = new Label
        {
            Text = "  FocusGate PC · Initializing...",
            ForeColor = Color.FromArgb(250, 247, 245),
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            AutoSize = false,
            AutoEllipsis = true,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
        };

        leftPanel.Controls.Add(_statusLabel);
        leftPanel.Controls.Add(logoBox);

        var rightPanel = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Dock = DockStyle.Fill,
            BackColor = Color.Transparent,
            Margin = Padding.Empty,
            Padding = new Padding(8, 1, 0, 1),
        };

        _enforceBox = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            FlatStyle = FlatStyle.Flat,
            Width = 152,
            BackColor = Color.FromArgb(36, 33, 34),
            ForeColor = Color.FromArgb(250, 247, 245),
            Font = new Font("Segoe UI", 9f),
            Margin = new Padding(0, 3, 8, 3),
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

        var syncBtn = new Button
        {
            Text = "Sync Now",
            AutoSize = true,
            MinimumSize = new Size(88, 28),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(220, 38, 38),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Padding = new Padding(8, 2, 8, 2),
            Margin = new Padding(0, 1, 8, 1),
        };
        syncBtn.FlatAppearance.BorderSize = 0;
        syncBtn.Click += async (_, _) => await _onSyncNow();

        var hideBtn = new Button
        {
            Text = "Minimize to Tray",
            AutoSize = true,
            MinimumSize = new Size(122, 28),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(40, 37, 38),
            ForeColor = Color.FromArgb(240, 236, 234),
            Font = new Font("Segoe UI", 9f),
            Padding = new Padding(8, 2, 8, 2),
            Margin = new Padding(0, 1, 0, 1),
        };
        hideBtn.FlatAppearance.BorderSize = 0;
        hideBtn.Click += (_, _) => Hide();

        rightPanel.Controls.Add(_enforceBox);
        rightPanel.Controls.Add(syncBtn);
        rightPanel.Controls.Add(hideBtn);

        topBar.Controls.Add(leftPanel, 0, 0);
        topBar.Controls.Add(rightPanel, 1, 0);

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
            BeginInvoke(() => _statusLabel.Text = "  " + text);
            return;
        }
        _statusLabel.Text = "  " + text;
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
