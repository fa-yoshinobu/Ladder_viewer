using System.Reflection;

namespace LadderViewer;

internal sealed class AboutWindow : Form
{
    public AboutWindow()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var product = assembly.GetCustomAttribute<AssemblyProductAttribute>()?.Product
            ?? assembly.GetName().Name ?? "Ladder Viewer";
        var version = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0]
            ?? assembly.GetName().Version?.ToString(3) ?? "—";

        Text = "バージョン情報";
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        Font = SystemFonts.MessageBoxFont;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(760, 600);
        MinimumSize = new Size(560, 420);
        ShowInTaskbar = false;
        MinimizeBox = false;

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(16),
            ColumnCount = 1,
            RowCount = 5
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(layout);

        layout.Controls.Add(new Label
        {
            AutoSize = true, Dock = DockStyle.Fill, Text = product, Margin = new Padding(0, 0, 0, 6)
        }, 0, 0);
        layout.Controls.Add(new Label
        {
            AutoSize = true, Dock = DockStyle.Fill, Text = $"バージョン {version} / MITライセンス", Margin = new Padding(0, 0, 0, 12)
        }, 0, 1);
        layout.Controls.Add(new Label
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            Text = "使用ライブラリ: Preact（MIT） / Papa Parse（CSV・MIT）\r\n"
                + "diff（差分・BSD 3-Clause） / WebView2 SDK（BSD 3-Clause）\r\nVite modulepreload polyfill（MIT）",
            Margin = new Padding(0, 0, 0, 12)
        }, 0, 2);
        layout.Controls.Add(new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            ShortcutsEnabled = true,
            HideSelection = false,
            Text = ReadLicense(assembly, "LadderViewer.LICENSE") + "\r\n\r\n------------------------------\r\n\r\n使用ライブラリのライセンス\r\n\r\n" + ReadLicense(assembly, "LadderViewer.THIRD-PARTY-NOTICES.txt"),
            AccessibleName = "本体と使用ライブラリのライセンス全文",
            Margin = Padding.Empty
        }, 0, 3);

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Margin = new Padding(0, 12, 0, 0)
        };
        var close = new Button
        {
            Text = "閉じる",
            AutoSize = true,
            MinimumSize = new Size(90, 30),
            DialogResult = DialogResult.Cancel,
            UseVisualStyleBackColor = true,
            Margin = Padding.Empty
        };
        buttons.Controls.Add(close);
        layout.Controls.Add(buttons, 0, 4);
        AcceptButton = close;
        CancelButton = close;
    }

    private static string ReadLicense(Assembly assembly, string resourceName)
    {
        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
            return "ライセンス情報が見つかりません。アプリを再ビルドしてください。";
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd().ReplaceLineEndings(Environment.NewLine);
    }
}
