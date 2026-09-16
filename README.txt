Replace ONLY these files in the current website project:
- tour-runtime.js
- tour-audio.js
- index6.html
- index9.html
- index10.html
- index11.html
- build-version.txt

This build is based on the ZIP you uploaded, before the last failed patch.

Fixes:
- DEV -> Management Structure lands intentionally paused with ▶ so it cannot freeze on blocked first audio. One click starts the first line.
- Top pause buttons show ⏸ while playing and ▶ while paused via aria-state CSS, independent of text rewrites.
- Fixed MP3 playback has a safe end guard that only advances when the real MP3 reaches its end.
- Employee local system screenshot support is preserved.
- build-version is bumped for the existing automatic cache refresh.
