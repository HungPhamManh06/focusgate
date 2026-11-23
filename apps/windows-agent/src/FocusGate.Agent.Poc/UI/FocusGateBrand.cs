using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace FocusGate.Agent.Poc.UI;

public static class FocusGateBrand
{
    private static readonly Lazy<Icon> CachedIcon = new(() => CreateIcon(32));

    public static Icon AppIcon => CachedIcon.Value;

    public static Bitmap CreateLogoBitmap(int size = 32)
    {
        var bmp = new Bitmap(size, size);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.Clear(Color.Transparent);

        float scale = size / 32f;

        // Rounded dark background (#1E1414 -> #291111)
        using var bgPath = CreateRoundedRect(0, 0, size - 0.5f, size - 0.5f, 8f * scale);
        using var bgBrush = new LinearGradientBrush(
            new PointF(0, 0),
            new PointF(size, size),
            Color.FromArgb(30, 20, 20),
            Color.FromArgb(41, 17, 17));
        g.FillPath(bgBrush, bgPath);

        // Subtle red glow in center
        using var glowBrush = new SolidBrush(Color.FromArgb(48, 220, 38, 38));
        g.FillEllipse(glowBrush, 4f * scale, 3f * scale, 24f * scale, 22f * scale);

        // Outer gate arch
        using var outerPen = new Pen(Color.FromArgb(250, 247, 245), Math.Max(1.5f, 2f * scale))
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round,
        };
        using var outerPath = new GraphicsPath();
        outerPath.AddLine(9.5f * scale, 24.5f * scale, 9.5f * scale, 14.2f * scale);
        outerPath.AddArc(9.5f * scale, 7.7f * scale, 13f * scale, 13f * scale, 180f, 180f);
        outerPath.AddLine(22.5f * scale, 14.2f * scale, 22.5f * scale, 24.5f * scale);
        g.DrawPath(outerPen, outerPath);

        // Inner gate arch
        using var innerPen = new Pen(Color.FromArgb(250, 247, 245), Math.Max(1.2f, 1.8f * scale))
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round,
        };
        using var innerPath = new GraphicsPath();
        innerPath.AddLine(13.2f * scale, 24.5f * scale, 13.2f * scale, 18.8f * scale);
        innerPath.AddArc(13.2f * scale, 16.0f * scale, 5.6f * scale, 5.6f * scale, 180f, 180f);
        innerPath.AddLine(18.8f * scale, 18.8f * scale, 18.8f * scale, 24.5f * scale);
        g.DrawPath(innerPen, innerPath);

        // Base line
        g.DrawLine(outerPen, 8.5f * scale, 24.5f * scale, 23.5f * scale, 24.5f * scale);

        // Red center dot (#EF4444)
        using var dotBrush = new SolidBrush(Color.FromArgb(239, 68, 68));
        float r = 1.6f * scale;
        g.FillEllipse(dotBrush, 16f * scale - r, 10.8f * scale - r, r * 2f, r * 2f);

        return bmp;
    }

    private static Icon CreateIcon(int size)
    {
        using var bmp = CreateLogoBitmap(size);
        var hIcon = bmp.GetHicon();
        try
        {
            using var tmp = Icon.FromHandle(hIcon);
            return (Icon)tmp.Clone();
        }
        finally
        {
            DestroyIcon(hIcon);
        }
    }

    private static GraphicsPath CreateRoundedRect(float x, float y, float w, float h, float radius)
    {
        var path = new GraphicsPath();
        float d = radius * 2f;
        path.AddArc(x, y, d, d, 180, 90);
        path.AddArc(x + w - d, y, d, d, 270, 90);
        path.AddArc(x + w - d, y + h - d, d, d, 0, 90);
        path.AddArc(x, y + h - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyIcon(IntPtr hIcon);
}
