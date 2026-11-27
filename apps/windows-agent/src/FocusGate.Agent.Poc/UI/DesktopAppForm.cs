using System.Runtime.InteropServices;
using System.Text.Json;
using FocusGate.Agent.Poc.Models;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FocusGate.Agent.Poc.UI;

public sealed class DesktopAppForm : Form
{
    private const byte VkLWin = 0x5B;
    private const byte VkH = 0x48;
    private const uint KeyEventFExtendedKey = 0x0001;
    private const uint KeyEventFKeyUp = 0x0002;
    private const int DwmwaUseImmersiveDarkMode = 20;
    private const int DwmwaCaptionColor = 35;

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
    private readonly string _apiBaseUrl;
    private readonly Func<string, string?, Task> _onSessionToken;
    private readonly Func<Task> _onSyncNow;
    private readonly Action<EnforcementAction?> _onEnforcementChanged;
    private readonly Label _statusLabel;
    private readonly Button _enforceBtn;
    private readonly Button _updateBtn;
    private readonly WebView2 _webView;
    private string? _lastBridgedToken;
    private bool _allowClose;
    private Func<IProgress<int>, Task>? _onUpdateRequested;

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
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            MinimumSize = new Size(0, 42),
            ColumnCount = 2,
            RowCount = 1,
            BackColor = Color.FromArgb(20, 18, 18),
            Padding = new Padding(12, 5, 12, 5),
        };
        topBar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        topBar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        topBar.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var leftPanel = new Panel
        {
            Dock = DockStyle.Fill,
            MinimumSize = new Size(0, 34),
            Margin = Padding.Empty,
        };

        var logoBox = new PictureBox
        {
            Image = FocusGateBrand.CreateLogoBitmap(28),
            SizeMode = PictureBoxSizeMode.Zoom,
            Width = 24,
            Height = 24,
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
            Anchor = AnchorStyles.Right,
            BackColor = Color.Transparent,
            Margin = new Padding(10, 0, 0, 0),
            Padding = Padding.Empty,
        };

        string FormatMode(EnforcementAction? mode) => mode switch
        {
            EnforcementAction.Terminate => "Block: Terminate ▾",
            null => "Block: Off ▾",
            _ => "Block: Overlay ▾",
        };

        _enforceBtn = new Button
        {
            Text = FormatMode(initialEnforcement),
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(36, 33, 34),
            ForeColor = Color.FromArgb(250, 247, 245),
            Font = new Font("Segoe UI", 9f),
            Padding = new Padding(10, 5, 10, 5),
            Margin = new Padding(0, 0, 8, 0),
            Cursor = Cursors.Hand,
        };
        _enforceBtn.FlatAppearance.BorderSize = 1;
        _enforceBtn.FlatAppearance.BorderColor = Color.FromArgb(62, 58, 60);

        var modeMenu = new ContextMenuStrip();
        void SelectMode(EnforcementAction? next)
        {
            _enforceBtn.Text = FormatMode(next);
            _onEnforcementChanged(next);
        }
        modeMenu.Items.Add("Block: Overlay", null, (_, _) => SelectMode(EnforcementAction.Overlay));
        modeMenu.Items.Add("Block: Terminate", null, (_, _) => SelectMode(EnforcementAction.Terminate));
        modeMenu.Items.Add("Block: Off", null, (_, _) => SelectMode(null));
        _enforceBtn.Click += (_, _) => modeMenu.Show(_enforceBtn, new Point(0, _enforceBtn.Height));

        _updateBtn = new Button
        {
            Text = "⬆ Update",
            Visible = false,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(16, 128, 86),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Padding = new Padding(12, 5, 12, 5),
            Margin = new Padding(0, 0, 8, 0),
            Cursor = Cursors.Hand,
        };
        _updateBtn.FlatAppearance.BorderSize = 0;
        _updateBtn.Click += async (_, _) =>
        {
            if (_onUpdateRequested is null) return;
            _updateBtn.Enabled = false;
            _updateBtn.Text = "Downloading...";
            var progress = new Progress<int>(pct =>
            {
                if (!IsDisposed) _updateBtn.Text = $"Updating {pct}%";
            });
            try
            {
                await _onUpdateRequested(progress);
            }
            catch
            {
                if (!IsDisposed)
                {
                    _updateBtn.Enabled = true;
                    _updateBtn.Text = "⬆ Retry Update";
                }
            }
        };

        var syncBtn = new Button
        {
            Text = "Sync Now",
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(220, 38, 38),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Padding = new Padding(12, 5, 12, 5),
            Margin = new Padding(0, 0, 8, 0),
            Cursor = Cursors.Hand,
        };
        syncBtn.FlatAppearance.BorderSize = 0;
        syncBtn.Click += async (_, _) => await _onSyncNow();

        var hideBtn = new Button
        {
            Text = "Minimize to Tray",
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(40, 37, 38),
            ForeColor = Color.FromArgb(240, 236, 234),
            Font = new Font("Segoe UI", 9f),
            Padding = new Padding(12, 5, 12, 5),
            Margin = Padding.Empty,
            Cursor = Cursors.Hand,
        };
        hideBtn.FlatAppearance.BorderSize = 0;
        hideBtn.Click += (_, _) => Hide();

        rightPanel.Controls.Add(_updateBtn);
        rightPanel.Controls.Add(_enforceBtn);
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

    public void ShowUpdateAvailable(string tagName, Func<IProgress<int>, Task> onUpdateRequested)
    {
        if (IsDisposed) return;
        void Apply()
        {
            _onUpdateRequested = onUpdateRequested;
            _updateBtn.Text = $"⬆ Update {tagName.Replace("windows-", "", StringComparison.OrdinalIgnoreCase)}";
            _updateBtn.Visible = true;
            _updateBtn.Enabled = true;
        }
        if (InvokeRequired) BeginInvoke(Apply);
        else Apply();
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

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        try
        {
            var dark = 1;
            _ = DwmSetWindowAttribute(Handle, DwmwaUseImmersiveDarkMode, ref dark, sizeof(int));
            // COLORREF is 0x00BBGGRR for #141212
            var captionBgr = 0x00121214;
            _ = DwmSetWindowAttribute(Handle, DwmwaCaptionColor, ref captionBgr, sizeof(int));
        }
        catch
        {
            // Older Windows 10 builds may ignore DWMWA_CAPTION_COLOR.
        }
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
            _webView.CoreWebView2.PermissionRequested += (_, args) =>
            {
                if (args.PermissionKind == CoreWebView2PermissionKind.Microphone &&
                    Uri.TryCreate(args.Uri, UriKind.Absolute, out var reqUri) &&
                    reqUri.Host.Equals(new Uri(_apiBaseUrl).Host, StringComparison.OrdinalIgnoreCase))
                {
                    args.State = CoreWebView2PermissionState.Allow;
                }
            };
            _webView.CoreWebView2.WebMessageReceived += (_, args) =>
            {
                try
                {
                    var raw = args.TryGetWebMessageAsString();
                    if (string.Equals(raw, "focusgate_start_voice_typing", StringComparison.Ordinal))
                    {
                        BeginInvoke(async () =>
                        {
                            Activate();
                            _webView.Focus();
                            try
                            {
                                await _webView.ExecuteScriptAsync("window.dispatchEvent(new CustomEvent('focusgate:voice-ack'));");
                            }
                            catch { }
                            await Task.Delay(60);
                            keybd_event(VkLWin, 0x5B, KeyEventFExtendedKey, UIntPtr.Zero);
                            await Task.Delay(35);
                            keybd_event(VkH, 0x23, 0, UIntPtr.Zero);
                            await Task.Delay(35);
                            keybd_event(VkH, 0x23, KeyEventFKeyUp, UIntPtr.Zero);
                            await Task.Delay(25);
                            keybd_event(VkLWin, 0x5B, KeyEventFExtendedKey | KeyEventFKeyUp, UIntPtr.Zero);
                        });
                    }
                    else if (!string.IsNullOrWhiteSpace(raw) && raw.TrimStart().StartsWith("{"))
                    {
                        using var doc = JsonDocument.Parse(raw);
                        var root = doc.RootElement;
                        if (root.TryGetProperty("type", out var tEl) &&
                            string.Equals(tEl.GetString(), "focusgate_device_command", StringComparison.Ordinal) &&
                            root.TryGetProperty("command", out var cmdEl))
                        {
                            var cmdClone = cmdEl.Clone();
                            BeginInvoke(async () =>
                            {
                                var (ok, msg) = Services.PcCommandExecutor.Execute(cmdClone);
                                try
                                {
                                    var detailJson = JsonSerializer.Serialize(new { ok, message = msg });
                                    await _webView.ExecuteScriptAsync(
                                        $"window.dispatchEvent(new CustomEvent('focusgate:device-result', {{ detail: {detailJson} }}));");
                                }
                                catch { }
                            });
                        }
                    }
                }
                catch
                {
                    // Ignore malformed web messages.
                }
            };
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
