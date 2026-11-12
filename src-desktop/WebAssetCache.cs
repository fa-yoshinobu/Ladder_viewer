using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace LadderViewer;

internal sealed class WebAssetCache(string assetsPath, FileStream lease) : IDisposable
{
    public string AssetsPath { get; } = assetsPath;
    public void Dispose() => lease.Dispose();

    public static WebAssetCache Open(Stream archive, string cacheRoot, bool preserveUnleasedVersions = false)
    {
        var root = Path.GetFullPath(cacheRoot);
        var digest = Convert.ToHexString(SHA256.HashData(archive));
        archive.Position = 0;
        // Serialize extraction and cleanup across versions and simultaneous starts.
        var rootKey = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(root.ToUpperInvariant())));
        using var gate = new Mutex(false, "LadderViewer.AssetCache." + rootKey);
        try { gate.WaitOne(); } catch (AbandonedMutexException) { }
        try
        {
            var assets = Path.Combine(root, digest[..16]);
            Directory.CreateDirectory(assets);
            var currentLease = new FileStream(Path.Combine(assets, ".in-use"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.ReadWrite);
            try
            {
                var marker = Path.Combine(assets, ".complete");
                if (!File.Exists(marker) || File.ReadAllText(marker) != digest)
                {
                    ZipFile.ExtractToDirectory(archive, assets, overwriteFiles: true);
                    File.WriteAllText(marker, digest);
                }
                foreach (var old in Directory.EnumerateDirectories(root))
                {
                    if (string.Equals(old, assets, StringComparison.OrdinalIgnoreCase)
                        || !Regex.IsMatch(Path.GetFileName(old), "\\A[0-9A-Fa-f]{16}\\z")) continue;
                    try
                    {
                        if ((File.GetAttributes(old) & FileAttributes.ReparsePoint) != 0) continue;
                        // Older executables do not create leases. While another
                        // viewer is running, defer their cleanup to a later start.
                        if (preserveUnleasedVersions && !File.Exists(Path.Combine(old, ".in-use"))) continue;
                        // Existing shared leases reject this open. Share Delete permits
                        // removing our own lock while protecting the check/delete interval.
                        using var oldLease = new FileStream(Path.Combine(old, ".in-use"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.Delete);
                        Directory.Delete(old, recursive: true);
                    }
                    catch (IOException) { }
                    catch (UnauthorizedAccessException) { }
                }
                return new WebAssetCache(assets, currentLease);
            }
            catch { currentLease.Dispose(); throw; }
        }
        finally { gate.ReleaseMutex(); }
    }
}
