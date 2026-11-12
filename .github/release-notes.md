## Download
- [Windows x64 ZIP]({{DOWNLOAD_URL}})
- [SHA-256 checksum]({{CHECKSUM_URL}})

## Getting started
Extract the ZIP file, then run `LadderViewer.exe`.

Requirements: Windows x64, .NET 10 Desktop Runtime and Microsoft Edge WebView2 Runtime.

## Changes
### Improved
- Virtualize circuit navigation and use shared binary viewport lookup, verified with synthetic 5,000-circuit programs.
- Remember shared comment and long-circuit display preferences, plus window position, size and maximized state. Recover safely from off-screen saved positions.
- Reuse completely extracted web assets and remove inactive cached versions while protecting running viewers.
- Share text decoding and comment CSV detection rules, including quoted commas and tabs.
- Prevent F5 from discarding loaded programs, apply a Content Security Policy, and distinguish dismissible warnings from errors.
- Debounce search input and preserve circuit position when comments or comparison sides change.
- Enable stricter indexed-access checks and add runtime validation for required values.
- Add portable synthetic UI regression tests to CI, centralize version metadata, and update documentation.
- Remove the completed improvement-goals document and its TODO link.

<!-- virustotal:start -->
{{VIRUSTOTAL_CONTENT}}
<!-- virustotal:end -->
