using System.Drawing.Drawing2D;

namespace FocusGate.Agent.Poc.UI;

/// <summary>
/// Always-on-top compact floating Focus Timer pill displayed on the Windows desktop
/// while an active focus session is running (synced across Web, Android & Windows).
/// </summary>
public sealed class FloatingTimerForm : Form
{
    private readonly Label _titleLabel;
    private readonly Label _clockLabel;
    private readonly Button _doneButton;
    private readonly System.Windows.Forms.Timer _tickTimer;
    private Point _dragStart;
    private bool _dragging;
    private int _elapsedSeconds;

    public event EventHandler? CompleteRequested;

    public FloatingTimerForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        ShowInTaskbar = false;
        Width = 276;
        Height = 48;
        Opacity = 0.94;
        BackColor = Color.FromArgb(22, 16, 18);
        ForeColor = Color.FromArgb(250, 247, 245);
        ApplyRoundedRegion(22);

        var area = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        Location = new Point(area.Right - Width - 20, area.Bottom - Height - 20);

        _clockLabel = new Label
        {
            Text = "00:00",
            AutoSize = false,
            Width = 56,
            Height = 46,
            Left = 12,
            Top = 0,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Consolas", 11f, FontStyle.Bold),
            ForeColor = Color.FromArgb(248, 113, 113),
        };

        _titleLabel = new Label
        {
            Text = "Focus Sprint",
            AutoSize = false,
            Width = 122,
            Height = 46,
            Left = 70,
            Top = 0,
            AutoEllipsis = true,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            ForeColor = Color.FromArgb(245, 240, 238),
        };

        _doneButton = new Button
        {
            Text = "Done",
            Width = 56,
            Height = 28,
            Left = 198,
            Top = 9,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(185, 28, 28),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            Cursor = Cursors.Hand,
        };
        _doneButton.FlatAppearance.BorderSize = 0;
        _doneButton.Click += (_, _) => CompleteRequested?.Invoke(this, EventArgs.Empty);

        Controls.Add(_clockLabel);
        Controls.Add(_titleLabel);
        Controls.Add(_doneButton);

        foreach (Control ctrl in new Control[] { this, _clockLabel, _titleLabel })
        {
            ctrl.MouseDown += (_, e) =>
            {
                if (e.Button != MouseButtons.Left) return;
                _dragging = true;
                _dragStart = e.Location;
            };
            ctrl.MouseMove += (_, e) =>
            {
                if (!_dragging) return;
                Location = new Point(Left + e.X - _dragStart.X, Top + e.Y - _dragStart.Y);
            };
            ctrl.MouseUp += (_, _) =>
            {
                _dragging = false;
                SnapToScreenEdge();
            };
        }

        _tickTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        _tickTimer.Tick += (_, _) =>
        {
            _elapsedSeconds++;
            _clockLabel.Text = FormatClock(_elapsedSeconds);
        };
    }

    public void UpdateSession(string? taskTitle, bool isVi)
    {
        _titleLabel.Text = string.IsNullOrWhiteSpace(taskTitle)
            ? (isVi ? "Phiên tập trung" : "Focus Sprint")
            : taskTitle;
        _doneButton.Text = isVi ? "Xong" : "Done";
        if (!_tickTimer.Enabled)
        {
            _elapsedSeconds = 0;
            _clockLabel.Text = "00:00";
            _tickTimer.Start();
        }
        if (!Visible) Show();
    }

    public void HideSession()
    {
        _tickTimer.Stop();
        if (Visible) Hide();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var path = CreateRoundedPath(new Rectangle(1, 1, Width - 3, Height - 3), 22);
        using var pen = new Pen(Color.FromArgb(220, 56, 56), 1.5f);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.DrawPath(pen, path);
    }

    private void ApplyRoundedRegion(int radius)
    {
        using var path = CreateRoundedPath(new Rectangle(0, 0, Width, Height), radius);
        Region = new Region(path);
    }

    private static GraphicsPath CreateRoundedPath(Rectangle bounds, int radius)
    {
        var path = new GraphicsPath();
        var d = radius * 2;
        path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
        path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
        path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private void SnapToScreenEdge()
    {
        var area = Screen.FromControl(this).WorkingArea;
        var x = Left;
        var y = Top;
        const int margin = 16;
        const int snap = 36;
        if (Math.Abs(Left - area.Left) < snap) x = area.Left + margin;
        else if (Math.Abs(area.Right - Right) < snap) x = area.Right - Width - margin;
        if (Math.Abs(Top - area.Top) < snap) y = area.Top + margin;
        else if (Math.Abs(area.Bottom - Bottom) < snap) y = area.Bottom - Height - margin;
        Location = new Point(x, y);
    }

    private static string FormatClock(int seconds)
    {
        var mins = seconds / 60;
        var secs = seconds % 60;
        return $"{mins:00}:{secs:00}";
    }
}
