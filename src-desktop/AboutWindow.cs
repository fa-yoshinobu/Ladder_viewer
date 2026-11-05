using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Reflection;
using System.Runtime.InteropServices;

namespace LadderViewer;

internal sealed class AboutWindow : Form
{
    private sealed record Palette(Color Background, Color Surface, Color Text, Color SubText, Color Border, Color Accent, Color OnAccent);

    // DADS tokens, matching the web UI's light and dark themes.
    private static readonly Palette Light = new(Color.White, ColorTranslator.FromHtml("#F8F8FB"), ColorTranslator.FromHtml("#1A1A1A"),
        ColorTranslator.FromHtml("#4D4D4D"), ColorTranslator.FromHtml("#CCCCCC"), ColorTranslator.FromHtml("#0017C1"), Color.White);
    private static readonly Palette Dark = new(ColorTranslator.FromHtml("#1F1F1F"), ColorTranslator.FromHtml("#2A2A2A"), ColorTranslator.FromHtml("#F2F2F2"),
        ColorTranslator.FromHtml("#CCCCCC"), ColorTranslator.FromHtml("#4D4D4D"), ColorTranslator.FromHtml("#9DB7F9"), ColorTranslator.FromHtml("#000060"));

    private static readonly (string Name, string Purpose, string License)[] Libraries =
    [
        ("Preact", "画面表示", "MIT"),
        ("Papa Parse", "CSV解析", "MIT"),
        ("diff", "差分", "BSD 3-Clause"),
        ("WebView2 SDK", "画面ホスト", "BSD 3-Clause"),
        ("Vite modulepreload polyfill", "読込み補助", "MIT"),
    ];

    private readonly bool dark;

    public AboutWindow(bool dark = false)
    {
        this.dark = dark;
        var colors = dark ? Dark : Light;
        var assembly = Assembly.GetExecutingAssembly();
        var product = assembly.GetCustomAttribute<AssemblyProductAttribute>()?.Product
            ?? assembly.GetName().Name ?? "Ladder Viewer";
        var version = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0]
            ?? assembly.GetName().Version?.ToString(3) ?? "—";
        var license = ReadLicense(assembly, "LadderViewer.LICENSE");
        var copyright = license.Split('\n').Select(line => line.Trim()).FirstOrDefault(line => line.StartsWith("Copyright", StringComparison.OrdinalIgnoreCase)) ?? "";

        Text = "バージョン情報";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = new Font("Yu Gothic UI", 9.75F);
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(680, 720);
        MinimumSize = new Size(560, 520);
        ShowInTaskbar = false;
        MinimizeBox = false;
        BackColor = colors.Background;
        ForeColor = colors.Text;

        var header = new AboutHeader(product, version, LoadIcon(assembly)) { Dock = DockStyle.Top, Height = 132 };

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(24, 20, 24, 18),
            ColumnCount = 1,
            RowCount = 6
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(header);
        Controls.Add(layout);
        layout.BringToFront();

        var facts = Grid(2, colors);
        AddRow(facts, colors, ("バージョン", colors.SubText, false), (version, colors.Text, true));
        AddRow(facts, colors, ("ライセンス", colors.SubText, false), ("MITライセンス", colors.Text, true));
        AddRow(facts, colors, ("画面表示", colors.SubText, false), (WebViewVersion(), colors.Text, true));
        facts.Margin = new Padding(0, 0, 0, 18);
        layout.Controls.Add(facts, 0, 0);

        layout.Controls.Add(SectionTitle("使用ライブラリ", colors), 0, 1);
        var libraries = Grid(3, colors);
        foreach (var library in Libraries)
            AddRow(libraries, colors, (library.Name, colors.Text, true), (library.Purpose, colors.SubText, false), (library.License, colors.Accent, false));
        libraries.Margin = new Padding(0, 0, 0, 18);
        layout.Controls.Add(libraries, 0, 2);

