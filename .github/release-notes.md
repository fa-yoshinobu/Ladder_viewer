## Download
- [Windows x64 ZIP]({{DOWNLOAD_URL}})
- [SHA-256 checksum]({{CHECKSUM_URL}})

## Getting started
Extract the ZIP file, then run `LadderViewer.exe`.

Requirements: Windows x64, .NET 10 Desktop Runtime and Microsoft Edge WebView2 Runtime.

## Changes
### Fixed
- Remove unnecessary gaps above outputs and between wrapped pages while preserving branch connections.
- Align matching comparison branches without shifting unrelated contacts, comparison instructions or reset outputs.
- Preserve natural wire spans and difference colors when viewing either comparison side on its own.
- Improve KEYENCE instruction parsing, native symbols, operand placement and control boundaries.
- Use compact widths for short KEYENCE instructions and expand only fields that require more space.

### Maintenance
- Separate desktop source files from generated files; completed Windows builds are in `artifacts/release/`.
- Consolidate regression tests and use synthetic test data.

<!-- virustotal:start -->
{{VIRUSTOTAL_CONTENT}}
<!-- virustotal:end -->
