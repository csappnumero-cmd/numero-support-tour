Replace these files in the current website project:
- index6.html
- tour-audio.js
- build-version.txt

Fixes in this build:
- Removed the delayed 80 ms speechSynthesis.cancel() race that stopped index6's first MP3 without firing its completion event.
- index6 now starts immediately even when the URL contains ?dev=1.
- Fixed-audio playback now has startup/stall/error safety so a broken audio file cannot freeze the presentation forever.
- Pause/resume keeps the active MP3 position and the pause/play icon remains synchronized with the state.
- build-version was bumped to force the existing cache refresh.
