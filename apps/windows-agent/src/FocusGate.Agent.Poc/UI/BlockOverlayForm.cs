using FocusGate.Agent.Poc.Models;

namespace FocusGate.Agent.Poc.UI;

/// <summary>
/// Full-screen soft block used by the PoC and by Personal Strict Mode.
/// It is a purely visual layer: it does not prevent the user from closing the
/// agent, and the product must never claim otherwise.
/// </summary>
public sealed class BlockOverlayForm : Form
{
    private static readonly Color Background = Color.FromArgb(15, 17, 23);
    private static readonly Color Foreground = Color.FromArgb(237, 239, 244);
    private static readonly Color Muted = Color.FromArgb(140, 148, 165);
    private static readonly Color Accent = Color.FromArgb(122, 162, 247);

    private readonly Label _appLabel;
    private readonly Label _titleLabel;
    private readonly Label _noteLabel;
    private readonly Button _dismissButton;

    public BlockOverlayForm(ForegroundApp app, string category, bool isVi = false)
    {
        Text = isVi ? "FocusGate – Đang khóa" : "FocusGate – Locked";
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Maximized;
        TopMost = true;
        BackColor = Background;
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = false;

        _titleLabel = new Label
        {
            Text = "FocusGate",
            Font = new Font("Segoe UI Semibold", 14f),
            ForeColor = Accent,
            AutoSize = true,
            Location = new Point(80, 80),
        };

        _appLabel = new Label
        {
            Text = FormatBlockedText(app, category, isVi),
            Font = new Font("Segoe UI", 26f, FontStyle.Bold),
            ForeColor = Foreground,
            MaximumSize = new Size(900, 0),
            AutoSize = true,
            Location = new Point(80, 140),
        };

        _noteLabel = new Label
        {
            Text = isVi
                ? "Chế độ Nghiêm ngặt Cá nhân: màn hình này có thể đóng tạm thời."
                : "Personal Strict Mode: this screen can be dismissed. FocusGate does not claim an unbreakable lock.",
            Font = new Font("Segoe UI", 10f),
            ForeColor = Muted,
            AutoSize = true,
            Location = new Point(80, 300),
        };

        _dismissButton = new Button
        {
            Text = isVi ? "Quay lại nhiệm vụ (Đóng)" : "Back to tasks (PoC dismiss)",
            Font = new Font("Segoe UI Semibold", 11f),
            ForeColor = Color.FromArgb(15, 17, 23),
            BackColor = Accent,
            FlatStyle = FlatStyle.Flat,
            AutoSize = true,
            Padding = new Padding(16, 10, 16, 10),
            Location = new Point(80, 350),
        };
        _dismissButton.FlatAppearance.BorderSize = 0;
        _dismissButton.Click += (_, _) => Close();

        Controls.Add(_titleLabel);
        Controls.Add(_appLabel);
        Controls.Add(_noteLabel);
        Controls.Add(_dismissButton);

        Resize += (_, _) => LayoutChildren();
        LayoutChildren();
    }

    public void UpdateBlockedApp(ForegroundApp app, string category, bool isVi = false)
    {
        Text = isVi ? "FocusGate – Đang khóa" : "FocusGate – Locked";
        _appLabel.Text = FormatBlockedText(app, category, isVi);
        _noteLabel.Text = isVi
            ? "Chế độ Nghiêm ngặt Cá nhân: màn hình này có thể đóng tạm thời."
            : "Personal Strict Mode: this screen can be dismissed. FocusGate does not claim an unbreakable lock.";
        _dismissButton.Text = isVi ? "Quay lại nhiệm vụ (Đóng)" : "Back to tasks (PoC dismiss)";
        LayoutChildren();
    }

    private static string FormatBlockedText(ForegroundApp app, string category, bool isVi) =>
        isVi
            ? $"“{app.ProcessName}” đang bị khóa ({category}).\nHoàn thành các việc Bắt buộc để nhận thời gian mở khóa."
            : $"“{app.ProcessName}” is locked ({category}).\nComplete your Must Do tasks to earn unlock time.";

    private void LayoutChildren()
    {
        var width = Math.Max(600, ClientSize.Width - 160);
        _appLabel.MaximumSize = new Size(width, 0);
        _titleLabel.Location = new Point(80, 80);
        _appLabel.Location = new Point(80, 140);
    }
}
