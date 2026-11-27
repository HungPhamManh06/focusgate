using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using FocusGate.Agent.Poc.Services;

namespace FocusGate.Agent.Poc.UI;

/// <summary>
/// FocusGate AI Desktop Assistant (Keystone Spark) — Text & Windows Voice Typing (Win+H)
/// with automatic post-speech send and live cross-platform sync.
/// </summary>
public sealed class AiAssistantForm : Form
{
    private const byte VkLWin = 0x5B;
    private const byte VkH = 0x48;
    private const uint KeyEventFExtendedKey = 0x0001;
    private const uint KeyEventFKeyUp = 0x0002;

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    private readonly Func<string, Task<AiChatReply>> _onSend;
    private readonly Func<Task> _onMutated;
    private readonly RichTextBox _historyBox;
    private readonly TextBox _inputBox;
    private readonly Button _micBtn;
    private readonly Button _sendBtn;
    private readonly CheckBox _autoSendVoiceCheck;
    private readonly Label _statusLabel;
    private readonly System.Windows.Forms.Timer _voiceDebounceTimer;
    private bool _busy;
    private bool _voiceListening;

    public AiAssistantForm(
        Func<string, Task<AiChatReply>> onSend,
        Func<Task> onMutated)
    {
        _onSend = onSend;
        _onMutated = onMutated;

        Text = "FocusGate AI";
        Width = 440;
        Height = 560;
        MinimumSize = new Size(380, 440);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(18, 16, 16);
        ForeColor = Color.FromArgb(250, 247, 245);
        Icon = FocusGateBrand.AppIcon;
        TopMost = true;

        _voiceDebounceTimer = new System.Windows.Forms.Timer { Interval = 1800 };

        // Header with Keystone Spark GDI+ logo
        var header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 58,
            BackColor = Color.FromArgb(26, 20, 20),
            Padding = new Padding(14, 10, 14, 10),
        };

        var logoBox = new PictureBox
        {
            Image = CreateKeystoneSparkBitmap(34),
            SizeMode = PictureBoxSizeMode.Zoom,
            Width = 34,
            Height = 34,
            Location = new Point(14, 12),
        };

        var titleLbl = new Label
        {
            Text = "FocusGate AI",
            Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
            ForeColor = Color.FromArgb(250, 247, 245),
            AutoSize = true,
            Location = new Point(56, 10),
        };

        _statusLabel = new Label
        {
            Text = "Web · PC · Android · Text & Voice",
            Font = new Font("Segoe UI", 8.25f),
            ForeColor = Color.FromArgb(180, 168, 166),
            AutoSize = true,
            Location = new Point(56, 30),
        };

        header.Controls.Add(logoBox);
        header.Controls.Add(titleLbl);
        header.Controls.Add(_statusLabel);

