// Public blog: the post list (blog.html) and a single post (post.html?slug=...), read like a book.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY, SITE_URL } from "./supabase-config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dateText = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
const IMAGE_LINE = /^image:\s*(https?:\/\/\S+)$/;
// Roughly one comfortable reading "page" on a phone.
const PAGE_CHARS = 650;

/** Paragraphs are separated by a blank line. A line "image: https://..." shows a picture. */
function renderBlock(block) {
  const img = block.match(IMAGE_LINE);
  if (img) return `<figure class="post-figure"><img src="${esc(img[1])}" alt="" loading="lazy"></figure>`;
  return `<p>${esc(block).replace(/\n/g, "<br>")}</p>`;
}

export function renderBody(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(renderBlock)
    .join("");
}

/** Splits a post into reading pages, keeping paragraphs whole where possible. */
function toPages(text) {
  const units = [];
  for (const block of String(text || "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
    if (IMAGE_LINE.test(block)) {
      units.push({ html: renderBlock(block), size: 350 });
    } else if (block.length > PAGE_CHARS) {
      // A very long paragraph is split at sentence ends so no page is too full.
      let buf = "";
      for (const sentence of block.split(/(?<=[.!?])\s+/)) {
        if (buf && (buf + " " + sentence).length > PAGE_CHARS) {
          units.push({ html: renderBlock(buf), size: buf.length });
          buf = sentence;
        } else {
          buf = buf ? buf + " " + sentence : sentence;
        }
      }
      if (buf) units.push({ html: renderBlock(buf), size: buf.length });
    } else {
      units.push({ html: renderBlock(block), size: block.length });
    }
  }
  const pages = [];
  let page = "";
  let size = 0;
  for (const unit of units) {
    if (page && size + unit.size > PAGE_CHARS) {
      pages.push(page);
      page = "";
      size = 0;
    }
    page += unit.html;
    size += unit.size;
  }
  if (page || !pages.length) pages.push(page);
  return pages;
}

async function showList(container) {
  const { data, error } = await sb
    .from("posts")
    .select("slug,title,excerpt,cover_url,published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) {
    container.innerHTML = "<p>Posts could not be loaded right now. Please try again shortly.</p>";
    return;
  }
  if (!data.length) {
    container.innerHTML = "<p>No posts yet. Please check back soon.</p>";
    return;
  }
  container.innerHTML = data
    .map(
      (p) => `<article class="post-card${p.cover_url ? "" : " post-card--plain"}">
        ${p.cover_url ? `<a class="post-cover-link" href="post.html?slug=${encodeURIComponent(p.slug)}" tabindex="-1" aria-hidden="true"><img class="post-cover" src="${esc(p.cover_url)}" alt="" loading="lazy"></a>` : ""}
        <div class="post-card-text">
          <p class="post-meta">${esc(dateText(p.published_at))}</p>
          <h2><a href="post.html?slug=${encodeURIComponent(p.slug)}">${esc(p.title)}</a></h2>
          <p>${esc(p.excerpt)}</p>
          <a class="text-link" href="post.html?slug=${encodeURIComponent(p.slug)}">Open the post</a>
        </div>
      </article>`
    )
    .join("");
}

function renderComments(list, comments) {
  if (!comments.length) {
    list.innerHTML = "<p class=\"muted\">No comments yet. Be the first to leave one.</p>";
    return;
  }
  list.innerHTML = comments
    .map(
      (c) => `<article class="comment">
        <p class="comment-meta"><strong>${esc(c.name)}</strong> · ${esc(dateText(c.created_at))}</p>
        <p>${esc(c.body).replace(/\n/g, "<br>")}</p>
      </article>`
    )
    .join("");
}

async function loadComments(postId, list) {
  const { data, error } = await sb
    .from("post_comments")
    .select("name,body,created_at")
    .eq("post_id", postId)
    .eq("approved", true)
    .order("created_at", { ascending: true });
  if (error) {
    list.innerHTML = "<p class=\"muted\">Comments could not be loaded right now.</p>";
    return;
  }
  renderComments(list, data || []);
}

// A visitor can send at most three comments an hour from the same browser.
const COMMENT_LIMIT = 3;
const COMMENT_WINDOW_MS = 60 * 60 * 1000;
function recentCommentTimes() {
  try {
    const times = JSON.parse(localStorage.getItem("tg-comment-times") || "[]");
    return times.filter((t) => Date.now() - t < COMMENT_WINDOW_MS);
  } catch {
    return [];
  }
}
function rememberComment() {
  try {
    localStorage.setItem("tg-comment-times", JSON.stringify([...recentCommentTimes(), Date.now()]));
  } catch {}
}

function setCommentMsg(el, text, ok = false) {
  el.textContent = text;
  el.dataset.ok = ok ? "1" : "0";
}

function wireCommentForm(form, postId) {
  const msg = form.querySelector("[data-comment-msg]");
  const button = form.querySelector("button[type=submit]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const body = form.elements.comment.value.trim();
    // The hidden "website" field is for spam bots only; real visitors never fill it in.
    if (form.elements.website.value) {
      setCommentMsg(msg, "Thank you. Your comment will appear here once it has been approved.", true);
      form.reset();
      return;
    }
    if (name.length < 2 || name.length > 60) return setCommentMsg(msg, "Please add your name (2 to 60 letters).");
    if (body.length < 2 || body.length > 1000) return setCommentMsg(msg, "Please write a comment (up to 1000 characters).");
    if (recentCommentTimes().length >= COMMENT_LIMIT) {
      return setCommentMsg(msg, "You have sent a few comments already. Please try again later.");
    }
    button.disabled = true;
    // No .select() here: visitors can only insert, and new comments wait for approval.
    const { error } = await sb.from("post_comments").insert({ post_id: postId, name, body });
    button.disabled = false;
    if (error) return setCommentMsg(msg, "Your comment could not be sent. Please try again.");
    rememberComment();
    form.reset();
    setCommentMsg(msg, "Thank you. Your comment will appear here once it has been approved.", true);
  });
}

