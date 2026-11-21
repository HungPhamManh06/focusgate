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

    public BlockOverlayForm(ForegroundApp app, string category)
    {
        Text = "FocusGate – Locked";
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
            Text = $"“{app.ProcessName}” is locked ({category}).\nComplete your Must Do tasks to earn unlock time.",
            Font = new Font("Segoe UI", 26f, FontStyle.Bold),
            ForeColor = Foreground,
            MaximumSize = new Size(900, 0),
            AutoSize = true,
            Location = new Point(80, 140),
        };

        var note = new Label
        {
            Text = "Personal Strict Mode: this screen can be dismissed. FocusGate does not claim an unbreakable lock.",
            Font = new Font("Segoe UI", 10f),
            ForeColor = Muted,
            AutoSize = true,
            Location = new Point(80, 300),
        };

        var dismiss = new Button
        {
            Text = "Back to tasks (PoC dismiss)",
            Font = new Font("Segoe UI Semibold", 11f),
            ForeColor = Color.FromArgb(15, 17, 23),
            BackColor = Accent,
            FlatStyle = FlatStyle.Flat,
            AutoSize = true,
            Padding = new Padding(16, 10, 16, 10),
            Location = new Point(80, 350),
        };
        dismiss.FlatAppearance.BorderSize = 0;
        dismiss.Click += (_, _) => Close();

        Controls.Add(_titleLabel);
        Controls.Add(_appLabel);
        Controls.Add(note);
        Controls.Add(dismiss);

        Resize += (_, _) => LayoutChildren();
        LayoutChildren();
    }

    public void UpdateBlockedApp(ForegroundApp app, string category)
    {
        _appLabel.Text =
            $"“{app.ProcessName}” is locked ({category}).\nComplete your Must Do tasks to earn unlock time.";
        LayoutChildren();
    }

    private void LayoutChildren()
    {
        var width = Math.Max(600, ClientSize.Width - 160);
        _appLabel.MaximumSize = new Size(width, 0);
        _titleLabel.Location = new Point(80, 80);
        _appLabel.Location = new Point(80, 140);
    }
}
