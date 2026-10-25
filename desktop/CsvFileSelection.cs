using System.Text;

namespace LadderViewer;

internal sealed record CsvFilePayload(string Name, string Base64);
internal sealed record CsvSelectionResult(IReadOnlyList<CsvFilePayload> Files, IReadOnlyList<string> Warnings);

internal static class CsvFileSelection
{
    static CsvFileSelection() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    public static CsvSelectionResult ReadFolder(string folderPath)
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
        var files = Directory.EnumerateFiles(folder, "*", options).Where(IsCsv)
            .OrderBy(path => Path.GetRelativePath(folder, path), StringComparer.OrdinalIgnoreCase)
            .ThenBy(path => path, StringComparer.Ordinal).ToArray();
        if (files.Length == 0) throw new IOException("選択したフォルダー内にCSVファイルがありません。");
        return ReadSelected(files);
    }

    public static CsvSelectionResult ReadSelected(IEnumerable<string> selectedPaths)
    {
        var selected = selectedPaths.Select(Path.GetFullPath).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (selected.Length == 0) throw new IOException("CSVファイルが選択されていません。");
        var loaded = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
        var explicitComments = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var warnings = new List<string>();
        foreach (var path in selected)
        {
            if (!IsCsv(path)) throw new IOException($"CSVファイルを選択してください: {Path.GetFileName(path)}");
            try
            {
                var bytes = File.ReadAllBytes(path);
                loaded.Add(path, bytes);
                try
                {
                    if (IsCommentCsv(() => new MemoryStream(bytes)))
                    {
                        var folder = Path.GetDirectoryName(path)!;
                        explicitComments[folder] = explicitComments.GetValueOrDefault(folder) + 1;
                    }
                }
                catch (DecoderFallbackException)
                {
                    // Keep selected bytes unchanged so the normal CSV parser can report that file's decoding error.
                }
            }
            catch (Exception error) when (IsReadError(error))
            {
                throw new IOException($"{Path.GetFileName(path)} を読み込めませんでした。{error.Message}", error);
            }
        }

        var commentFolders = new HashSet<string>(explicitComments.Keys, StringComparer.OrdinalIgnoreCase);
        foreach (var folder in selected.Select(path => Path.GetDirectoryName(path)!).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            // An explicitly chosen comment table takes precedence over every automatic table in that folder.
            if (explicitComments.TryGetValue(folder, out var explicitCount))
            {
                if (explicitCount > 1)
                    warnings.Add("同じフォルダーで複数のコメントCSVが選択されています。重複するデバイスのコメントは読込み順で上書きされます。");
                continue;
            }
            string[] candidates;
            try
            {
                candidates = Directory.EnumerateFiles(folder, "*", SearchOption.TopDirectoryOnly)
                    .Where(IsCsv).Where(path => !loaded.ContainsKey(path))
                    .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase).ThenBy(path => path, StringComparer.Ordinal).ToArray();
            }
            catch (Exception error) when (IsReadError(error))
            {
                warnings.Add($"同じフォルダーのコメントCSVを確認できませんでした: {error.Message}");
                continue;
            }
            var comments = new List<string>();
            foreach (var path in candidates)
            {
                try
                {
                    if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) continue;
                    if (!IsCommentCsv(() => File.OpenRead(path))) continue;
                    loaded.Add(path, File.ReadAllBytes(path));
                    comments.Add(Path.GetFileName(path));
                }
                catch (Exception error) when (IsReadError(error))
                {
                    warnings.Add($"自動読込み候補 {Path.GetFileName(path)} を読み込めませんでした: {error.Message}");
                }
            }
            if (comments.Count > 0) commentFolders.Add(folder);
            if (comments.Count > 1)
                warnings.Add($"同じフォルダーにコメントCSVが複数あります（{string.Join("、", comments)}）。重複するデバイスのコメントは読込み順で上書きされます。");
        }

        if (commentFolders.Count > 1)
            warnings.Add("複数フォルダーのコメントCSVを共通のコメント表へ読み込みます。重複するデバイスのコメントが異なる場合は、フォルダーごとに開いてください。");
        var names = DisplayNames(loaded.Keys);
        var files = loaded.Select(pair => new CsvFilePayload(names[pair.Key], Convert.ToBase64String(pair.Value))).ToArray();
        return new CsvSelectionResult(files, warnings);
    }

    private static bool IsCsv(string path) => string.Equals(Path.GetExtension(path), ".csv", StringComparison.OrdinalIgnoreCase);
    private static bool IsReadError(Exception error) => error is IOException or UnauthorizedAccessException or DecoderFallbackException or System.Security.SecurityException;

    private static bool IsCommentCsv(Func<Stream> open)
    {
        try { return HasCommentHeader(open, new UTF8Encoding(false, true)); }
        catch (DecoderFallbackException)
        {
            return HasCommentHeader(open, Encoding.GetEncoding(932, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback));
        }
    }

    private static bool HasCommentHeader(Func<Stream> open, Encoding fallback)
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
            var columns = line.Split('\t').Select(column => column.Trim().Trim('"').Replace("\"\"", "\"")).ToArray();
            if (columns.Length > 1 && columns[0] == "デバイス名" && !columns.Contains("命令")) return true;
        }
        return false;
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