## Download
- [Windows x64 ZIP]({{DOWNLOAD_URL}})
- [SHA-256 checksum]({{CHECKSUM_URL}})

## Getting started
Extract the ZIP file, then run `LadderViewer.exe`.

Requirements: Windows x64, .NET 10 Desktop Runtime and Microsoft Edge WebView2 Runtime.

## Changes

### Changed

- Reduce time to first display for large ladder files. In the running Windows app, synthetic files with 5,000 contact-and-coil circuits took 31.7% less time to display for Mitsubishi and 75.9% less for KEYENCE compared with v0.6.9.
- Render the comparison sidebar on demand. Scrolling to 24 positions in a 2,000-circuit comparison took 21.3% less time. [Benchmark and screen comparison results](https://github.com/fa-yoshinobu/Ladder_viewer/blob/v0.6.10/docs/PERFORMANCE.md)

### Fixed

- Keep later circuits visible when a circuit cannot be parsed or laid out and its boundaries are known. The viewer shows the affected source with a warning and marks it as unparseable in direct comparisons.

<!-- virustotal:start -->
{{VIRUSTOTAL_CONTENT}}
<!-- virustotal:end -->
