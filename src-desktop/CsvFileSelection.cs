using System.Text;
using System.Text.Json.Serialization;

namespace LadderViewer;

internal sealed record CsvFilePayload(string Name, string Base64, string Folder, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? RelativePath = null);
internal sealed record CsvSelectionResult(IReadOnlyList<CsvFilePayload> Files, IReadOnlyList<string> Warnings);

internal static class CsvFileSelection
{
    public const int MaximumFileCount = 1000;
    public const long MaximumFileBytes = 16 * 1024 * 1024;
    public const long MaximumTotalBytes = 64 * 1024 * 1024;

    private sealed class InputLimitException(string message) : IOException(message) { }

    private sealed class InputBudget
    {
        private readonly HashSet<string> paths = new(StringComparer.OrdinalIgnoreCase);
        private long plannedBytes;
        private long readBytes;

        public void Add(string path)
        {
            if (paths.Contains(path)) return;
            if (paths.Count + 1 > MaximumFileCount)
                throw new InputLimitException($"ファイル件数が上限を超えました: {paths.Count + 1:N0}件（上限 {MaximumFileCount:N0}件）。フォルダーを分けて選択してください。");
            var size = new FileInfo(path).Length;
            CheckFileSize(path, size);
            if (plannedBytes + size > MaximumTotalBytes)
                throw new InputLimitException($"ファイルの合計サイズが上限を超えました: {(plannedBytes + size) / 1048576d:N1} MB（上限 {MaximumTotalBytes / 1048576:N0} MB）。");
            paths.Add(path);
            plannedBytes += size;
        }

        public byte[] Read(string path)
        {
            using var input = File.OpenRead(path);
            CheckFileSize(path, input.Length);
            using var output = new MemoryStream((int)input.Length);
            var buffer = new byte[81920];
            int length;
            while ((length = input.Read(buffer)) > 0)
            {
                CheckFileSize(path, output.Length + length);
                if (readBytes + length > MaximumTotalBytes)
                    throw new InputLimitException($"読込み中に合計サイズが上限を超えました: {(readBytes + length) / 1048576d:N1} MB（上限 {MaximumTotalBytes / 1048576:N0} MB）。");
                output.Write(buffer, 0, length);
                readBytes += length;
            }
            return output.ToArray();
        }
    }

    private static void CheckFileSize(string path, long size)
    {
        if (size > MaximumFileBytes)
            throw new InputLimitException($"{Path.GetFileName(path)} のサイズが上限を超えました: {size / 1048576d:N1} MB（1ファイルの上限 {MaximumFileBytes / 1048576:N0} MB）。");
    }

    private static string[] CollectPaths(IEnumerable<string> paths, InputBudget? budget = null)
    {
        budget ??= new InputBudget();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var selected = new List<string>();
        foreach (var input in paths)
        {
            var path = Path.GetFullPath(input);
            if (!seen.Add(path)) continue;
            if (!IsProgramFile(path)) throw new IOException($"CSVまたはMNMファイルを選択してください: {Path.GetFileName(path)}");
            budget.Add(path);
            selected.Add(path);
        }
        return selected.ToArray();
    }

    internal enum CommentFormat { Mitsubishi, Keyence }

    static CsvFileSelection() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    public static CsvSelectionResult ReadFolder(string folderPath) => ReadFolders(new[] { folderPath });

    public static CsvSelectionResult ReadFolders(IEnumerable<string> folderPaths)
    {
        var roots = folderPaths.Select(Path.GetFullPath).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var files = CollectPaths(roots.SelectMany(FolderFiles));
        if (files.Length == 0) throw new IOException("選択したフォルダー内にCSV/MNMファイルがありません。");
        return ReadSelected(files, roots);
    }

    public static CsvSelectionResult ReadPaths(IEnumerable<string> paths)
    {
        var selected = paths.Select(Path.GetFullPath).ToArray();
        var roots = selected.Where(Directory.Exists).ToArray();
        return ReadSelected(selected.SelectMany(path => Directory.Exists(path) ? FolderFiles(path) : new[] { path }), roots);
    }

