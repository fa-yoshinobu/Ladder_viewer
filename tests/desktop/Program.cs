using System.Text;
using System.Text.Json;
using LadderViewer;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
// All test inputs are generated here under fake-input; no external PLC files are read.
var root = Path.Combine(AppContext.BaseDirectory, "fake-input", Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
const string ProgramCsv = "\"ステップ番号\"\t\"命令\"\t\"I/O(デバイス)\"\n\"0\"\t\"OUT\"\t\"M0\"\n";
const string CommentCsv = "\"test\"\n\"デバイス名\"\t\"Japanese/日本語\"\n\"M0\"\t\"架空の運転コメント\"\n";
var passed = 0;
var skipped = 0;
void Check(bool condition, string name) { if (!condition) throw new Exception(name); Console.WriteLine("PASS " + name); passed++; }
using (var fixtures = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures", "comment-formats.json"))))
{
    foreach (var fixture in fixtures.RootElement.EnumerateArray())
    {
        var bytes = Convert.FromBase64String(fixture.GetProperty("base64").GetString()!);
        var name = fixture.GetProperty("name").GetString();
        if (fixture.GetProperty("text").ValueKind == JsonValueKind.Null)
        {
            var rejected = false;
            try { CsvFileSelection.DetectCommentFormat(() => new MemoryStream(bytes)); }
            catch (DecoderFallbackException) { rejected = true; }
            Check(rejected, "shared comment fixture rejects invalid encoding " + name);
        }
        else
        {
            var actual = CsvFileSelection.DetectCommentFormat(() => new MemoryStream(bytes))?.ToString().ToLowerInvariant();
            Check(actual == fixture.GetProperty("format").GetString(), "shared comment fixture " + name);
        }
    }
}
string Folder(string name) { var path = Path.Combine(root, name); Directory.CreateDirectory(path); return path; }
string Write(string folder, string name, string text, Encoding? encoding = null) { var path = Path.Combine(folder, name); File.WriteAllText(path, text, encoding ?? new UTF8Encoding(false)); return path; }

{
    var cacheRoot = Folder("asset-cache");
    MemoryStream Archive(string text)
    {
        var stream = new MemoryStream();
        using (var zip = new System.IO.Compression.ZipArchive(stream, System.IO.Compression.ZipArchiveMode.Create, leaveOpen: true))
        using (var writer = new StreamWriter(zip.CreateEntry("index.html").Open())) writer.Write(text);
        stream.Position = 0;
        return stream;
    }
    var dummy = Path.Combine(cacheRoot, "0000000000000000");
    Directory.CreateDirectory(dummy);
    File.WriteAllText(Path.Combine(dummy, "old.html"), "synthetic");
    using var firstArchive = Archive("synthetic first");
    using (var guarded = WebAssetCache.Open(firstArchive, cacheRoot, preserveUnleasedVersions: true))
        Check(Directory.Exists(dummy), "unleased legacy assets retained while another viewer runs");
    firstArchive.Position = 0;
    using var first = WebAssetCache.Open(firstArchive, cacheRoot);
    Check(!Directory.Exists(dummy), "old asset hash removed");
    var file = Path.Combine(first.AssetsPath, "index.html");
    var timestamp = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    File.SetLastWriteTimeUtc(file, timestamp);
    firstArchive.Position = 0;
    using (var same = WebAssetCache.Open(firstArchive, cacheRoot))
        Check(File.GetLastWriteTimeUtc(file) == timestamp, "complete asset hash skips extraction and supports concurrent same version");
    using var secondArchive = Archive("synthetic second");
    using var second = WebAssetCache.Open(secondArchive, cacheRoot);
    Check(File.Exists(file), "running different asset version is retained");
    first.Dispose();
    secondArchive.Position = 0;
    using (var again = WebAssetCache.Open(secondArchive, cacheRoot))
        Check(!Directory.Exists(first.AssetsPath), "inactive asset version removed on later startup");
    File.Delete(Path.Combine(second.AssetsPath, ".complete"));
    File.WriteAllText(Path.Combine(second.AssetsPath, "index.html"), "partial extraction");
    secondArchive.Position = 0;
    using (var recovered = WebAssetCache.Open(secondArchive, cacheRoot))
        Check(File.ReadAllText(Path.Combine(recovered.AssetsPath, "index.html")) == "synthetic second", "incomplete extraction recovered");
}

{
    var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    using var single = JsonDocument.Parse(JsonSerializer.Serialize(new CsvFilePayload("MAIN.csv", "YQ==", "0"), options));
    Check(!single.RootElement.TryGetProperty("relativePath", out _), "single-file payload omits absent relative path");
    using var folder = JsonDocument.Parse(JsonSerializer.Serialize(new CsvFilePayload("MAIN.csv", "YQ==", "0", "nested/MAIN.csv"), options));
    Check(folder.RootElement.GetProperty("relativePath").GetString() == "nested/MAIN.csv", "folder payload retains relative path");
}
foreach (var item in new (string Name, Encoding Encoding)[] {
    ("utf8", new UTF8Encoding(false)), ("utf8-bom", new UTF8Encoding(true)),
    ("utf16le", new UnicodeEncoding(false, true)), ("utf16be", new UnicodeEncoding(true, true)),
    ("shift-jis", Encoding.GetEncoding(932)) })
{
    var folder = Folder(item.Name);
    var program = Write(folder, "MAIN.csv", ProgramCsv);
    var comment = Write(folder, "COMMENT.csv", CommentCsv, item.Encoding);
    var result = CsvFileSelection.ReadSelected(new[] { program, program });
    Check(result.Files.Count == 2 && result.Files.Any(file => file.Name == "COMMENT.csv"), "comment encoding " + item.Name);
    Check(Convert.FromBase64String(result.Files.Single(file => file.Name == "COMMENT.csv").Base64).SequenceEqual(File.ReadAllBytes(comment)), "original bytes retained " + item.Name);
}

{
    var folder = Folder("scope");
    var program = Write(folder, "MAIN.csv", ProgramCsv);
    Write(folder, "comment.csv", CommentCsv);
    Write(folder, "OTHER.csv", ProgramCsv);
    Write(root, "parent-comments.csv", CommentCsv);
    Write(Folder("scope/nested"), "nested-comments.csv", CommentCsv);
    Write(folder, "false-header.csv", "\"デバイス名\"\t\"命令\"\n\"M0\"\t\"OUT\"");
    Write(folder, "late-header.csv", string.Join('\n', Enumerable.Repeat("\"p\"", 10)) + "\n" + CommentCsv);
    var result = CsvFileSelection.ReadSelected(new[] { program });
    Check(result.Files.Select(file => file.Name).Order().SequenceEqual(new[] { "MAIN.csv", "comment.csv" }.Order()), "direct folder only; exclude programs, command header and late header");
}
{
    var folder = Folder("blank-lines");
    var program = Write(folder, "MAIN.csv", ProgramCsv);
    Write(folder, "comment.csv", "\n\n\n\n\n\n\n\n\n\n" + CommentCsv);
    Check(CsvFileSelection.ReadSelected(new[] { program }).Files.Count == 2, "first ten nonempty lines ignore blank lines");
}
{
    var folder = Folder("priority");
    var program = Write(folder, "MAIN.csv", ProgramCsv);
    var explicitComment = Write(folder, "chosen.csv", CommentCsv);
    Write(folder, "automatic-a.csv", CommentCsv);
    Write(folder, "automatic-b.csv", CommentCsv);
    var result = CsvFileSelection.ReadSelected(new[] { program, explicitComment });
    Check(result.Files.Count == 2 && result.Files.Any(file => file.Name == "chosen.csv") && result.Warnings.Count == 0, "explicit comment excludes all automatic comments in same folder");
}
{
    var folder = Folder("multiple");
    var program = Write(folder, "MAIN.csv", ProgramCsv);
    Write(folder, "table-b.csv", CommentCsv); Write(folder, "table-a.csv", CommentCsv);
    var result = CsvFileSelection.ReadSelected(new[] { program });
    Check(result.Files.Count == 1 && result.Warnings.Count == 0, "automatic discovery ignores other comment filenames");
    Write(folder, "CoMmEnT.CsV", CommentCsv);
    var named = CsvFileSelection.ReadSelected(new[] { program });
    Check(named.Files.Count == 2 && named.Files.Any(file => file.Name == "CoMmEnT.CsV"), "automatic discovery matches comment.csv without case sensitivity");
}
{
    var a = Folder("same-name-a"); var b = Folder("same-name-b");
    var first = Write(a, "MAIN.csv", ProgramCsv); var second = Write(b, "MAIN.csv", ProgramCsv);
    Write(a, "COMMENT.csv", CommentCsv); Write(b, "COMMENT.csv", CommentCsv);
    var result = CsvFileSelection.ReadSelected(new[] { first, second });
    Check(result.Files.Count == 4 && result.Files.Select(file => file.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() == 4, "same filenames in different folders remain distinct");
    Check(result.Files.All(file => !Path.IsPathRooted(file.Name) && file.Name.Split('/').Length == 2), "display name uses minimal folder prefix");
    Check(result.Warnings.Count == 0 && result.Files.GroupBy(file => file.Folder).Count() == 2 &&
        result.Files.GroupBy(file => file.Folder).All(group => group.Count() == 2), "each program and its comment table share only their own folder key");
}
{
    var folder = Folder("locked-auto"); var program = Write(folder, "MAIN.csv", ProgramCsv);
    var comment = Write(folder, "comment.csv", CommentCsv);
    using var locked = new FileStream(comment, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
    var result = CsvFileSelection.ReadSelected(new[] { program });
    Check(result.Files.Count == 1 && result.Warnings.Any(w => w.Contains("comment.csv")), "unreadable automatic candidate warns and preserves selected program");
}
{
    var folder = Folder("locked-selected"); var program = Write(folder, "MAIN.csv", ProgramCsv);
    using var locked = new FileStream(program, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
    var threw = false;
    try { CsvFileSelection.ReadSelected(new[] { program }); } catch (IOException) { threw = true; }
    Check(threw, "unreadable explicitly selected file fails the whole selection");
}
{
    var folder = Folder("bad-encoding"); var program = Write(folder, "MAIN.csv", ProgramCsv);
    var bad = Path.Combine(folder, "comment.csv"); File.WriteAllBytes(bad, new byte[] { 0x81 });
    var automatic = CsvFileSelection.ReadSelected(new[] { program });
    Check(automatic.Files.Count == 1 && automatic.Warnings.Count == 1, "invalid automatic header warns");
    var selected = CsvFileSelection.ReadSelected(new[] { program, bad });
    Check(selected.Files.Count == 2 && Convert.FromBase64String(selected.Files.Single(file => file.Name == "comment.csv").Base64).SequenceEqual(new byte[] { 0x81 }), "invalid selected encoding remains available to normal CSV parser");
}
{
    var threw = false;
    try { CsvFileSelection.ReadSelected(Array.Empty<string>()); } catch (IOException) { threw = true; }
    Check(threw, "empty selection does not scan any folder");
}
{
    var folder = Folder("explicit-multiple"); var program = Write(folder, "MAIN.csv", ProgramCsv);
    var a = Write(folder, "chosen-a.csv", CommentCsv); var b = Write(folder, "chosen-b.csv", CommentCsv);
    Write(folder, "automatic.csv", CommentCsv);
    var result = CsvFileSelection.ReadSelected(new[] { program, a, b });
    Check(result.Files.Count == 3 && result.Files.All(file => file.Name != "automatic.csv") && result.Warnings.Count == 1, "multiple explicit comments warn and still exclude automatic tables");
}
{
    var folder = Folder("folder-recursive");
    var nested = Folder("folder-recursive/nested");
    Write(folder, "MAIN.csv", ProgramCsv); Write(nested, "MAIN.csv", ProgramCsv);
    Write(folder, "COMMENT.csv", CommentCsv); Write(nested, "COMMENT.csv", CommentCsv);
    const string ComparisonCsv = "\"行\"\t\"ステップ\"\t\"照合元\"\t\"ステップ\"\t\"照合先\"\t\"比較結果\"\n\"1\"\t\"0\"\t\"OUT M0\"\t\"0\"\t\"OUT M0\"\t\"一致\"\n";
    Write(nested, "COMPARISON.CSV", ComparisonCsv); Write(folder, "ignored.txt", ProgramCsv);
    var result = CsvFileSelection.ReadFolder(folder);
    Check(result.Files.Count == 5 && result.Files.Select(file => file.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() == 5,
        "folder selection includes nested CSVs and keeps duplicate names distinct");
    Check(result.Files.All(file => !Path.IsPathRooted(file.Name)) && result.Files.Count(file => file.Name.EndsWith("MAIN.csv", StringComparison.OrdinalIgnoreCase)) == 2,
        "folder display names use the existing relative-name policy");
    Check(Convert.FromBase64String(result.Files.Single(file => file.Name == "COMPARISON.CSV").Base64).SequenceEqual(Encoding.UTF8.GetBytes(ComparisonCsv)),
        "folder selection preserves comparison CSV bytes");
    Check(result.Files.Count(file => file.Name.EndsWith("COMMENT.csv", StringComparison.OrdinalIgnoreCase)) == 2 && result.Warnings.Count == 0,
        "folder selection retains separate comment tables without cross-folder warnings");
}
{
    var folder = Folder("folder-empty"); Write(folder, "ignored.txt", ProgramCsv);
    var threw = false;
    try { CsvFileSelection.ReadFolder(folder); } catch (IOException error) { threw = error.Message.Contains("CSV"); }
    Check(threw, "folder without CSVs reports a clear error");
}
{
    var folder = Folder("folder-locked"); var program = Write(folder, "LOCKED.csv", ProgramCsv);
    using var locked = new FileStream(program, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
    var threw = false;
    try { CsvFileSelection.ReadFolder(folder); } catch (IOException error) { threw = error.Message.Contains("LOCKED.csv"); }
    Check(threw, "folder selection does not silently omit unreadable CSVs");
}
{
    var folder = Folder("folder-reparse-" + Guid.NewGuid().ToString("N"));
    var target = Folder("folder-link-target-" + Guid.NewGuid().ToString("N"));
    Write(folder, "MAIN.csv", ProgramCsv);
    var external = Write(target, "LINK_ONLY.csv", ProgramCsv);
    var directoryLink = Path.Combine(folder, "linked-folder");
    var linksCreated = false;
    try
    {
        File.CreateSymbolicLink(Path.Combine(folder, "linked.csv"), external);
        Directory.CreateSymbolicLink(directoryLink, target);
        linksCreated = true;
    }
    catch (Exception error) when ((error is UnauthorizedAccessException or PlatformNotSupportedException) ||
                                 (error is IOException && (error.HResult & 0xffff) == 1314))
    {
        skipped++;
        Console.WriteLine("SKIP reparse fixture group: symbolic-link creation is unavailable. " + error.Message);
    }
    if (linksCreated)
    {
        var result = CsvFileSelection.ReadFolder(folder);
        Check(result.Files.Count == 1 && result.Files[0].Name == "MAIN.csv", "folder selection skips reparse files and directories");
        var threw = false;
        try { CsvFileSelection.ReadFolder(directoryLink); } catch (IOException) { threw = true; }
        Check(threw, "a selected reparse folder is rejected instead of traversed");
    }
}
{
    var a = Folder("multi-folder-a"); var b = Folder("multi-folder-b");
    Write(a, "FIRST.csv", ProgramCsv); Write(a, "comment.csv", CommentCsv);
    Write(b, "SECOND.csv", ProgramCsv); Write(b, "comment.csv", CommentCsv);
    var result = CsvFileSelection.ReadFolders(new[] { a, b, a });
    Check(result.Files.Count == 4 && result.Files.GroupBy(file => file.Folder).Count() == 2,
        "multiple selected folders retain separate comment identities and deduplicate files");
    Check(result.Files.GroupBy(file => file.Folder).All(group => group.Count() == 2),
        "unique program display names still carry the same folder key as their comment.csv");
}
{
    var a = Folder("sent files"); var b = Folder("sent folder");
    var first = Write(a, "FIRST.csv", ProgramCsv);
    Write(a, "comment.csv", CommentCsv); Write(b, "SECOND.csv", ProgramCsv); Write(b, "comment.csv", CommentCsv);
    var result = CsvFileSelection.ReadPaths(new[] { first, b, first });
    Check(result.Files.Count == 4 && result.Files.GroupBy(file => file.Folder).Count() == 2,
        "Send To accepts mixed CSV and folder paths and retains matching comments");
    var threw = false;
    try { CsvFileSelection.ReadPaths(new[] { Write(a, "ignored.txt", "synthetic") }); } catch (IOException) { threw = true; }
    Check(threw, "Send To rejects non-CSV file arguments");
}
if (OperatingSystem.IsWindows())
{
    var folder = Folder("synthetic send-to");
    var first = Write(Folder("synthetic app 日本語 U0001f680"), "LadderViewer.exe", "synthetic executable path only");
    var second = Write(Folder("moved synthetic app"), "LadderViewer.exe", "synthetic executable path only");
    string Target(string path, out string arguments)
    {
        object shortcut = new SendToShortcut.ShellLink();
        try
        {
            ((System.Runtime.InteropServices.ComTypes.IPersistFile)shortcut).Load(path, 0);
            var link = (SendToShortcut.IShellLinkW)shortcut;
            var target = new StringBuilder(32768);
            link.GetPath(target, target.Capacity, IntPtr.Zero, 4);
            var args = new StringBuilder(32768);
            link.GetArguments(args, args.Capacity);
            arguments = args.ToString();
            return target.ToString();
        }
        finally { System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shortcut); }
    }
    SendToShortcut.Create(first, folder);
    var path = Path.Combine(folder, "Ladder Viewer.lnk");
    Check(string.Equals(Target(path, out var arguments), first, StringComparison.OrdinalIgnoreCase) && arguments == "",
        "Send To shortcut preserves Unicode EXE paths without fixed input arguments");
    SendToShortcut.Create(second, folder);
    Check(string.Equals(Target(path, out _), second, StringComparison.OrdinalIgnoreCase) && Directory.GetFiles(folder, "*.lnk").Length == 1,
        "Send To registration updates the existing shortcut after moving the EXE");
}
{
    var folder = Folder("comma-comment-table");
    var program = Write(folder, "MAIN.csv", ProgramCsv);
    Write(folder, "comment.csv", "デバイス名,Japanese/日本語\nM0,架空コメント\n");
    var result = CsvFileSelection.ReadSelected(new[] { program });
    Check(result.Files.Count == 2 && result.Warnings.Count == 0, "comma-separated comment.csv is automatically detected beside the program");
}
{
    var folder = Folder("keyence-selected");
    var mnm = Write(folder, "Synthetic.MnM", "DEVICE:99\n;MODULE:Synthetic\nLD CR1234\nOUT MR20\nEND\nENDH\n", new UnicodeEncoding(false, true));
    Write(folder, "comment.csv", CommentCsv);
    var result = CsvFileSelection.ReadSelected(new[] { mnm });
    Check(result.Files.Count == 1 && result.Files[0].Name == "Synthetic.MnM",
        "selecting MNM alone does not auto-load a Mitsubishi comment.csv");
    Check(Convert.FromBase64String(result.Files[0].Base64).SequenceEqual(File.ReadAllBytes(mnm)),
        "MNM bytes reach the dedicated parser unchanged");
    var csv = Write(folder, "Synthetic.csv", ProgramCsv);
    var mixed = CsvFileSelection.ReadPaths(new[] { mnm, csv });
    Check(mixed.Files.Count == 3, "mixed CSV and MNM selection retains both programs and CSV comments");
    var nested = Folder("keyence-folder/nested");
    Write(nested, "Synthetic.MNM", "DEVICE:99\nEND\nENDH\n");
    Check(CsvFileSelection.ReadFolder(Path.GetDirectoryName(nested)!).Files.Count == 1,
        "folder reading includes uppercase MNM files in subfolders");
}
{
    const string KeyenceComments = ",,コメント1,コメント2\nMR20,,架空のキーエンスコメント,\n";
    const string KeyenceProgram = "DEVICE:99\n;MODULE:Synthetic\nLD CR1234\nOUT MR20\nEND\nENDH\n";
    var a = Folder("keyence-comments-a"); var b = Folder("keyence-comments-b");
    var first = Write(a, "Synthetic.MnM", KeyenceProgram, new UnicodeEncoding(false, true));
    var second = Write(b, "Synthetic.MNM", KeyenceProgram);
    var commentA = Write(a, "CoMmEnT.CsV", KeyenceComments, new UnicodeEncoding(false, true));
    Write(b, "comment.csv", KeyenceComments);
    var single = CsvFileSelection.ReadSelected(new[] { first });
    Check(single.Files.Count == 2 && single.Files.Any(file => file.Name == "CoMmEnT.CsV"),
        "MNM automatically loads the same-folder Keyence comment.csv by its header");
    Check(Convert.FromBase64String(single.Files.Single(file => file.Name == "CoMmEnT.CsV").Base64).SequenceEqual(File.ReadAllBytes(commentA)),
        "automatic Keyence comment bytes retain Unicode encoding unchanged");
    var multiple = CsvFileSelection.ReadSelected(new[] { first, second });
    Check(multiple.Files.Count == 4 && multiple.Files.GroupBy(file => file.Folder).All(group => group.Count() == 2) && multiple.Warnings.Count == 0,
        "MNM files in multiple folders retain only their own Keyence comment tables");
    var program = Write(a, "Synthetic.csv", ProgramCsv);
    var csvOnly = CsvFileSelection.ReadSelected(new[] { program });
    Check(csvOnly.Files.Count == 1, "CSV does not automatically load a Keyence comment.csv");
    var mixed = CsvFileSelection.ReadSelected(new[] { first, program });
    Check(mixed.Files.Count == 3 && mixed.Warnings.Count == 0,
        "mixed programs choose an automatic comment table by manufacturer header");
}
{
    const string KeyenceComments = ",,コメント1,コメント2\nMR20,,架空のコメント,\n";
    var a = Folder("cross-format-explicit-mnm");
    var mnm = Write(a, "Synthetic.mnm", "DEVICE:99\nEND\nENDH\n");
    var explicitMitsubishi = Write(a, "chosen-mitsubishi.csv", CommentCsv);
    Write(a, "comment.csv", KeyenceComments);
    var mnmResult = CsvFileSelection.ReadSelected(new[] { mnm, explicitMitsubishi });
    Check(mnmResult.Files.Count == 3 && mnmResult.Warnings.Count == 0,
        "explicit Mitsubishi comments do not suppress automatic Keyence comments for MNM");
    var b = Folder("cross-format-explicit-csv");
    var csv = Write(b, "Synthetic.csv", ProgramCsv);
    var explicitKeyence = Write(b, "chosen-keyence.csv", KeyenceComments);
    Write(b, "comment.csv", CommentCsv);
    var csvResult = CsvFileSelection.ReadSelected(new[] { csv, explicitKeyence });
    Check(csvResult.Files.Count == 3 && csvResult.Warnings.Count == 0,
        "explicit Keyence comments do not suppress automatic Mitsubishi comments for CSV");
}
{
    var folder = Folder("relative-program-identities");
    var nested = Path.Combine(folder, "axis"); Directory.CreateDirectory(nested);
    Write(nested, "MAIN.csv", ProgramCsv); Write(nested, "comment.csv", CommentCsv);
    var files = CsvFileSelection.ReadFolder(folder).Files;
    Check(files.Single(file => file.Name.EndsWith("MAIN.csv")).RelativePath == "axis/MAIN.csv", "folder comparison retains relative program identity without changing display name");
    Check(files.All(file => file.RelativePath is { } relative && !Path.IsPathRooted(relative) && !relative.Contains(folder)), "relative identities do not expose absolute input folders");
    Check(CsvFileSelection.ReadSelected(new[] { Path.Combine(nested, "MAIN.csv") }).Files.All(file => file.RelativePath is null), "individual file selection remains independent from folder identities");
}
{
    var folderA = Folder("ignored-sidecars-a");
    var folderB = Folder("ignored-sidecars-b");
    const string mnm = "DEVICE:99\\n;MODULE:Synthetic\\nLD MR1\\nFB Simple DM1\\nEND\\n";
    var a = Write(folderA, "Synthetic.mnm", mnm);
    var b = Write(folderB, "Synthetic.mnm", mnm);
    var html = Write(folderA, "Synthetic.html", "not an input file");
    Write(folderB, "Synthetic.html", "not an input file either");
    Write(folderA, "Synthetic.htm", "ignored");
    Write(folderA, "Synthetic.png", "ignored");
    Write(folderA, "Synthetic.pdf", "ignored");
    using var lockedHtml = File.Open(html, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
    var one = CsvFileSelection.ReadSelected(new[] { a });
    Check(one.Files.Count == 1 && one.Warnings.Count == 0, "MNM selection never opens the locked same-name HTML");
    var both = CsvFileSelection.ReadPaths(new[] { folderA, folderB });
    Check(both.Files.Count == 2 && both.Warnings.Count == 0 && both.Files.All(f => f.Name.EndsWith(".mnm")), "folder loading ignores HTML, images and other supplemental files");
    var plain = Write(folderB, "Plain.mnm", mnm);
    Check(CsvFileSelection.ReadSelected(new[] { plain }).Files.Count == 1, "MNM works without any supplemental files");
    var csv = Write(folderA, "Synthetic.csv", ProgramCsv);
    Check(CsvFileSelection.ReadSelected(new[] { csv }).Warnings.Count == 0, "Mitsubishi CSV ignores the locked HTML too");
    Check(!JsonSerializer.Serialize(one).Contains("referenceHtml", StringComparison.OrdinalIgnoreCase), "native payload contains no reference HTML");
}
{
    var limitsRoot = Folder("input-limits");
    string LimitFolder(string name) { var path = Path.Combine(limitsRoot, name); Directory.CreateDirectory(path); return path; }
    string SizedFile(string folder, string name, long length)
    {
        var path = Path.Combine(folder, name);
        using var stream = File.Create(path);
        stream.SetLength(length);
        return path;
    }
    void RejectLimit(Action read, string name, params string[] expected)
    {
        try { read(); throw new Exception("Input limit was not enforced: " + name); }
        catch (IOException error) { Check(error.Message.Contains("上限") && expected.All(error.Message.Contains), name); }
    }
    try
    {
        var countFolder = LimitFolder("count");
        for (var i = 0; i <= CsvFileSelection.MaximumFileCount; i++) Write(countFolder, $"synthetic-{i:D4}.csv", "");
        RejectLimit(() => CsvFileSelection.ReadFolder(countFolder), "file count is bounded during folder enumeration", "件", "1,001");

        var fileFolder = LimitFolder("one-file");
        var lockedPath = Write(fileFolder, "first.csv", ProgramCsv);
        var oversized = SizedFile(fileFolder, "oversized.csv", CsvFileSelection.MaximumFileBytes + 1024 * 1024);
        using (var locked = File.Open(lockedPath, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
            RejectLimit(() => CsvFileSelection.ReadSelected(new[] { lockedPath, oversized }), "all selected sizes checked before opening any content", "oversized.csv", "17.0", "16");

        var totalA = LimitFolder("total-a");
        var totalB = LimitFolder("total-b");
        var each = CsvFileSelection.MaximumTotalBytes / 5 + 1;
        for (var i = 0; i < 5; i++) SizedFile(i < 3 ? totalA : totalB, $"synthetic-{i}.csv", each);
        RejectLimit(() => CsvFileSelection.ReadPaths(new[] { totalA, totalB }), "total byte budget covers multiple selected folders", "MB", "64");

        var autoFolder = LimitFolder("automatic");
        var main = Write(autoFolder, "main.csv", ProgramCsv);
        SizedFile(autoFolder, "comment.csv", CsvFileSelection.MaximumFileBytes + 1024 * 1024);
        RejectLimit(() => CsvFileSelection.ReadSelected(new[] { main }), "automatic comment limits are errors rather than warnings", "comment.csv", "16");

        var duplicateFolder = LimitFolder("duplicates");
        var duplicate = Write(duplicateFolder, "same.csv", ProgramCsv);
        Check(CsvFileSelection.ReadSelected(Enumerable.Repeat(duplicate, CsvFileSelection.MaximumFileCount + 1)).Files.Count == 1,
            "duplicate selected paths count only once");
    }
    finally { Directory.Delete(limitsRoot, recursive: true); }
}
Console.WriteLine($"TOTAL {passed} checks passed; {skipped} reparse fixture group(s) skipped. All fixtures are synthetic.");
