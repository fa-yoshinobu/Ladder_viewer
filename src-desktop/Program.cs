using System.Reflection;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace LadderViewer;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new ViewerWindow(args));
    }
}

internal sealed class ViewerWindow : Form
{
    private const string AppHost = "ladder.local";
    private readonly WebView2 view = new() { Dock = DockStyle.Fill };
    private bool selectionBusy;
    private readonly ContextMenuStrip instructionMenu = new();
    private string instructionText = "";
    private CommentListRequest? instructionComments;
    private readonly ToolStripMenuItem commentListMenu = new("コメントリスト");
    private CommentListWindow? commentListWindow;
    private WebAssetCache? assetCache;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private string[] startupPaths;

    public ViewerWindow(string[] paths)
    {
        startupPaths = paths;
        Text = "Ladder Viewer";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        MinimumSize = new Size(960, 640);
        Size = new Size(1500, 950);
        StartPosition = FormStartPosition.CenterScreen;
        Controls.Add(view);
        Shown += InitializeView;
        instructionMenu.Items.Add("コピー", null, (_, _) => CopyInstruction());
        commentListMenu.Click += (_, _) => { if (instructionComments is { } comments) ShowCommentList(comments); };
        instructionMenu.Items.Add(commentListMenu);
        Disposed += (_, _) => instructionMenu.Dispose();
        Disposed += (_, _) => assetCache?.Dispose();
    }

