using System.Runtime.InteropServices;

namespace LadderViewer;

[System.Runtime.Versioning.SupportedOSPlatform("windows")]
internal static class SendToShortcut
{
    public static void Create(string executable, string folder)
    {
        Directory.CreateDirectory(folder);
        var shellType = Type.GetTypeFromProgID("WScript.Shell")
            ?? throw new InvalidOperationException("Windowsのショートカット作成機能を利用できません。");
        object? shell = null, shortcut = null;
        try
        {
            shell = Activator.CreateInstance(shellType)!;
            shortcut = ((dynamic)shell).CreateShortcut(Path.Combine(folder, "Ladder Viewer.lnk"));
            dynamic link = shortcut;
            link.TargetPath = Path.GetFullPath(executable);
            link.WorkingDirectory = Path.GetDirectoryName(Path.GetFullPath(executable));
            link.Arguments = "";
            link.IconLocation = Path.GetFullPath(executable) + ",0";
            link.Description = "Ladder Viewerで開く";
            link.Save();
        }
        finally
        {
            if (shortcut is not null) Marshal.FinalReleaseComObject(shortcut);
            if (shell is not null) Marshal.FinalReleaseComObject(shell);
        }
    }
}
