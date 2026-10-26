using System.Text;
using LadderViewer;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
var root = Path.Combine(AppContext.BaseDirectory, "fake-input", Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
const string ProgramCsv = "\"ステップ番号\"\t\"命令\"\t\"I/O(デバイス)\"\n\"0\"\t\"OUT\"\t\"M0\"\n";
const string CommentCsv = "\"test\"\n\"デバイス名\"\t\"Japanese/日本語\"\n\"M0\"\t\"架空の運転コメント\"\n";
var passed = 0;
var skipped = 0;
void Check(bool condition, string name) { if (!condition) throw new Exception(name); Console.WriteLine("PASS " + name); passed++; }
string Folder(string name) { var path = Path.Combine(root, name); Directory.CreateDirectory(path); return path; }
string Write(string folder, string name, string text, Encoding? encoding = null) { var path = Path.Combine(folder, name); File.WriteAllText(path, text, encoding ?? new UTF8Encoding(false)); return path; }

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
Console.WriteLine($"TOTAL {passed} checks passed; {skipped} reparse fixture group(s) skipped. All fixtures are synthetic.");