        // Quick action chips bar
        var chipsBar = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 40,
            BackColor = Color.FromArgb(22, 18, 18),
            Padding = new Padding(10, 6, 10, 6),
            WrapContents = false,
        };
        chipsBar.Controls.Add(CreateQuickChip("Hôm nay còn gì?", "Hôm nay còn gì?"));
        chipsBar.Controls.Add(CreateQuickChip("Tập trung 25p", "Bắt đầu tập trung 25 phút"));
        chipsBar.Controls.Add(CreateQuickChip("Việc tiếp theo", "Làm gì tiếp theo?"));

        // Voice option strip
        var voiceStrip = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 28,
            BackColor = Color.FromArgb(20, 17, 17),
            Padding = new Padding(12, 4, 12, 2),
        };
        _autoSendVoiceCheck = new CheckBox
        {
            Text = "Tự gửi lệnh sau khi ngừng nói (1.8s)",
            Checked = true,
            AutoSize = true,
            ForeColor = Color.FromArgb(196, 184, 182),
            Font = new Font("Segoe UI", 8.25f),
            Location = new Point(12, 4),
        };
        voiceStrip.Controls.Add(_autoSendVoiceCheck);

        // Bottom input bar
        var inputBar = new TableLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 52,
            ColumnCount = 3,
            RowCount = 1,
            BackColor = Color.FromArgb(24, 20, 20),
            Padding = new Padding(10, 8, 10, 8),
        };
        inputBar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        inputBar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        inputBar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        _micBtn = new Button
        {
            Text = "🎙️ Nói",
            AutoSize = true,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(44, 30, 30),
            ForeColor = Color.FromArgb(250, 247, 245),
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Padding = new Padding(8, 4, 8, 4),
            Margin = new Padding(0, 0, 8, 0),
            Cursor = Cursors.Hand,
        };
        _micBtn.FlatAppearance.BorderColor = Color.FromArgb(140, 42, 42);
        _micBtn.Click += (_, _) => StartWindowsVoiceTyping();

        _inputBox = new TextBox
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(32, 28, 28),
            ForeColor = Color.FromArgb(250, 247, 245),
            BorderStyle = BorderStyle.FixedSingle,
            Font = new Font("Segoe UI", 9.5f),
            PlaceholderText = "Nhập hoặc bấm 🎙️ Nói (Win+H)...",
            Margin = new Padding(0, 4, 8, 0),
        };
        _inputBox.KeyDown += async (_, e) =>
        {
            if (e.KeyCode == Keys.Enter && !e.Shift)
            {
                e.SuppressKeyPress = true;
                await SendCurrentInputAsync(viaVoice: false);
            }
        };
        _inputBox.TextChanged += (_, _) =>
        {
            if (_voiceListening && _autoSendVoiceCheck.Checked && !string.IsNullOrWhiteSpace(_inputBox.Text))
            {
                _voiceDebounceTimer.Stop();
                _voiceDebounceTimer.Start();
            }
        };

        _sendBtn = new Button
        {
            Text = "Gửi",
            AutoSize = true,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(220, 38, 38),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            Padding = new Padding(12, 4, 12, 4),
            Cursor = Cursors.Hand,
        };
        _sendBtn.FlatAppearance.BorderSize = 0;
        _sendBtn.Click += async (_, _) => await SendCurrentInputAsync(viaVoice: false);

        inputBar.Controls.Add(_micBtn, 0, 0);
        inputBar.Controls.Add(_inputBox, 1, 0);
        inputBar.Controls.Add(_sendBtn, 2, 0);

        // Chat transcript box
        _historyBox = new RichTextBox
        {
            Dock = DockStyle.Fill,
            ReadOnly = true,
            BorderStyle = BorderStyle.None,
            BackColor = Color.FromArgb(18, 16, 16),
            ForeColor = Color.FromArgb(242, 238, 236),
            Font = new Font("Segoe UI", 9.5f),
            Padding = new Padding(12),
        };

        Controls.Add(_historyBox);
        Controls.Add(chipsBar);
        Controls.Add(voiceStrip);
        Controls.Add(inputBar);
        Controls.Add(header);

        _voiceDebounceTimer.Tick += async (_, _) =>
        {
            _voiceDebounceTimer.Stop();
            if (_voiceListening && !_busy && !string.IsNullOrWhiteSpace(_inputBox.Text))
            {
                _voiceListening = false;
                UpdateMicButtonState();
                await SendCurrentInputAsync(viaVoice: true);
            }
        };

        AppendBubble("FocusGate AI", "Xin chào! Bạn có thể gõ hoặc bấm 🎙️ Nói để ra lệnh trực tiếp cho Web, PC và Android.", Color.FromArgb(248, 113, 113));

        FormClosing += (_, e) =>
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                _voiceDebounceTimer.Stop();
                _voiceListening = false;
                UpdateMicButtonState();
                Hide();
            }
        };
    }

    private Button CreateQuickChip(string label, string prompt)
    {
        var btn = new Button
        {
            Text = label,
            AutoSize = true,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(34, 29, 30),
            ForeColor = Color.FromArgb(232, 226, 224),
            Font = new Font("Segoe UI", 8.25f),
            Padding = new Padding(8, 2, 8, 2),
            Margin = new Padding(0, 0, 6, 0),
            Cursor = Cursors.Hand,
        };
        btn.FlatAppearance.BorderColor = Color.FromArgb(62, 54, 56);
        btn.Click += async (_, _) => await SendMessageAsync(prompt, viaVoice: false);
        return btn;
    }

    private async void StartWindowsVoiceTyping()
    {
        if (_busy) return;
        _voiceListening = true;
        UpdateMicButtonState();
        _statusLabel.Text = "Đang bật Windows Voice Typing (Win+H)... Hãy nói lệnh!";
        _inputBox.Focus();

        // Trigger native Windows 10/11 Voice Typing (Win + H) with extended key flags & spacing
        await Task.Delay(50);
        keybd_event(VkLWin, 0x5B, KeyEventFExtendedKey, UIntPtr.Zero);
        await Task.Delay(35);
        keybd_event(VkH, 0x23, 0, UIntPtr.Zero);
        await Task.Delay(35);
        keybd_event(VkH, 0x23, KeyEventFKeyUp, UIntPtr.Zero);
        await Task.Delay(25);
        keybd_event(VkLWin, 0x5B, KeyEventFExtendedKey | KeyEventFKeyUp, UIntPtr.Zero);
    }

    private void UpdateMicButtonState()
    {
        _micBtn.BackColor = _voiceListening
            ? Color.FromArgb(220, 38, 38)
            : Color.FromArgb(44, 30, 30);
        _micBtn.Text = _voiceListening ? "🎙️ Đang nghe..." : "🎙️ Nói";
    }

    private async Task SendCurrentInputAsync(bool viaVoice)
    {
        var text = _inputBox.Text.Trim();
        if (string.IsNullOrEmpty(text)) return;
        _inputBox.Clear();
        await SendMessageAsync(text, viaVoice);
    }

    private async Task SendMessageAsync(string message, bool viaVoice)
    {
        if (_busy || string.IsNullOrWhiteSpace(message)) return;
        _busy = true;
        _voiceListening = false;
        _voiceDebounceTimer.Stop();
        UpdateMicButtonState();
        _sendBtn.Enabled = false;
        _micBtn.Enabled = false;
        _statusLabel.Text = "Đang thực thi & đồng bộ...";

        AppendBubble(viaVoice ? "Bạn 🎙️" : "Bạn", message, Color.FromArgb(147, 197, 253));

        try
        {
            var result = await _onSend(message);
            var suffix = string.IsNullOrWhiteSpace(result.ActionLabel)
                ? ""
                : $"\n[{(result.ActionExecuted ? "✓" : "•")} {result.ActionLabel}]";
            AppendBubble("FocusGate AI", result.Reply + suffix, Color.FromArgb(248, 113, 113));
            _statusLabel.Text = "Web · PC · Android · Đã đồng bộ";
            if (result.ShouldRefresh)
            {
                await _onMutated();
            }
        }
        catch (Exception ex)
        {
            AppendBubble("FocusGate AI", $"Lỗi: {ex.Message}", Color.FromArgb(251, 191, 36));
            _statusLabel.Text = "Không thể kết nối FocusGate AI";
        }
        finally
        {
            _busy = false;
            _sendBtn.Enabled = true;
            _micBtn.Enabled = true;
            _inputBox.Focus();
        }
    }

    private void AppendBubble(string sender, string text, Color senderColor)
    {
        _historyBox.SelectionStart = _historyBox.TextLength;
        _historyBox.SelectionColor = senderColor;
        _historyBox.SelectionFont = new Font("Segoe UI", 9f, FontStyle.Bold);
        _historyBox.AppendText($"{sender}:\n");

        _historyBox.SelectionStart = _historyBox.TextLength;
        _historyBox.SelectionColor = Color.FromArgb(244, 240, 238);
        _historyBox.SelectionFont = new Font("Segoe UI", 9.5f, FontStyle.Regular);
        _historyBox.AppendText($"{text}\n\n");
        _historyBox.ScrollToCaret();
    }

    private static Bitmap CreateKeystoneSparkBitmap(int size)
    {
        var bmp = new Bitmap(size, size);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var s = size / 64f;

        using (var bg = new LinearGradientBrush(
                   new PointF(0, 0),
                   new PointF(size, size),
                   Color.FromArgb(38, 21, 21),
                   Color.FromArgb(45, 16, 16)))
        using (var path = CreateRoundedRect(new RectangleF(1 * s, 1 * s, 62 * s, 62 * s), 16 * s))
        {
            g.FillPath(bg, path);
            using var border = new Pen(Color.FromArgb(80, 46, 46), 1.5f * s);
            g.DrawPath(border, path);
        }

        // Outer arch
        using (var archPen = new Pen(Color.FromArgb(250, 247, 245), 3.2f * s) { StartCap = LineCap.Round, EndCap = LineCap.Round })
        {
            g.DrawLine(archPen, 17 * s, 49 * s, 17 * s, 32 * s);
            g.DrawArc(archPen, 17 * s, 17 * s, 30 * s, 30 * s, 180, 180);
            g.DrawLine(archPen, 47 * s, 32 * s, 47 * s, 49 * s);
        }

        // Inner arch
        using (var innerPen = new Pen(Color.FromArgb(185, 250, 247, 245), 2.4f * s) { StartCap = LineCap.Round, EndCap = LineCap.Round })
        {
            g.DrawLine(innerPen, 24 * s, 49 * s, 24 * s, 33 * s);
            g.DrawArc(innerPen, 24 * s, 25 * s, 16 * s, 16 * s, 180, 180);
            g.DrawLine(innerPen, 40 * s, 33 * s, 40 * s, 49 * s);
        }

        // 4-point crimson AI spark at apex
        var sparkPoints = new[]
        {
            new PointF(32 * s, 7.5f * s),
            new PointF(34.5f * s, 13.5f * s),
            new PointF(40.5f * s, 16 * s),
            new PointF(34.5f * s, 18.5f * s),
            new PointF(32 * s, 24.5f * s),
            new PointF(29.5f * s, 18.5f * s),
            new PointF(23.5f * s, 16 * s),
            new PointF(29.5f * s, 13.5f * s),
        };
        using var sparkBrush = new LinearGradientBrush(
            new PointF(32 * s, 7 * s),
            new PointF(32 * s, 25 * s),
            Color.FromArgb(255, 241, 242),
            Color.FromArgb(220, 38, 38));
        g.FillPolygon(sparkBrush, sparkPoints);

        return bmp;
    }

    private static GraphicsPath CreateRoundedRect(RectangleF bounds, float radius)
    {
        var path = new GraphicsPath();
        var d = radius * 2f;
        path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
        path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
        path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
}
