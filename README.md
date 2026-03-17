# Topic Bingo Club

A standalone bingo app for any topic, with:

- 5x5 digital bingo boards with a free center square
- web-assisted word suggestions plus always-available manual word entry
- single-player and password-protected multiplayer rooms
- a settings drawer for theme and background customization
- custom image backgrounds

## Run locally

```bash
cd /Users/rohunsavanur/Documents/Playground/topic-bingo-club
npm start
```

Then open [http://localhost:4315](http://localhost:4315).

## Notes

- Multiplayer room data is stored in `data/rooms.json`.
- Rooms expire automatically after 7 days of inactivity.
- The app tries web sources first for topic suggestions and falls back to manual word entry when needed.