    private static IEnumerable<string> FolderFiles(string folderPath)
    {
        var folder = Path.TrimEndingDirectorySeparator(Path.GetFullPath(folderPath));
        if ((File.GetAttributes(folder) & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != FileAttributes.Directory)
            throw new IOException("リンクではないフォルダーを選択してください。");
        var options = new EnumerationOptions
        {
            RecurseSubdirectories = true,
            AttributesToSkip = FileAttributes.ReparsePoint,
            IgnoreInaccessible = false,
            ReturnSpecialDirectories = false
        };
        return CollectPaths(Directory.EnumerateFiles(folder, "*", options).Where(IsProgramFile))
            .OrderBy(path => Path.GetRelativePath(folder, path), StringComparer.OrdinalIgnoreCase)
            .ThenBy(path => path, StringComparer.Ordinal);
    }

    public static CsvSelectionResult ReadSelected(IEnumerable<string> selectedPaths, string[]? roots = null)
    {
        var budget = new InputBudget();
        var selected = CollectPaths(selectedPaths, budget);
        if (selected.Length == 0) throw new IOException("CSV/MNMファイルが選択されていません。");
        var loaded = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
        var explicitComments = new Dictionary<string, List<CommentFormat>>(StringComparer.OrdinalIgnoreCase);
        var requestedFormats = new Dictionary<string, HashSet<CommentFormat>>(StringComparer.OrdinalIgnoreCase);
        var selectedCommentFormats = new Dictionary<string, CommentFormat>(StringComparer.OrdinalIgnoreCase);
        var warnings = new List<string>();
        foreach (var path in selected)
        {
            if (!IsProgramFile(path)) throw new IOException($"CSVまたはMNMファイルを選択してください: {Path.GetFileName(path)}");
            try
            {
                var bytes = budget.Read(path);
                loaded.Add(path, bytes);
                CommentFormat? commentFormat = null;
                try
                {
                    if (IsCsv(path)) commentFormat = DetectCommentFormat(() => new MemoryStream(bytes));
                }
                catch (DecoderFallbackException)
                {
                    // Keep selected bytes unchanged so the appropriate parser can report that file's decoding error.
                }
                var folder = Path.GetDirectoryName(path)!;
                if (commentFormat is { } format)
                {
                    if (!explicitComments.TryGetValue(folder, out var formats))
                        explicitComments[folder] = formats = new List<CommentFormat>();
                    formats.Add(format);
                    selectedCommentFormats[path] = format;
                }
                else
                {
                    if (!requestedFormats.TryGetValue(folder, out var formats))
                        requestedFormats[folder] = formats = new HashSet<CommentFormat>();
                    formats.Add(IsCsv(path) ? CommentFormat.Mitsubishi : CommentFormat.Keyence);
                }
            }
            catch (Exception error) when (IsReadError(error))
            {
                throw new IOException($"{Path.GetFileName(path)} を読み込めませんでした。{error.Message}", error);
            }
        }

        foreach (var folder in selected.Select(path => Path.GetDirectoryName(path)!).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            // Explicit tables suppress automatic lookup only for their own manufacturer.
            var explicitFormats = explicitComments.GetValueOrDefault(folder) ?? new List<CommentFormat>();
            foreach (var group in explicitFormats.GroupBy(format => format))
            {
                if (group.Count() > 1 && !selectedCommentFormats.Any(pair => pair.Value == group.Key &&
                    string.Equals(Path.GetDirectoryName(pair.Key), folder, StringComparison.OrdinalIgnoreCase) &&
                    string.Equals(Path.GetFileName(pair.Key), "comment.csv", StringComparison.OrdinalIgnoreCase)))
                    warnings.Add("同じフォルダーで複数のコメントCSVが選択されています。重複するデバイスのコメントは読込み順で上書きされます。");
            }
            var automaticFormats = (requestedFormats.GetValueOrDefault(folder) ?? new HashSet<CommentFormat>())
                .Where(format => !explicitFormats.Contains(format)).ToHashSet();
            if (automaticFormats.Count == 0) continue;
            string[] candidates;
            try
            {
                candidates = Directory.EnumerateFiles(folder, "*", SearchOption.TopDirectoryOnly)
                    .Where(path => string.Equals(Path.GetFileName(path), "comment.csv", StringComparison.OrdinalIgnoreCase))
                    .Where(path => !loaded.ContainsKey(path))
                    .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase).ThenBy(path => path, StringComparer.Ordinal).ToArray();
            }
            catch (Exception error) when (IsReadError(error))
            {
                warnings.Add($"同じフォルダーのコメントCSVを確認できませんでした: {error.Message}");
                continue;
            }
            foreach (var path in candidates)
            {
                try
                {
                    if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) continue;
                    budget.Add(path);
                    var format = DetectCommentFormat(() => File.OpenRead(path));
                    if (format is null || !automaticFormats.Contains(format.Value)) continue;
                    loaded.Add(path, budget.Read(path));
                }
                catch (Exception error) when (IsReadError(error))
                {
                    warnings.Add($"自動読込み候補 {Path.GetFileName(path)} を読み込めませんでした: {error.Message}");
                }
            }
        }

