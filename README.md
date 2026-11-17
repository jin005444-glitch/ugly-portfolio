# UGLY — Thomas Kadima

Portfolio site for UGLY, the solo freelance graphic design practice of Thomas Kadima.

Static site: plain HTML, CSS and JavaScript. No build step, no dependencies. Publish by
serving the repository root.

## Pages

- `index.html` — home
- `Work.html` — gallery and the Fresh Bite brand case study
- `About.html` — practice and biography
- `Contact.html` — contact details

## Structure

- `css/style.css` — all styles
- `js/script.js` — navigation, gallery lightbox, hero animation, counters
- `Images/` — artwork and brand assets

## Local preview

Open `index.html` in a browser, or serve the folder:

```
npx serve .
```

## Notes

Asset versions are pinned with `?v=` query strings in the HTML. Bump the version
when changing `css/style.css` or `js/script.js` so browsers fetch the new file.
