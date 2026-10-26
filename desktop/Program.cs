using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
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
        Disposed += (_, _) => instructionMenu.Dispose();
    }

    private async void InitializeView(object? sender, EventArgs e)
    {
        try
        {
            var dataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LadderViewer");
            using var webArchive = Assembly.GetExecutingAssembly().GetManifestResourceStream("LadderViewer.web.zip")
                ?? throw new InvalidOperationException("画面データが見つかりません。アプリを再ビルドしてください。");
            var digest = Convert.ToHexString(SHA256.HashData(webArchive))[..16];
            webArchive.Position = 0;
            var assets = Path.Combine(dataRoot, "app", digest);
            Directory.CreateDirectory(assets);
            ZipFile.ExtractToDirectory(webArchive, assets, overwriteFiles: true);

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
                instructionMenu.Show(Cursor.Position);
                return;
            }
            action = type.GetString()!;
            if (action == "show-about")
            {
                using var dialog = new AboutWindow(root.TryGetProperty("dark", out var dark) && dark.ValueKind == JsonValueKind.True);
                dialog.ShowDialog(this);
                return;
            }
            if (action is not ("open-csv" or "open-folder" or "open-startup") || !root.TryGetProperty("token", out var value)
                || value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out token) || token < 0) return;
            if (action == "open-startup" && startupPaths.Length == 0) return;
        }
        catch (JsonException) { return; }
        if (selectionBusy)
        {
            Reply(new { type = "csv-selection", token, status = "error", error = "CSVファイルの選択または読込み中です。" });
            return;
        }
        selectionBusy = true;
        try
        {
            CsvSelectionResult result;
            if (action == "open-startup")
            {
                Reply(new { type = "csv-selection", token, status = "loading" });
                var paths = startupPaths;
                startupPaths = [];
                result = await Task.Run(() => CsvFileSelection.ReadPaths(paths));
            }
            else if (action == "open-folder")
            {
                using var dialog = new FolderBrowserDialog
                {
                    Description = "CSVを読み込むフォルダーを選択",
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
                    Title = "CSVファイルを開く",
                    Filter = "CSVファイル (*.csv)|*.csv",
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