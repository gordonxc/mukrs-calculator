# MUKRS Calculator

An unofficial tool for estimating your [Mahjong UK Ranking System](https://ukmahjong.co.uk/index.php/the-mahjong-uk-ranking-system-mukrs/) (MUKRS) score.

## Features

- Add tournament results (score, days, name) manually or by pasting from the [MUKRS results table](https://ukma-mukrs.codeberg.page/)
- Calculates Part A (consistency), Part B (achievements), and final MUKRS
- Target calculator — find the score needed to reach a target MUKRS
- Compare Plans — side-by-side comparison of two upcoming tournament scenarios
- Position estimation from score (and vice versa)
- Share state via URL hash
- Import/export results as JSON
- Dark mode
- Works offline (PWA with service worker)

## Development

Just open `index.html` in a browser. No build step required.

```
index.html      — HTML structure
style.css       — all styles
app.js          — all logic
sw.js           — service worker for offline caching
manifest.json   — PWA manifest
```

## Deployment

Static site — deploy to any host (Vercel, Netlify, GitHub Pages, etc.).

```
vercel --prod
```

## License

MIT