function setupBook(root) {
  const cover = root.querySelector("[data-cover]");
  const book = root.querySelector("[data-book]");
  const pages = [...root.querySelectorAll("[data-page]")];
  const count = root.querySelector("[data-count]");
  const prev = root.querySelector("[data-prev]");
  const next = root.querySelector("[data-next]");
  let index = 0;

  const show = (i) => {
    index = Math.min(Math.max(i, 0), pages.length - 1);
    pages.forEach((p, n) => (p.hidden = n !== index));
    count.textContent = `Page ${index + 1} of ${pages.length}`;
    prev.disabled = index === 0;
    next.disabled = index === pages.length - 1;
  };
  const open = () => {
    cover.hidden = true;
    book.hidden = false;
    show(0);
    root.scrollIntoView({ behavior: "smooth", block: "start" });
    book.querySelector("h1")?.focus({ preventScroll: true });
  };
  const close = () => {
    book.hidden = true;
    cover.hidden = false;
    cover.querySelector("[data-open]").focus();
  };

  root.querySelector("[data-open]").addEventListener("click", open);
  root.querySelector("[data-close]").addEventListener("click", close);
  // Turning a page keeps the reader where it is. Only if the start of the
  // page has scrolled out of view do we bring it back, without any animation.
  const keepPageInView = () => {
    const top = book.getBoundingClientRect().top;
    if (top < 90) window.scrollTo({ top: window.scrollY + top - 90, behavior: "instant" });
  };
  prev.addEventListener("click", () => {
    show(index - 1);
    keepPageInView();
  });
  next.addEventListener("click", () => {
    show(index + 1);
    keepPageInView();
  });
  document.addEventListener("keydown", (e) => {
    if (book.hidden || e.target.closest?.("input, textarea")) return;
    if (e.key === "ArrowRight") next.click();
    if (e.key === "ArrowLeft") prev.click();
    if (e.key === "Escape") close();
  });
}

