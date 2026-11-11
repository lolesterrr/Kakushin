# 06. Design preferences

Joe's design direction for Kakushin, collected from seven reference images (saved in [`design-refs/`](design-refs/)). Use this doc when the project reaches the design stage. It is meant to be read on its own, without the chat it came from.

## The direction in one paragraph

Japanese-inspired, calm and papery. Off-white paper backgrounds, ink black and warm greys, with **red as the one bright colour**. Paper-cut illustrations carry the mood. Thin grid lines and borders give the web portals a structured, editorial look. Postage-stamp shapes with bold type and big numbers show up all over the product, not just for winners. A handwritten font adds playfulness. Icons are solid black glyphs. The mobile app gets a curved, wheel-style picker. Japanese is used only as an aesthetic: **no Japanese text in the UI**. Light mode first, with a dark mode.

## Decisions joe made

| Topic | Decision |
|---|---|
| Main accent colour | Red (not indigo) |
| Base palette | The cat game palette (ink black, greys, warm beige, paper white) |
| Illustration | Paper-cut art, like the wave app header. Each showcased hackathon can get a relevant image in that style |
| Fonts | Handwritten font and playfulness from the planner |
| Web portal layout | The Japan website look: visible grid, thin borders, lots of air |
| Icons | Solid black glyphs, red as the only accent |
| Stamps | Use them **often**, across the product. Not only for winners, or they'd rarely appear |
| Mobile motion | Curved scroll wheel picker (the cycling picker) |
| Dark mode | Yes, nice to have |
| Japanese text | No. Aesthetic only |

## Palette

Base comes straight from the cat game reference (its hex codes are printed on the image). Red is the accent.

| Token | Hex | Use |
|---|---|---|
| `ink` | `#111111` | Main text, solid icons, dark mode background |
| `ink-2` | `#333333` | Secondary text, dark mode surfaces |
| `grey` | `#777777` | Muted text, captions, disabled |
| `sand` | `#BEB8AD` | Borders, grid lines, dividers |
| `paper-2` | `#E6E1D7` | Cards, sunken areas, input backgrounds |
| `paper` | `#F6F4EE` | Page background |
| `red` | `#D93A2B` (starting point, tune it) | Primary buttons, active state, the "one red thing" on a screen, stamps |

Supporting colours, used sparingly and mostly for status pills, stamps and illustrations (from the wave app and Kyoto stamps):

| Token | Hex (starting points) | Use |
|---|---|---|
| `indigo` | `#2F4F8F` | Info, "in progress", illustration water/sky |
| `gold` | `#C9A15A` | Pending, "due soon", gold stamp variant |
| `moss` | `#4E7A3A` | Success, done, accepted |

Rules:

- One red element should dominate a screen. Red is the sun in the Japan website, not wallpaper.
- Red always means action or "this matters". Don't use it for decoration where it can be confused with an error. Errors get a red that pairs with an icon and text, never colour alone.
- Check contrast: red text on `paper` needs to pass WCAG AA (4.5:1 for body). Use red mainly for fills with white text, or for large text.

### Dark mode

Flip the paper and ink, keep it warm (no blue-grey or pure black-on-white contrast).

| Light | Dark |
|---|---|
| `paper` `#F6F4EE` background | `#111111` background |
| `paper-2` cards | `#1E1D1B` cards |
| `ink` text | `#F6F4EE` text |
| `sand` borders | `#3A3833` borders |
| `red` | Slightly lighter red, around `#E5533F`, so it doesn't look muddy |

Paper texture and illustrations should get dimmed versions in dark mode, not just inverted.

## Typography

Three roles. Font names are suggestions to test, not final.

| Role | Feel | Candidates (all free, Google Fonts) |
|---|---|---|
| Body and UI | Clean, neutral sans, calm | Inter, Figtree, or Raleway (closest to the Japan website) |
| Display and stamps | Bold, tight, Swiss poster style, big numbers | Inter Tight (800/900), Archivo Black |
| Handwritten accent | Friendly, like the planner stickers | Patrick Hand, Gaegu, Kalam |

Rules:

- The handwritten font is an accent: headings on participant screens, sticker cards, empty states, encouragement ("You're in!"), notes. Never for tables, forms, scores or long text.
- Big numbers are a feature. Stats, dates, ranks and countdowns get the display font at large sizes (like "38", "94" in the wave app and "19 89" on the stamps).
- Small uppercase labels with wide letter spacing for section titles and captions ("WEIGHT", "CONCEPT" in the cat game).

## Layout and spacing

- **Web portals (Japan website look):** visible grid with thin 1px `sand` lines, panels that sit edge to edge inside the grid, generous whitespace, content aligned to the lines. Feels like an editorial page or a well-made poster.
- **Spec-sheet sections (cat game):** labelled blocks separated by thin vertical and horizontal dividers. Good for challenge details, judging rubrics, profile pages.
- Spacing scale on a 4px base: 4, 8, 12, 16, 24, 32, 48, 64.
- Corners: small radius (6 to 10px) on cards and inputs. Pills are fully rounded. Stamps use the perforated edge instead of rounding.
- Density: calm, not cramped. Admin tables can be denser, but keep the paper feel and thin lines.

## Components

### Stamps (used often)
The postage stamp from the Kyoto references is a signature component. Perforated edge, bold display type, one big number or short word, a solid colour fill (red, indigo or gold), optional small line-art illustration.

Where they show up:

