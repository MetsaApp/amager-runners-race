# race.amagerrunners.dk

Hugo source for the Strandparkløbet Amager event site. Deployed to Cloudflare Pages.

## Local development

```bash
hugo server -D
# open http://localhost:1313
```

## Production build

```bash
hugo --minify
# output → ./public
```

## Editing content — no template work needed

Everything visible on the page is driven by data files in [`data/`](./data) and
translations in [`data/i18n.yaml`](./data/i18n.yaml). The most common edits:

| What                          | Where                                        |
| ----------------------------- | -------------------------------------------- |
| Add a sponsor / logo          | `data/sponsors.yaml` (`items:`)              |
| Change sponsor grid columns   | `data/sponsors.yaml` → `cols`, `colsMobile`  |
| Add a schedule row            | `data/schedule.yaml` (`rows:`)               |
| Add a practical info card     | `data/practical.yaml` (`cards:`)             |
| Change practical grid columns | `data/practical.yaml` → `cols`, `colsMobile` |
| Add / change pricing tier     | `data/pricing.yaml` (`tiers:`)               |
| Update route polyline         | `data/route.yaml` (`points:`)                |
| Reorder / hide a section      | `data/sections.yaml` (`order:`)              |
| English / Danish text         | `data/i18n.yaml`                             |
| Event date, name, prices, …   | `hugo.toml` → `[params]`                     |

Each section has a partial in [`layouts/partials/sections/`](./layouts/partials/sections)
that reads from a matching data file. Hide a section by setting its
`enabled: false` in `data/sections.yaml`. Add a new section by dropping a
partial in `layouts/partials/sections/<id>.html` and listing it in
`data/sections.yaml`.

### Grids

The `practical`, `pricing`, and `sponsors` sections expose `cols` (desktop) and
`colsMobile` knobs in their data files — change them to retune the grid without
touching CSS.

### Sponsors with logo images

Drop a PNG/SVG in `static/img/` and reference it in `data/sponsors.yaml`:

```yaml
- name: "Acme Sports"
  url: "https://acme.example"
  image: "/img/acme-sports.svg"
```

## Cloudflare Pages deployment

In the Pages dashboard:

- **Build command:** `hugo --minify --gc`
- **Build output:** `public`
- **Environment variables:**
  - `HUGO_VERSION` = `0.144.0`
  - `HUGO_ENV` = `production`
- **Custom domain:** `race.amagerrunners.dk`

`static/_headers` adds security & cache headers. Hugo Pipes already
fingerprints CSS/JS so they can be cached for a year.

## SEO

- Per-language `<title>`, meta description, Open Graph, Twitter card
- `hreflang` alternates (en/da) + `x-default`
- JSON-LD `SportsEvent`, `Organization`, `WebSite` graph
- Auto-generated `sitemap.xml`, `robots.txt`
- Theme color & favicon

Update event details (date, location, price, capacity) in `hugo.toml` —
everything from page titles to structured data picks them up.
