(function () {
  "use strict";

  var scripts = document.getElementsByTagName("script");
  var currentScript = document.currentScript || scripts[scripts.length - 1];

  var business = currentScript.getAttribute("data-business");
  var theme = currentScript.getAttribute("data-theme") === "dark" ? "dark" : "light";
  var layout = currentScript.getAttribute("data-layout") || "badge";
  var apiBase = currentScript.getAttribute("data-api");

  if (!business || !apiBase) {
    console.error("[noxtill widget] missing required data-business or data-api attribute");
    return;
  }

  var styleId = "noxtill-review-widget-style";
  if (!document.getElementById(styleId)) {
    var style = document.createElement("style");
    style.id = styleId;
    style.textContent = [
      ".noxtill-review-widget { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; border-radius: 14px; padding: 16px; max-width: 320px; box-sizing: border-box; }",
      ".noxtill-review-widget * { box-sizing: border-box; }",
      ".noxtill-review-widget--light { background: #FAF7F0; color: #1c231e; border: 1px solid #E4DDC9; }",
      ".noxtill-review-widget--dark { background: #171f18; color: #f2ede0; border: 1px solid #2a352b; }",
      ".noxtill-widget-rating { display: flex; align-items: baseline; gap: 8px; margin: 0 0 4px; }",
      ".noxtill-widget-score { font-size: 24px; font-weight: 700; }",
      ".noxtill-widget-stars { color: #E8A93C; }",
      ".noxtill-widget-meta { font-size: 12px; opacity: 0.7; margin: 0 0 12px; }",
      ".noxtill-widget-review { font-size: 13px; padding: 8px 0; border-top: 1px solid rgba(128,128,128,0.2); }",
      ".noxtill-widget-review-author { font-weight: 600; margin-bottom: 2px; }",
      ".noxtill-widget-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }",
      ".noxtill-widget-empty { margin: 0; font-size: 13px; }",
    ].join("\n");
    document.head.appendChild(style);
  }

  var container = document.createElement("div");
  container.className = "noxtill-review-widget noxtill-review-widget--" + theme;
  currentScript.insertAdjacentElement("afterend", container);

  var loading = document.createElement("p");
  loading.className = "noxtill-widget-empty";
  loading.textContent = "Loading reviews…";
  container.appendChild(loading);

  fetch(apiBase + "/reviews/widget/" + encodeURIComponent(business))
    .then(function (res) {
      if (!res.ok) throw new Error("widget fetch failed: " + res.status);
      return res.json();
    })
    .then(render)
    .catch(function () {
      container.textContent = "";
    });

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  // Every field below comes from a review (external platform data, or this business's own
  // customers) — always assigned via textContent, never innerHTML, so nothing in a review's text
  // or author name can ever execute as markup on the host page.
  function render(data) {
    container.textContent = "";
    var reviews = (data && data.reviews) || [];

    if (reviews.length === 0) {
      var empty = el("p", "noxtill-widget-empty");
      empty.textContent = "No reviews yet.";
      container.appendChild(empty);
      return;
    }

    var avg = reviews.reduce(function (sum, r) { return sum + r.stars; }, 0) / reviews.length;

    var ratingRow = el("div", "noxtill-widget-rating");
    var score = el("span", "noxtill-widget-score");
    score.textContent = avg.toFixed(1);
    var stars = el("span", "noxtill-widget-stars");
    stars.textContent = "★".repeat(Math.round(avg));
    ratingRow.appendChild(score);
    ratingRow.appendChild(stars);
    container.appendChild(ratingRow);

    var meta = el("p", "noxtill-widget-meta");
    meta.textContent = reviews.length + " review" + (reviews.length === 1 ? "" : "s");
    container.appendChild(meta);

    if (layout === "badge") return;

    var list = el("div", layout === "grid" ? "noxtill-widget-grid" : undefined);
    var count = layout === "carousel" ? 1 : layout === "grid" ? 4 : 3;

    reviews.slice(0, count).forEach(function (review) {
      var item = el("div", "noxtill-widget-review");
      var author = el("div", "noxtill-widget-review-author");
      author.textContent = review.author || "Anonymous";
      var text = el("div");
      text.textContent = review.text || "";
      item.appendChild(author);
      item.appendChild(text);
      list.appendChild(item);
    });
    container.appendChild(list);
  }
})();