        layout.Controls.Add(SectionTitle("ライセンス全文", colors), 0, 3);
        var licenseText = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            ShortcutsEnabled = true,
            HideSelection = false,
            BorderStyle = BorderStyle.FixedSingle,
            BackColor = colors.Surface,
            ForeColor = colors.Text,
            Font = new Font("Consolas", 9F),
            Text = license + "\r\n\r\n------------------------------\r\n\r\n使用ライブラリのライセンス\r\n\r\n" + ReadLicense(assembly, "LadderViewer.THIRD-PARTY-NOTICES.txt"),
            AccessibleName = "本体と使用ライブラリのライセンス全文",
            Margin = Padding.Empty
        };
        if (dark) licenseText.HandleCreated += (_, _) => SetWindowTheme(licenseText.Handle, "DarkMode_Explorer", null);
        layout.Controls.Add(licenseText, 0, 4);

        var footer = new TableLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, ColumnCount = 3, RowCount = 1, Margin = new Padding(0, 16, 0, 0) };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        footer.Controls.Add(new Label { AutoSize = true, Anchor = AnchorStyles.Left, Text = copyright, ForeColor = colors.SubText, Margin = Padding.Empty }, 0, 0);
        var close = new Button
        {
            Text = "閉じる",
            AutoSize = true,
            MinimumSize = new Size(112, 36),
            DialogResult = DialogResult.Cancel,
            FlatStyle = FlatStyle.Flat,
            BackColor = colors.Accent,
            ForeColor = colors.OnAccent,
            Font = new Font(Font, FontStyle.Bold),
            Cursor = Cursors.Hand,
            Margin = Padding.Empty
        };
        close.FlatAppearance.BorderSize = 0;
        close.FlatAppearance.MouseOverBackColor = dark ? ColorTranslator.FromHtml("#C5D7FB") : ColorTranslator.FromHtml("#00118F");
        close.FlatAppearance.MouseDownBackColor = dark ? ColorTranslator.FromHtml("#D9E6FF") : ColorTranslator.FromHtml("#000082");
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        var sendTo = new Button
        {
            Text = "「送る」に追加",
            AutoSize = true,
            MinimumSize = new Size(136, 36),
            FlatStyle = FlatStyle.Flat,
            BackColor = colors.Surface,
            ForeColor = colors.Text,
            Cursor = Cursors.Hand,
            Margin = new Padding(0, 0, 8, 0)
        };
        sendTo.Click += (_, _) =>
        {
            try
            {
                SendToShortcut.Create(Application.ExecutablePath, Environment.GetFolderPath(Environment.SpecialFolder.SendTo));
                MessageBox.Show(this, "「送る」にLadder Viewerを追加しました。", "Ladder Viewer", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception error)
            {
                MessageBox.Show(this, $"「送る」に追加できませんでした。\n{error.Message}", "Ladder Viewer", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        };
        footer.Controls.Add(sendTo, 1, 0);
        footer.Controls.Add(close, 2, 0);
        layout.Controls.Add(footer, 0, 5);
        AcceptButton = close;
        CancelButton = close;
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        if (!dark) return;
        var enabled = 1;
        // DWMWA_USE_IMMERSIVE_DARK_MODE; ignored on Windows versions without dark title bars.
        _ = DwmSetWindowAttribute(Handle, 20, ref enabled, sizeof(int));
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    // Dark scrollbars for the license text in dark mode.
    [DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
    private static extern int SetWindowTheme(IntPtr hwnd, string? subAppName, string? subIdList);

    private static TableLayoutPanel Grid(int columns, Palette colors)
    {
        var grid = new TableLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, ColumnCount = columns, BackColor = colors.Background };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        for (var i = 1; i < columns; i++)
            grid.ColumnStyles.Add(new ColumnStyle(i == columns - 1 ? SizeType.Percent : SizeType.AutoSize, 100));
        return grid;
    }

    private void AddRow(TableLayoutPanel grid, Palette colors, params (string Text, Color Color, bool Bold)[] cells)
    {
        var row = grid.RowCount++;
        grid.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        for (var i = 0; i < cells.Length; i++)
            grid.Controls.Add(new Label
            {
                AutoSize = true,
                Text = cells[i].Text,
                ForeColor = cells[i].Color,
                Font = cells[i].Bold ? new Font(Font, FontStyle.Bold) : Font,
                Margin = new Padding(0, 3, 24, 3)
            }, i, row);
    }

    private Label SectionTitle(string text, Palette colors) => new()
    {
        AutoSize = true,
        Text = text,
        ForeColor = colors.Text,
        Font = new Font(Font.FontFamily, 11F, FontStyle.Bold),
        Margin = new Padding(0, 0, 0, 8)
    };

    private static string WebViewVersion()
    {
        try { return "WebView2 Runtime " + Microsoft.Web.WebView2.Core.CoreWebView2Environment.GetAvailableBrowserVersionString(); }
        catch (Exception) { return "WebView2 Runtime"; }
    }

    private static Bitmap? LoadIcon(Assembly assembly)
    {
        using var stream = assembly.GetManifestResourceStream("LadderViewer.app.ico");
        if (stream is null) return null;
        using var icon = new Icon(stream, new Size(256, 256));
        return icon.ToBitmap();
    }

    private static string ReadLicense(Assembly assembly, string resourceName)
    {
        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
            return "ライセンス情報が見つかりません。アプリを再ビルドしてください。";
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd().ReplaceLineEndings(Environment.NewLine);
    }

    // Brand band: app icon, product name and version badge over a faint ladder pattern.
    private sealed class AboutHeader : Control
    {
        private readonly string product;
        private readonly string version;
        private readonly Bitmap? icon;

        public AboutHeader(string product, string version, Bitmap? icon)
        {
            this.product = product;
            this.version = version;
            this.icon = icon;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw | ControlStyles.UserPaint, true);
            AccessibleRole = AccessibleRole.StaticText;
            AccessibleName = $"{product} バージョン {version}";
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) icon?.Dispose();
            base.Dispose(disposing);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            var s = DeviceDpi / 96f;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

            using (var band = new LinearGradientBrush(ClientRectangle, ColorTranslator.FromHtml("#0017C1"), ColorTranslator.FromHtml("#000060"), 20f))
                g.FillRectangle(band, ClientRectangle);

            // Ladder pattern on the right: two rails, rungs with a contact and a coil.
            using (var pattern = new Pen(Color.FromArgb(46, Color.White), 2 * s))
            {
                float left = Width - 230 * s, right = Width - 28 * s;
                g.DrawLine(pattern, left, -2, left, Height + 2);
                g.DrawLine(pattern, right, -2, right, Height + 2);
                for (float y = 22 * s; y < Height; y += 30 * s)
                {
                    float contact = left + 54 * s, coil = right - 40 * s;
                    g.DrawLine(pattern, left, y, contact, y);
                    g.DrawLine(pattern, contact, y - 9 * s, contact, y + 9 * s);
                    g.DrawLine(pattern, contact + 12 * s, y - 9 * s, contact + 12 * s, y + 9 * s);
                    g.DrawLine(pattern, contact + 12 * s, y, coil - 9 * s, y);
                    g.DrawEllipse(pattern, coil - 9 * s, y - 9 * s, 18 * s, 18 * s);
                    g.DrawLine(pattern, coil + 9 * s, y, right, y);
                }
            }

            var iconSize = 72 * s;
            var iconBounds = new RectangleF(28 * s, (Height - iconSize) / 2, iconSize, iconSize);
            using (var shadow = RoundedRectangle(RectangleF.Inflate(iconBounds, 3 * s, 3 * s), 18 * s))
            using (var ring = new SolidBrush(Color.FromArgb(70, Color.White)))
                g.FillPath(ring, shadow);
            if (icon is not null) g.DrawImage(icon, iconBounds);

            var textLeft = iconBounds.Right + 22 * s;
            using var title = new Font("Segoe UI Semibold", 22F);
            using var tagline = new Font("Yu Gothic UI", 10F);
            using var badgeFont = new Font("Segoe UI Semibold", 9F);
            var titleSize = g.MeasureString(product, title);
            var top = (Height - titleSize.Height - 54 * s) / 2;
            g.DrawString(product, title, Brushes.White, textLeft, top);
            using (var soft = new SolidBrush(ColorTranslator.FromHtml("#D9E6FF")))
                g.DrawString("MELSEC/KEYENCE ラダー表示・比較", tagline, soft, textLeft + 2 * s, top + titleSize.Height - 4 * s);

            var badgeText = "Version " + version;
            var badgeSize = g.MeasureString(badgeText, badgeFont);
            var badge = new RectangleF(textLeft + 2 * s, top + titleSize.Height + 24 * s, badgeSize.Width + 16 * s, badgeSize.Height + 6 * s);
            using (var path = RoundedRectangle(badge, badge.Height / 2))
            using (var fill = new SolidBrush(Color.FromArgb(40, Color.White)))
            using (var border = new Pen(Color.FromArgb(120, Color.White), 1 * s))
            {
                g.FillPath(fill, path);
                g.DrawPath(border, path);
            }
            g.DrawString(badgeText, badgeFont, Brushes.White, badge.X + 8 * s, badge.Y + 3 * s);
        }

        private static GraphicsPath RoundedRectangle(RectangleF r, float radius)
        {
            var d = radius * 2;
            var path = new GraphicsPath();
            path.AddArc(r.X, r.Y, d, d, 180, 90);
            path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }
    }
}
