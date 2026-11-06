## Download
- [Windows x64 ZIP]({{DOWNLOAD_URL}})
- [SHA-256 checksum]({{CHECKSUM_URL}})

## Getting started
Extract the ZIP file, then run `LadderViewer.exe`.

Requirements: Windows x64, .NET 10 Desktop Runtime and Microsoft Edge WebView2 Runtime.

## Changes
### Added
- Expand and collapse legacy KEYENCE scripts using the [+] and [-] controls when the MNM contains both the original source and compiled instructions.
- Mark expanded script ranges with a subtle purple background, outline and ST label.
- Synchronize expansion for matching scripts in comparisons and reveal compiled instructions when navigating search results.

### Fixed
- Preserve source text, copy behavior and differences while scripts are collapsed, including differences in compiled instructions.
- Render KEYENCE LOGD and LOGE with their native symbols and show MCALL arguments in separate columns.
- Resolve macro parameter labels from unambiguous definitions in the same folder and align comparison symbols with different heights.

### Maintenance
- Add regression coverage using independently created dummy programs.

<!-- virustotal:start -->
{{VIRUSTOTAL_CONTENT}}
<!-- virustotal:end -->