    private async void InitializeView(object? sender, EventArgs e)
    {
        try
        {
            var dataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LadderViewer");
            using var webArchive = Assembly.GetExecutingAssembly().GetManifestResourceStream("LadderViewer.web.zip")
                ?? throw new InvalidOperationException("画面データが見つかりません。アプリを再ビルドしてください。");
            var anotherViewer = System.Diagnostics.Process.GetProcessesByName("LadderViewer");
            bool preserveUnleased;
            try { preserveUnleased = anotherViewer.Any(process => process.Id != Environment.ProcessId); }
            finally { foreach (var process in anotherViewer) process.Dispose(); }
            assetCache = WebAssetCache.Open(webArchive, Path.Combine(dataRoot, "app"), preserveUnleased);
            var assets = assetCache.AssetsPath;

            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: Path.Combine(dataRoot, "WebView2"));
            await view.EnsureCoreWebView2Async(environment);
            view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            view.CoreWebView2.Settings.AreDevToolsEnabled = false;
            view.CoreWebView2.Settings.IsStatusBarEnabled = false;
            view.CoreWebView2.Settings.IsZoomControlEnabled = false;
            view.CoreWebView2.SetVirtualHostNameToFolderMapping(AppHost, assets, CoreWebView2HostResourceAccessKind.Deny);
            view.CoreWebView2.NavigationStarting += (_, navigation) =>
            {
                if (!Uri.TryCreate(navigation.Uri, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.Host != AppHost)
                    navigation.Cancel = true;
            };
            view.CoreWebView2.NewWindowRequested += (_, request) => request.Handled = true;
            view.CoreWebView2.NavigationCompleted += (_, navigation) =>
            {
                if (!navigation.IsSuccess)
                    MessageBox.Show(this, $"画面を開けませんでした。\n{navigation.WebErrorStatus}", "Ladder Viewer", MessageBoxButtons.OK, MessageBoxIcon.Error);
            };
            view.CoreWebView2.WebMessageReceived += HandleWebMessage;
            view.CoreWebView2.Navigate($"https://{AppHost}/index.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(this, "Microsoft Edge WebView2 Runtimeが必要です。WebView2 Runtimeをインストールしてから起動してください。", "Ladder Viewer", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
        catch (Exception error)
        {
            MessageBox.Show(this, $"起動できませんでした。\n{error.Message}", "Ladder Viewer", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private async void HandleWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs request)
    {
        if (!string.Equals(request.Source, $"https://{AppHost}/index.html", StringComparison.Ordinal)) return;
        long token;
        string action;
        try
        {
            using var message = JsonDocument.Parse(request.WebMessageAsJson);
            var root = message.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("type", out var type)
                || type.ValueKind != JsonValueKind.String) return;
            if (type.GetString() == "instruction-menu")
            {
                if (!root.TryGetProperty("text", out var text) || text.ValueKind != JsonValueKind.String) return;
                var content = text.GetString();
                if (string.IsNullOrWhiteSpace(content) || content.Length > 1_000_000) return;
                instructionText = content;
                instructionComments = ReadCommentList(root);
                commentListMenu.Visible = instructionComments is not null;
                instructionMenu.Show(Cursor.Position);
                return;
            }
            action = type.GetString()!;
            if (action == "show-comment-list")
            {
                if (ReadCommentList(root) is { } comments) ShowCommentList(comments);
                return;
            }
            if (action == "show-about")
            {
                using var dialog = new AboutWindow(root.TryGetProperty("dark", out var dark) && dark.ValueKind == JsonValueKind.True);
                dialog.ShowDialog(this);
                return;
            }
            if (action is not ("open-csv" or "open-folder" or "open-startup" or "read-dropped") || !root.TryGetProperty("token", out var value)
                || value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out token) || token < 0) return;
            if (action == "open-startup" && startupPaths.Length == 0) return;
        }
        catch (JsonException) { return; }
        if (selectionBusy)
        {
            Reply(new { type = "csv-selection", token, status = "error", error = "プログラムファイルの選択または読込み中です。" });
            return;
        }
        selectionBusy = true;
        try
        {
            CsvSelectionResult result;
            if (action == "read-dropped")
            {
                var paths = request.AdditionalObjects.OfType<CoreWebView2File>().Select(file => file.Path).ToArray();
                if (paths.Length == 0) throw new IOException("読み込むファイルがありません。");
                Reply(new { type = "csv-selection", token, status = "loading" });
                result = await Task.Run(() => CsvFileSelection.ReadPaths(paths));
            }
            else if (action == "open-startup")
            {
                Reply(new { type = "csv-selection", token, status = "loading" });
                var paths = startupPaths;
                startupPaths = [];
                if (paths.Length > 0 && paths[0] == "--compare")
                {
                    if (paths.Length != 3) throw new IOException("--compare の後に比較元と比較先のファイルまたはフォルダーを指定してください。");
                    var source = await Task.Run(() => CsvFileSelection.ReadPaths(new[] { paths[1] }));
                    var target = await Task.Run(() => CsvFileSelection.ReadPaths(new[] { paths[2] }));
                    Reply(new { type = "csv-selection", token, status = "ok", comparison = new { source = source.Files, target = target.Files, sourceWarnings = source.Warnings, targetWarnings = target.Warnings }, warnings = source.Warnings.Concat(target.Warnings).ToArray() });
                    return;
                }
                result = await Task.Run(() => CsvFileSelection.ReadPaths(paths));
            }
            else if (action == "open-folder")
            {
                using var dialog = new FolderBrowserDialog
                {
                    Description = "CSV/MNMを読み込むフォルダーを選択",
                    UseDescriptionForTitle = true,
                    ShowNewFolderButton = false,
                    Multiselect = true
                };
                if (dialog.ShowDialog(this) != DialogResult.OK)
                {
                    Reply(new { type = "csv-selection", token, status = "cancelled" });
                    return;
                }
                var paths = dialog.SelectedPaths;
                result = await Task.Run(() => CsvFileSelection.ReadFolders(paths));
            }
            else
            {
                using var dialog = new OpenFileDialog
                {
                    Title = "プログラムファイルを開く",
                    Filter = "プログラムファイル (*.csv;*.mnm)|*.csv;*.mnm|三菱 CSV (*.csv)|*.csv|キーエンス MNM (*.mnm)|*.mnm",
                    Multiselect = true,
                    RestoreDirectory = true,
                    CheckFileExists = true,
                    CheckPathExists = true
                };
                if (dialog.ShowDialog(this) != DialogResult.OK)
                {
                    Reply(new { type = "csv-selection", token, status = "cancelled" });
                    return;
                }
                var paths = dialog.FileNames;
                result = await Task.Run(() => CsvFileSelection.ReadSelected(paths));
            }
            Reply(new { type = "csv-selection", token, status = "ok", files = result.Files, warnings = result.Warnings });
        }
        catch (Exception error)
        {
            Reply(new { type = "csv-selection", token, status = "error", error = error.Message });
        }
        finally { selectionBusy = false; }
    }

    private static CommentListRequest? ReadCommentList(JsonElement root)
    {
        if (!root.TryGetProperty("commentList", out var value) || value.ValueKind != JsonValueKind.Object) return null;
        var data = value.Deserialize<CommentListRequest>(JsonOptions);
        if (data?.Title is null || data.SelectedAddress is null || data.Entries is null || data.Entries.Length > 200_000
            || data.Entries.Any(row => row is null || string.IsNullOrWhiteSpace(row.Address) || row.Comment is null)) return null;
        return data;
    }

    private void ShowCommentList(CommentListRequest comments)
    {
        if (commentListWindow is null || commentListWindow.IsDisposed) commentListWindow = new CommentListWindow();
        if (!commentListWindow.Visible) commentListWindow.Show(this);
        commentListWindow.SetComments(comments);
        commentListWindow.Activate();
    }

    private void CopyInstruction()
    {
        try { Clipboard.SetText(instructionText, TextDataFormat.UnicodeText); }
        catch (Exception error)
        {
            MessageBox.Show(this, $"コピーできませんでした。\n{error.Message}", "Ladder Viewer", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
    private void Reply(object message)
    {
        if (IsDisposed || Disposing || view.IsDisposed || view.CoreWebView2 is null) return;
        if (!string.Equals(view.CoreWebView2.Source, $"https://{AppHost}/index.html", StringComparison.Ordinal)) return;
        view.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(message, JsonOptions));
    }
}