        var names = DisplayNames(loaded.Keys);
        var folders = loaded.Keys.Select(path => Path.GetDirectoryName(path)!).Distinct(StringComparer.OrdinalIgnoreCase)
            .Select((folder, index) => (folder, key: index.ToString(System.Globalization.CultureInfo.InvariantCulture)))
            .ToDictionary(item => item.folder, item => item.key, StringComparer.OrdinalIgnoreCase);
        var files = loaded.Select(pair => new CsvFilePayload(names[pair.Key], Convert.ToBase64String(pair.Value), folders[Path.GetDirectoryName(pair.Key)!], RelativeName(pair.Key, roots))).ToArray();
        return new CsvSelectionResult(files, warnings);
    }

    private static string? RelativeName(string path, string[]? roots)
    {
        foreach (var root in (roots ?? []).OrderByDescending(root => root.Length))
        {
            var relative = Path.GetRelativePath(root, path);
            if (Path.IsPathRooted(relative) || relative == ".." || relative.StartsWith(".." + Path.DirectorySeparatorChar)) continue;
            return (roots!.Length > 1 ? Path.GetFileName(Path.TrimEndingDirectorySeparator(root)) + "/" : "") + relative.Replace('\\', '/');
        }
        return null;
    }

    private static bool IsProgramFile(string path) => IsCsv(path) || string.Equals(Path.GetExtension(path), ".mnm", StringComparison.OrdinalIgnoreCase);
    private static bool IsCsv(string path) => string.Equals(Path.GetExtension(path), ".csv", StringComparison.OrdinalIgnoreCase);
    private static bool IsReadError(Exception error) => error is not InputLimitException &&
        error is IOException or UnauthorizedAccessException or DecoderFallbackException or System.Security.SecurityException;

    internal static CommentFormat? DetectCommentFormat(Func<Stream> open)
    {
        try { return ReadCommentFormat(open, new UTF8Encoding(false, true)); }
        catch (DecoderFallbackException)
        {
            return ReadCommentFormat(open, Encoding.GetEncoding(932, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback));
        }
    }

    private static CommentFormat? ReadCommentFormat(Func<Stream> open, Encoding fallback)
    {
        using var stream = open();
        Span<byte> prefix = stackalloc byte[3];
        var read = stream.ReadAtLeast(prefix, 3, throwOnEndOfStream: false);
        var encoding = fallback;
        var skip = 0;
        if (read >= 2 && prefix[0] == 0xff && prefix[1] == 0xfe) { encoding = new UnicodeEncoding(false, true, true); skip = 2; }
        else if (read >= 2 && prefix[0] == 0xfe && prefix[1] == 0xff) { encoding = new UnicodeEncoding(true, true, true); skip = 2; }
        else if (read >= 3 && prefix[0] == 0xef && prefix[1] == 0xbb && prefix[2] == 0xbf) { encoding = new UTF8Encoding(false, true); skip = 3; }
        stream.Position = skip;
        using var reader = new StreamReader(stream, encoding, detectEncodingFromByteOrderMarks: false, bufferSize: 1024);
        var count = 0;
        while (count < 10 && reader.ReadLine() is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            count++;
            foreach (var delimiter in new[] { "\t", "," })
            {
                using var fields = new Microsoft.VisualBasic.FileIO.TextFieldParser(new StringReader(line));
                fields.SetDelimiters(delimiter);
                fields.HasFieldsEnclosedInQuotes = true;
                string[] columns;
                try { columns = fields.ReadFields() ?? []; }
                catch (Microsoft.VisualBasic.FileIO.MalformedLineException) { continue; }
                if (count == 1 && delimiter == "," && columns.Length > 2 && columns[0] == "" && columns[1] == "" && columns[2] == "コメント1") return CommentFormat.Keyence;
                if (columns.Length > 1 && columns[0] == "デバイス名" && !columns.Contains("命令")) return CommentFormat.Mitsubishi;
            }
        }
        return null;
    }

    private static Dictionary<string, string> DisplayNames(IEnumerable<string> paths)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var group in paths.GroupBy(path => Path.GetFileName(path), StringComparer.OrdinalIgnoreCase))
        {
            var values = group.ToArray();
            if (values.Length == 1) { result[values[0]] = group.Key; continue; }
            var segments = values.Select(path => path.Split(new[] { '\\', '/' }, StringSplitOptions.RemoveEmptyEntries)).ToArray();
            var depth = 2;
            string[] labels;
            do
            {
                labels = segments.Select(parts => string.Join('/', parts.TakeLast(depth))).ToArray();
                depth++;
            } while (labels.Distinct(StringComparer.OrdinalIgnoreCase).Count() != labels.Length);
            for (var i = 0; i < values.Length; i++) result[values[i]] = labels[i];
        }
        return result;
    }
}
