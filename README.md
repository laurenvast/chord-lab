# Chord Lab

Plug in your piano and play. Chords scroll along a treble staff toward a blue band, one per bar, on a steady beat. Play each chord as it reaches the band. The app picks every next chord for you:

- **↺ again**: a chord you missed or were slow on comes back a few chords later, then less and less often as you get it right.
- **★ new**: when you're doing well, a new chord unlocks (major triads → minor → more keys → inversions → diminished/augmented → 7ths).
- **≈ similar**: when you're struggling, it stays close to what you just played.
- When you play the right chord, it says the name out loud ("E flat minor").
- Chord names disappear once you read a chord quickly 4 times in a row, so you're reading the notes.
- Tempo goes up every 6-chord combo and down after mistakes.

Progress is saved in the browser, so next time you start with your tricky chords.

## Run it

Use **Chrome or Edge** (Safari and Firefox can't talk to MIDI pianos).

1. Connect your digital piano to the computer with USB.
2. In this folder, start a small local server:

   ```bash
   python3 -m http.server 8765
   ```

3. Open http://localhost:8765 and allow MIDI access when Chrome asks.
4. Play any note to start.

Opening `index.html` directly also usually works in Chrome. If the piano isn't detected that way, use the server.

No piano? The computer keyboard works too: `A W S E D F T G Y H U J K` play C up to C, and `Z` / `X` shift the octave.

## Controls

- **Wait for me** (on by default): the music pauses at each chord until you play it. Turn it off to keep the beat going no matter what.
- **Stop**: shows a check-in with your stats, what's new, what's solid and what's still tricky. It also appears every 5 minutes.
- **Settings**: beat sound on/off, say chord names on/off, always show chord names, reset progress.

## Files

- `js/music.js`: chord spelling and voicing
- `js/coach.js`: the levels and the next-chord picker
- `js/staff.js`: the scrolling SVG staff
- `js/game.js`: clock, judging, tempo, check-ins, saving
- `js/input.js`, `js/keyboard.js`, `js/audio.js`: piano input, on-screen keys, beat click
