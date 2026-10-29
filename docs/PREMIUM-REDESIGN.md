# Bazaar Bluff visual redesign

Requested: a substantial premium visual upgrade, more realistic and engaging battlefield, stronger animation, preserving existing game behavior.

The newly supplied Bazaar of a Thousand Dawns DOCX defines a different market-production game. Clarification has been requested; work independent of the answer proceeds on the shared visual direction only. Do not alter proposal, voting, deployment, scoring, team access, event identities or persistent event state without a clear instruction to replace the game.

Visual system: cinematic indigo/plum fantasy bazaar, antique brass and desert teal, photorealistic original hero still life, high-detail illustrated aerial terrain, tactile paper/metal surfaces, stronger type hierarchy and generous spacing. Five landmark hotspots retain the current battlefield names and point values. Hover, focus and tap reveal descriptive territory information. A larger map view provides an immersive inspection mode. Local motion preference, operating-system reduced-motion support and finite composited entrances keep gameplay fast. Map routes draw on entrance; brief selected-marker emphasis; animations never delay input.

Files: public/artwork for generated local bitmap assets, public/premium.css for visual system overrides, public/app.js for hero/map rendering and non-game interaction handlers, visual-check.mjs for desktop/mobile/keyboard/motion tests. Existing backend remains unchanged. Verify core game tests, current browser flows, five territory interactions, fullscreen map close, motion preference, images loading, and 360px layout. Preserve a pre-redesign source copy in docs/redesign-backup.

## Modern typography revision

Replaced decorative serif headings and old-style numerals with the locally hosted DM Sans family. Headings use upright medium/semibold weights; scores, counts, ranks and timers use lining/tabular numerals. Removed italic hero styling and ornamental number treatment, shortened promotional copy into practical game instructions, and simplified territory descriptions. Artwork, palette, game rules and server state are preserved. `public/typography.css` defines the final typography hierarchy. Browser verification confirms upright sans-serif headings, tabular stats/timers/ranks, and no horizontal overflow at 360/390/768px. Screenshots: modern-type-desktop.png and modern-type-mobile.png.

## Oasis ’26 poster theme

The generated hero bitmap (`bazaar-hero.webp`) was retired in favour of the official event poster’s look; the painted map (`five-realms.webp`) was kept at the organisers’ request. `public/oasis.css` loads last and defines the theme: royal violet night gradient with `stars.svg`, gold-framed surfaces, cream Amarante display lettering (OFL, `public/fonts/amarante.woff2`) and `skyline.svg` at the foot of each page. The overview hero draws the poster’s three cards (Bluffs, Deals, More!) as inline SVG, and every “Bazaar Bluff” title uses `public/bazaar-bluff-title.svg`, the poster’s lettering traced to vector (the poster font itself is unidentified, so other headings use Amarante). Filler copy (footer tagline, map captions, repeated date line, round explainer) was removed.
