# Bazaar Bluff: chosen setup

## Video review
Both supplied videos were inspected at multiple points across their full durations. The first shows a purple student dashboard, component catalogues, and cinematic heroes; the component catalogue matches 21st.dev's component categories. The second visibly names Motion Primitives, Haikei and Realtime Colors. Only clearly identifiable tools are listed here; the videos' claims of “free” are not a blanket licence for every library item.

- https://21st.dev/: use as a source of layout/component references; check the licence of each selected component before copying. No template or third-party component code has been copied into this build.
- https://motion-primitives.com/docs: open-source motion components based on Motion and Tailwind. The current vanilla JavaScript app uses original, short CSS transitions instead of adding React/Motion solely for decorative effects.
- https://haikei.app/: free static SVG generation/export. This build uses the same static-asset approach with an original local SVG night-bazaar skyline rather than a continuously rendered scene. It was authored locally, not exported from Haikei.
- https://www.realtimecolors.com/: free palette preview and export. The event poster determines the palette; equivalent CSS tokens are checked locally for contrast. No embedded palette-tool runtime.
- ThreeUI: Particle Drift exposes public usage/code tools and could suit an optional intro. Brushed Gold is Pro-gated. The free/public Ashen One hero lists 15 MB and uses Three.js/multiple rendering passes. None is added to gameplay.

## Final visual system

Deep purple background `#120d1e`, panels `#1d152c`, antique gold actions `#e8c878`, warm ivory text `#f3ebda`, lavender secondary text `#b0a1c3`. Cormorant Garamond for display headings and DM Sans for controls, scores and timers. Both fonts are hosted locally as Latin-subset variable WOFF2 files with OFL licences included. Local SVG cards, map and night skyline; supplied poster on the event page. No external runtime, CDN font requests, video background, WebGL context, particle loop, autoplay audio or hover-dependent gameplay.

One-time page entrance: 220ms. Button feedback: 160ms. Battle entries reveal briefly in sequence. Reduced-motion preference disables decorative motion. Phone navigation avoids backdrop blur. Player controls stay still and retain focus during live updates in the same phase.

## Application setup currently installed

- Vanilla HTML/CSS/JS frontend; no React, Three.js or animation-framework dependency.
- Node server owns submissions, phase deadlines, scoring and access control.
- SSE notifications plus polling fallback and local draft recovery.
- Persistent atomic JSON state for this local single-process build.
- Shared-IP throttling permits up to 300 authentication attempts/minute/IP, with a separate 10-attempt/minute limit per team identity and per organiser/IP. Trust forwarded IP headers only behind an explicitly configured production proxy; this local build uses the socket address.
- Main local URL: http://localhost:3000. Password is `ADMIN_PASSWORD` in `.env`.

## What the checks establish

Automated checks cover 40 players signing in via one IP, being seated at ten tables and starting a round together, 40 open SSE connections, simultaneous valid proposal submissions and current-state reads. They use an isolated local server and temporary state, not the visible event. A successful loopback test does not establish venue Wi-Fi quality, mobile battery usage, multi-instance behavior or production capacity. The report must distinguish local timings from an event guarantee.

## Live-event deployment target

Keep this frontend and visual policy. Before live deployment, finish the advanced organiser features listed in README, move state/score updates into a transactional database (Postgres), use HTTPS with secure cookies, configure production secrets, backup/restore and process supervision, and test on actual Android/iPhone devices plus the venue network. Select the host only once event date, network access and budget are known. No hosting purchase or deployment is included in this local setup.

## Premium visual update
The newer premium edition replaces the original schematic SVG map/cards with original, optimized generated WebP artwork and adds a five-territory inspection interface, expanded map and motion preference. See PREMIUM-REDESIGN.md and ARTWORK-PROMPTS.md. The lightweight runtime policy and unchanged game rules remain applicable.
