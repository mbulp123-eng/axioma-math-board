# MathJax 3.2.2 (vendored asset)

- Official source: https://github.com/mathjax/MathJax/blob/3.2.2/es5/tex-svg.js
- Upstream project: https://github.com/mathjax/MathJax
- License: Apache-2.0; full license is in LICENSE.
- Local bundle: tex-svg.js (2,108,581 bytes, including a terminal newline).
- SHA-256: 3980954338a97dc0c2bbf6d69e0ffb5f8bb3a5f81a06b337c888e7a6a2fb7151

This pinned combined TeX-to-SVG component includes the TeX, AMS and SVG
glyph-path data needed by the board. It does not need external font files.
The application must disable autoload/require and avoid loading optional
components in order to keep formula rendering offline and self-contained.

Reference documentation for this pinned version:
- https://docs.mathjax.org/en/v3.2/web/typeset.html
- https://docs.mathjax.org/en/v3.2/options/input/tex.html
- https://docs.mathjax.org/en/v3.2/options/output/svg.html
- https://docs.mathjax.org/en/v3.2/input/tex/extensions/ams.html

Version 4 is the current upstream series. Version 3.2.2 is deliberately pinned
here for the compact, self-contained combined SVG component; review upgrades
and the local input restrictions together.


Distribution uses 12 gzip parts and manifest.json to keep repository uploads bounded. formula.js reconstructs the local bundle with the browser DecompressionStream API and verifies the uncompressed SHA-256 before loading. No external CDN, fonts, eval, or user-provided script is loaded. The original tex-svg.js is a local build input, not required in the published repository. Regenerate with Python gzip.compress(source, mtime=0), splitting into 60000-byte parts. Browsers without DecompressionStream receive an explicit formula-only error.