- Challenge cards and challenge headers (the challenge's date or year as the big number)
- Application status: Received, Shortlisted, Accepted, Rejected
- Team joined, pitch submitted, judging done
- Achievements and badges on the participant profile
- Winner, finalist and participant certificates, and the `/verify/:code` page
- Organisation pages (e.g. "Since 2024", number of challenges run)
- Notification and email headers

Variants: large (hero), medium (card), small (inline badge, like a postmark next to a name).

### Paper-cut illustration
From the wave app header. Layered paper look with soft shadows between layers.

- Header art on the home screen (mobile) and on challenge pages.
- Each showcased hackathon can have a cover image in this style that matches its theme. Organisers upload a cover image (already in the MVP challenge fields). When they don't, fall back to a paper-cut illustration per topic: fintech, health, agritech, climate, AI, and a generic one.
- Paper texture can sit very lightly on backgrounds and cards. Keep it subtle so text stays readable.

### Cards
- Stat cards: label, big number, small caption, with a small paper-cut corner shape in the status colour (wave app).
- Task / list rows: white card with a coloured left edge for status, time or date on the right, a status pill at the end (wave app "Today's Focus").
- Sticker cards (participant side): slightly tilted or offset, soft coloured fill, handwritten text, like the planner stickers. Use for tips, encouragement, deadlines ("3 days left"), and empty states.

### Status pills
Rounded pills, soft fill with darker text: Due now (gold), In progress (indigo), Pending (sand), Not started (grey), Blocked or Rejected (ink, or red), Accepted (moss).

### Icons
Solid black glyphs (filled, not outline), simple shapes, like the Japanese culture icon set. Red only for the active or important one. In dark mode they become paper white.

- Suggested set: Phosphor Icons, "fill" weight. It has a React package for web and `phosphor-react-native` for the Expo app, so both match.

### Navigation
- Mobile: bottom tab bar, active tab as a filled red tile with a white icon (wave app style, but in red), others as solid icons in `grey`.
- Web: thin top bar inside the grid, hamburger or side rail for sections (Japan website), small dot indicators for carousels.
- Planner-style side tabs could work for switching sections inside a challenge in the admin portal (e.g. Applications, Judging, Results). Optional.

## Motion

- **Curved wheel picker (mobile):** a vertical list that bends along an arc, the centred item enlarges and gets a coloured outline, items fade and tilt as they move away. Use for picking interest topics, choosing a challenge from a list, or selecting a date or team size. Build with Reanimated in the Expo app.
- Keep the rest gentle: cards lift slightly on press, stamps "thunk" in with a quick scale and tiny rotate when a status changes (e.g. shortlisted), paper layers in the header parallax a little on scroll.
- Respect "reduce motion": turn off parallax and the stamp animation, keep the picker but without the 3D tilt.

## Web vs mobile

| | Web portals (public and admin) | Mobile app (participants) |
|---|---|---|
| Overall look | Japan website: grid lines, thin borders, editorial, airy | Wave app: illustrated header, stat cards, list rows, bottom tabs |
| Playfulness | Public portal: some stickers and handwritten accents. Admin portal: calm and functional, handwriting very rare | Most playful surface: stickers, handwritten headings, stamps everywhere |
| Illustration | Challenge page hero banners, landing page | Home screen header, challenge cards |
| Stamps | Challenge cards, profile badges, certificates, verify page | Status changes, profile, certificates, notifications |
| Motion | Light hover and fade | Curved picker, stamp thunk, header parallax |
| Density | Admin tables can be denser | Roomy, thumb-friendly (44pt minimum touch targets) |

Implementation notes for later: the web uses Tailwind + shadcn/ui, so the palette and fonts become Tailwind theme tokens and CSS variables (with a `.dark` class). The Expo app should read the same token values from a shared file so both surfaces stay in sync.

## Do and don't

**Do**
- Keep one red focal point per screen
- Use big numbers and bold stamps to celebrate progress
- Let the grid and thin lines show on the web
- Use paper textures and paper-cut art for warmth
- Keep body text in a plain sans so it reads well

**Don't**
- No Japanese text or kanji in the UI (aesthetic only)
- No neon, glassy gradients, or heavy drop shadows
- No outline icon sets mixed with the solid ones
- No handwritten font in forms, tables or scores
- Don't save stamps only for winners
- Don't let red mean both "go" and "error" without an icon or label

## Reference notes

| # | Image | What joe likes | What we take |
|---|---|---|---|
| 1 | [Wave task app](design-refs/01-wave-task-app.jpg) | The paper-cut art itself | Paper-cut illustrations, per-hackathon cover art, stat cards with big numbers, coloured-edge list rows, status pills, bottom tab bar |
| 2 | [Cat game concept (むちねこ)](design-refs/02-muchineko-game.jpg) | The palette | The base palette (`#111111` to `#F6F4EE`), also the labelled spec-sheet layout with thin dividers |
| 3 | [Sticker planner](design-refs/03-sticker-planner.jpg) | Handwritten font and playfulness | Handwritten accent font, sticker cards, dotted paper, optional side tabs |
| 4 | [Japan grid website](design-refs/04-japan-grid-site.jpg) | The look, for the portals | Visible grid, thin borders, one red sun as the focal point, airy layout |
| 5 | [Japanese glyph icons](design-refs/05-glyph-icons.jpg) | Icon style | Solid black glyph icons with red as the only accent (image has stock watermarks, reference only) |
| 6 | [Kyoto forest stamps](design-refs/06-kyoto-stamps.jpg) | Stamps, used often | Stamp component: perforated edge, bold display type, huge numbers, line-art centre, colour variants |
| 7 | [Curved activity picker](design-refs/07-curved-picker.jpg) | The curved scroll motion | Curved wheel picker for the mobile app |

The reference images are other people's work and are kept here only for inspiration. Don't ship them or copy them directly into the product.
