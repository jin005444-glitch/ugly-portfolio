UGLY — image assets
===================

Every image the site uses lives in this folder and is referenced from
the HTML by its exact, case-sensitive filename.

Brand files
  uLOGO.png    White UGLY wordmark on transparency. Used in the site
               header, the fullscreen menu and the page curtain.
  uLOGOy.png   Purple/orange UGLY wordmark. Used as the favicon.
  ICON.png     Illustrated portrait of Thomas Kadima. Kept as an
               unused spare; the site now uses a typographic
               designer card on the About page.

Artwork
  The Work archive and the selected-work grid on Home are built from
  the project images here — fat.jpg, think.jpg, Skate!1.jpg,
  Liquid fighT.jpg, madara brutalism.jpg, bee.jpg, 3, My Input.jpg,
  sword stone.png, SMILE.jpg, FATHAM.jpg, TRUST.jpg, death.jpg,
  applioo2.jpg, mango preserve.jpg, skull POSTER.jpg and the rest.

Notes
  - Filenames contain spaces, capital letters and punctuation
    (for example "Skate!1.jpg" and "3, My Input.jpg"). Keep them
    exactly as written, or update the matching src in the HTML.
  - To add a piece to the archive, copy the image into this folder
    and add a matching <button class="work-trigger"> block in
    Work.html. The lightbox picks up the title and category from
    the data-title and data-tag attributes.
  - uLOGO.png is white artwork, so it only reads on dark
    backgrounds. Use uLOGOy.png anywhere a light background sits
    behind the mark.
