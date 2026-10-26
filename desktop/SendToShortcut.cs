using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace LadderViewer;

[System.Runtime.Versioning.SupportedOSPlatform("windows")]
internal static class SendToShortcut
{
    public static void Create(string executable, string folder)
    {
        Directory.CreateDirectory(folder);
        var target = Path.GetFullPath(executable);
        object shortcut = new ShellLink();
        try
        {
            // WScript.Shell rejects paths outside the system code page; use the Unicode shell interface.
            var link = (IShellLinkW)shortcut;
            link.SetPath(target);
            link.SetWorkingDirectory(Path.GetDirectoryName(target)!);
            link.SetArguments("");
            link.SetIconLocation(target, 0);
            link.SetDescription("Ladder Viewerで開く");
            ((IPersistFile)shortcut).Save(Path.GetFullPath(Path.Combine(folder, "Ladder Viewer.lnk")), true);
        }
        finally { Marshal.FinalReleaseComObject(shortcut); }
    }

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    internal class ShellLink { }

    // COM methods must retain the native IShellLinkW vtable order, including unused methods.
    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size, IntPtr findData, uint flags);
        void GetIDList(out IntPtr idList);
        void SetIDList(IntPtr idList);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int size);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string text);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string path);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int size);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string text);
        void GetHotkey(out short hotkey);
        void SetHotkey(short hotkey);
        void GetShowCmd(out int command);
        void SetShowCmd(int command);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size, out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
        void Resolve(IntPtr window, uint flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
    }
}
