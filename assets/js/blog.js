// Public blog: the post list (blog.html) and a single post (post.html?slug=...).
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_KEY, SITE_URL } from "./supabase-config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dateText = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

/** Paragraphs are separated by a blank line. A line "image: https://..." shows a picture. */
export function renderBody(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const img = block.match(/^image:\s*(https?:\/\/\S+)$/);
      if (img) return `<figure class="post-figure"><img src="${esc(img[1])}" alt="" loading="lazy"></figure>`;
      return `<p>${esc(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
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
      (p) => `<article class="post-card">
        ${p.cover_url ? `<img class="post-cover" src="${esc(p.cover_url)}" alt="" loading="lazy">` : ""}
        <p class="post-meta">${esc(dateText(p.published_at))}</p>
        <h2><a href="post.html?slug=${encodeURIComponent(p.slug)}">${esc(p.title)}</a></h2>
        <p>${esc(p.excerpt)}</p>
        <a class="text-link" href="post.html?slug=${encodeURIComponent(p.slug)}">Read the post</a>
      </article>`
    )
    .join("");
}

async function showPost(container) {
  const slug = new URLSearchParams(location.search).get("slug") || "";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    container.innerHTML = '<p>That post could not be found. <a href="blog.html">Back to the blog</a></p>';
    return;
  }
  const { data, error } = await sb
    .from("posts")
    .select("slug,title,excerpt,body,cover_url,published_at")
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
  container.innerHTML = `
    <p class="post-meta">${esc(dateText(data.published_at))}</p>
    <h1 class="post-title">${esc(data.title)}</h1>
    ${data.cover_url ? `<img class="post-cover" src="${esc(data.cover_url)}" alt="">` : ""}
    <div class="post-body">${renderBody(data.body)}</div>
    <div class="share-row">
      <p>Share this post</p>
      <a class="btn-ghost" href="https://wa.me/?text=${encodeURIComponent(data.title + " " + url)}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn-ghost" href="mailto:?subject=${encodeURIComponent(data.title)}&body=${encodeURIComponent(url)}">Email</a>
      <button class="btn-ghost" type="button" data-copy="${esc(url)}">Copy link</button>
    </div>`;
  container.querySelector("[data-copy]")?.addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(e.currentTarget.dataset.copy);
      e.currentTarget.textContent = "Link copied";
    } catch {
      e.currentTarget.textContent = url;
    }
  });
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
