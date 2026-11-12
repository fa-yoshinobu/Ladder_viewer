using System.Drawing;
using System.Text.Json;

namespace LadderViewer;

internal sealed record WindowPlacement(int X, int Y, int Width, int Height, bool Maximized)
{
    public static WindowPlacement? Normalize(WindowPlacement? saved, IReadOnlyList<Rectangle> screens)
    {
        if (saved is null || saved.Width < 960 || saved.Height < 640) return null;
        foreach (var screen in screens)
        {
            if (!screen.Contains(saved.X, saved.Y) || screen.Width < 960 || screen.Height < 640) continue;
            var width = Math.Min(saved.Width, screen.Width);
            var height = Math.Min(saved.Height, screen.Height);
            return saved with { X = Math.Clamp(saved.X, screen.Left, screen.Right - width), Y = Math.Clamp(saved.Y, screen.Top, screen.Bottom - height), Width = width, Height = height };
        }
        return null;
    }

    public static WindowPlacement? Load(string path, IReadOnlyList<Rectangle> screens)
    {
        try { return Normalize(JsonSerializer.Deserialize<WindowPlacement>(File.ReadAllText(path)), screens); }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
        catch (JsonException) { return null; }
    }

    public static void Save(string path, WindowPlacement placement)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(placement));
            File.Move(path + ".tmp", path, overwrite: true);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}
