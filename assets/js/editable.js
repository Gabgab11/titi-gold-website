// Shared by the live site and the admin page. Lists the text blocks and pictures
// a visitor sees inside <main>, in page order, so each one gets a stable key.
// Blocks that the database already manages (books, blog posts) are skipped.
const TEXT = "h1,h2,h3,h4,p,li,figcaption,blockquote,.btn,.text-link,.eyebrow,.motto";
const SKIP = "[data-books-list],[data-books-home],[data-blog-list],[data-post],[data-no-edit],.admin-wrap,.share-row,script,style";

function mainOf(root) {
  return root.querySelector("main") || root;
}

export function editableTexts(root = document) {
  return [...mainOf(root).querySelectorAll(TEXT)]
    .filter((el) => !el.closest(SKIP))
    .filter((el) => !el.querySelector(TEXT))
    .filter((el) => el.textContent.trim().length > 0);
}

export function editableImages(root = document) {
  return [...mainOf(root).querySelectorAll("img")].filter((img) => !img.closest(SKIP));
}

// The colours the site starts with. Titi can change these from the admin Colours tab.
export const DEFAULT_THEME = {
  "--black": "#151515",
  "--gold": "#c6a04a",
  "--gold-ink": "#85651f",
  "--ivory": "#faf7f0",
  "--champagne": "#e8d8b0",
  "--linen": "#efeadf",
  "--muted": "#645f56",
};