async function showPost(container) {
  const slug = new URLSearchParams(location.search).get("slug") || "";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    container.innerHTML = '<p>That post could not be found. <a href="blog.html">Back to the blog</a></p>';
    return;
  }
  const { data, error } = await sb
    .from("posts")
    .select("id,slug,title,excerpt,body,cover_url,published_at")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error || !data) {
    container.innerHTML = '<p>That post could not be found. <a href="blog.html">Back to the blog</a></p>';
    return;
  }
  document.title = `${data.title} | Titi Gold`;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.content = data.excerpt || data.title;
  const url = `${SITE_URL}/post.html?slug=${encodeURIComponent(data.slug)}`;
  const date = esc(dateText(data.published_at));
  const pages = toPages(data.body);

  container.innerHTML = `
    <article class="reader" data-reader>
      <div class="reader-cover" data-cover>
        ${data.cover_url ? `<img class="reader-cover-img" src="${esc(data.cover_url)}" alt="">` : ""}
        <p class="post-meta">${date}</p>
        <h1 class="post-title">${esc(data.title)}</h1>
        ${data.excerpt ? `<p class="reader-excerpt">${esc(data.excerpt)}</p>` : ""}
        <button class="btn" type="button" data-open>Open the post</button>
        <p class="muted reader-hint">${pages.length > 1 ? `${pages.length} pages` : "1 page"} · turn the pages with the buttons</p>
      </div>
      <div class="reader-book" data-book hidden>
        <div class="reader-top">
          <p class="post-meta">${date}</p>
          <h1 class="post-title" tabindex="-1">${esc(data.title)}</h1>
        </div>
        <div class="reader-pages">
          ${pages.map((html) => `<div class="reader-page" data-page><div class="post-body">${html}</div></div>`).join("")}
        </div>
        <div class="reader-controls">
          <button class="btn-ghost" type="button" data-prev>Previous page</button>
          <span class="reader-count" data-count aria-live="polite"></span>
          <button class="btn-ghost" type="button" data-next>Next page</button>
        </div>
        <button class="btn-ghost reader-close" type="button" data-close>Close the post</button>
      </div>
    </article>
    <div class="share-row">
      <p>Share this post</p>
      <a class="btn-ghost" href="https://wa.me/?text=${encodeURIComponent(data.title + " " + url)}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn-ghost" href="mailto:?subject=${encodeURIComponent(data.title)}&body=${encodeURIComponent(url)}">Email</a>
      <button class="btn-ghost" type="button" data-copy="${esc(url)}">Copy link</button>
    </div>
    <section class="comments" aria-labelledby="commentsTitle">
      <h2 id="commentsTitle">Comments</h2>
      <div data-comments-list><p class="muted">Loading comments…</p></div>
      <form class="comment-form admin-form" data-comment-form novalidate>
        <h3>Leave a comment</h3>
        <label>Your name
          <input name="name" required maxlength="60" autocomplete="name">
        </label>
        <label>Your comment
          <textarea name="comment" rows="4" required maxlength="1000"></textarea>
        </label>
        <label class="comment-trap" aria-hidden="true">Website
          <input name="website" tabindex="-1" autocomplete="off">
        </label>
        <div class="admin-row"><button class="btn" type="submit">Send comment</button></div>
        <p class="admin-msg" data-comment-msg role="status" aria-live="polite"></p>
        <p class="muted comment-note">Comments appear after they have been read and approved.</p>
      </form>
    </section>`;

  container.querySelector("[data-copy]")?.addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(e.currentTarget.dataset.copy);
      e.currentTarget.textContent = "Link copied";
    } catch {
      e.currentTarget.textContent = url;
    }
  });

  setupBook(container.querySelector("[data-reader]"));
  wireCommentForm(container.querySelector("[data-comment-form]"), data.id);
  loadComments(data.id, container.querySelector("[data-comments-list]"));
}

const list = document.querySelector("[data-blog-list]");
if (list) showList(list);
const post = document.querySelector("[data-post]");
if (post) showPost(post);

// Books: the Books page lists published books from the database.
async function showBooks(container) {
  const { data, error } = await sb
    .from("books")
    .select("title,subtitle,description,cover_url,buy_url")
    .eq("status", "published")
    .order("sort_order", { ascending: true });
  if (error || !data || !data.length) return; // keep the built-in list if nothing is available
  container.innerHTML = data
    .map(
      (b) => `<article class="book-detail">
        ${b.cover_url ? `<div class="book-cover book-cover--image"><img src="${esc(b.cover_url)}" width="640" height="951" loading="lazy" decoding="async" alt="Cover of ${esc(b.title)}"></div>` : ""}
        <div>
          ${b.subtitle ? `<p class="eyebrow">${esc(b.subtitle)}</p>` : ""}
          <h2>${esc(b.title)}</h2>
          ${b.description ? `<p>${esc(b.description)}</p>` : ""}
          ${b.buy_url ? `<p><a class="text-link" href="${esc(b.buy_url)}" target="_blank" rel="noopener">Get a copy <svg aria-hidden="true"><use href="#icon-arrow-up-right"/></svg></a></p>` : ""}
        </div>
      </article>`
    )
    .join("");
}
const booksBox = document.querySelector("[data-books-list]");
if (booksBox) showBooks(booksBox);

// Home page book cards come from the database (published books only).
async function showHomeBooks(container) {
  const { data, error } = await sb
    .from("books")
    .select("title,description,cover_url")
    .eq("status", "published")
    .order("sort_order", { ascending: true });
  if (error || !data || !data.length) return; // keep the built-in cards if nothing is available
  container.innerHTML = data
    .map(
      (b) => `<article class="book">
        ${b.cover_url ? `<div class="book-cover book-cover--image"><img src="${esc(b.cover_url)}" width="640" height="951" loading="lazy" decoding="async" alt="Cover of ${esc(b.title)}"></div>` : ""}
        <div>
          <h3>${esc(b.title)}</h3>
          ${b.description ? `<p>${esc(b.description)}</p>` : ""}
        </div>
      </article>`
    )
    .join("");
}
const homeBooks = document.querySelector("[data-books-home]");
if (homeBooks) showHomeBooks(homeBooks);
