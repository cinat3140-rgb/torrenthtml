(function () {
  "use strict";

  var state = { catalog: null, categoryId: null, error: null, search: "", metricsUrl: null };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function metric(type, gameId) {
    if (!state.metricsUrl || !gameId || isNaN(Number(gameId))) return;
    fetch(state.metricsUrl.replace(/\/$/, "") + "/" + type, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: Number(gameId) })
    }).catch(function () {});
  }

  function refreshStats() {
    if (!state.metricsUrl || !state.catalog) return Promise.resolve();
    var games = state.catalog.games || [];
    var ids = games.map(function (g) { return g.id; }).filter(function (id) { return /^\d+$/.test(String(id)); });
    if (!ids.length) return Promise.resolve();
    return fetch(state.metricsUrl.replace(/\/$/, "") + "?ids=" + ids.join(","), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (map) {
        if (!map) return;
        games.forEach(function (g) {
          var s = map[String(g.id)];
          if (s) g.stats = { views: s.views, downloads: s.downloads };
        });
      })
      .catch(function () {});
  }

  function applyTheme() {
    var t = localStorage.getItem("html.theme") || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", t);
    var btn = $("#themeToggle");
    if (btn) btn.textContent = t === "light" ? "🌙" : "☀️";
  }

  function toggleTheme() {
    var t = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    try { localStorage.setItem("html.theme", t); } catch (e) {}
    applyTheme();
  }

  function fmtCount(n) {
    if (n == null || isNaN(n)) return "0";
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "B";
    return String(n);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtBytes(n) {
    if (!n || n <= 0) return "-";
    var units = ["B", "KB", "MB", "GB", "TB"];
    var i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return n.toFixed(n >= 100 ? 0 : 1) + " " + units[i];
  }

  /* ---------- Catalog ---------- */

  function fetchCatalog() {
    return fetch("catalog.json?v=" + Date.now(), { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("Katalog alınamadı (HTTP " + r.status + ")");
        return r.json();
      })
      .then(function (data) {
        state.catalog = data;
        state.metricsUrl = data.metricsUrl || null;
        fillCategoryFilter(data.categories || []);
        return refreshStats().then(function () { return data; });
      });
  }

  function fillCategoryFilter(categories) {
    var sel = $("#catFilter");
    if (!sel) return;
    var opts = '<option value="">Tüm Kategoriler</option>';
    (categories || []).forEach(function (c) { opts += '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>"; });
    sel.innerHTML = opts;
  }

  function filteredGames() {
    var games = (state.catalog && state.catalog.games) || [];
    if (state.categoryId) games = games.filter(function (g) { return g.categoryId === state.categoryId; });
    if (state.search) {
      var q = state.search.toLowerCase();
      games = games.filter(function (g) {
        return (g.title || "").toLowerCase().indexOf(q) !== -1 ||
          (g.description || "").toLowerCase().indexOf(q) !== -1 ||
          (g.genre || "").toLowerCase().indexOf(q) !== -1 ||
          (g.developer || "").toLowerCase().indexOf(q) !== -1;
      });
    }
    return games;
  }

  function categoryName(id) {
    var cats = (state.catalog && state.catalog.categories) || [];
    for (var i = 0; i < cats.length; i++) if (cats[i].id === id) return cats[i].name;
    return null;
  }

  function torrentInfo(g) {
    var t = g.torrent || {};
    var hasMagnet = !!(t.magnetUrl || g.magnetUrl);
    var hasFile = !!(t.torrentUrl || g.torrentUrl);
    var file = Array.isArray(g.latestFiles) && g.latestFiles.length ? g.latestFiles[0] : null;
    return {
      magnet: t.magnetUrl || g.magnetUrl || "",
      torrentUrl: t.torrentUrl || g.torrentUrl || "",
      seeds: t.seeds != null ? t.seeds : (g.seeds != null ? g.seeds : null),
      leeches: t.leeches != null ? t.leeches : (g.leeches != null ? g.leeches : null),
      size: t.fileSize || (file && file.fileSize) || g.fileSize || 0,
      uploader: t.uploader || g.uploader || "",
      sha256: t.sha256 || g.sha256 || "",
      hasMagnet: hasMagnet,
      hasFile: hasFile,
      hasAny: hasMagnet || hasFile || !!(file && file.downloadUrl)
    };
  }

  function categoryNameFor(id) { return categoryName(id); }

  function coverWithFallback(g) {
    if (g.coverUrl) return '<img class="gcard-cover-img" src="' + esc(g.coverUrl) + '" alt="' + esc(g.title) + '" loading="lazy" />';
    return '<div class="placeholder">🧲</div>';
  }

  function healthBadges(t) {
    var out = "";
    if (t.seeds != null) out += '<span class="gcard-seed">▲ ' + esc(t.seeds) + " Seeder</span>";
    if (t.leeches != null) out += '<span class="gcard-leech">▼ ' + esc(t.leeches) + " Leecher</span>";
    if (t.sha256) out += '<span class="gcard-cert">✅ Doğrulanmış</span>';
    return out;
  }

  function card(g) {
    var t = torrentInfo(g);
    var cat = categoryNameFor(g.categoryId);
    var size = fmtBytes(t.size);
    var featured = g.isFeatured ? '<span class="gcard-featured">★ Öne Çıkan</span>' : "";
    var developer = g.developer || g.publisher || "";

    var actions;
    if (t.magnet) {
      actions = '<a class="btn btn-primary btn-sm" href="' + esc(t.magnet) + '" data-metric="download:' + g.id + '">🧲 Magnet</a>' +
        '<a class="btn btn-ghost btn-sm" href="#/oyun/' + g.id + '">Detay</a>';
    } else {
      actions = '<a class="btn btn-ghost btn-sm" href="#/oyun/' + g.id + '">İncele</a>' +
        '<span class="btn btn-ghost btn-sm" style="cursor:default">Yakında</span>';
    }

    var statsHtml = "";
    if (g.stats && (typeof g.stats.views === "number" || typeof g.stats.downloads === "number")) {
      statsHtml =
        (typeof g.stats.views === "number" ? '<span class="gcard-views">👁 ' + fmtCount(g.stats.views) + "</span>" : "") +
        (typeof g.stats.downloads === "number" ? '<span class="gcard-dl">⬇ ' + fmtCount(g.stats.downloads) + "</span>" : "");
    }

    return (
      '<article class="gcard">' +
        '<a class="gcard-cover" href="#/oyun/' + g.id + '" aria-label="' + esc(g.title) + '">' +
          coverWithFallback(g) +
          '<span class="gcard-overlay"></span>' +
          (cat ? '<span class="gcard-cat">' + esc(cat) + "</span>" : "") +
          featured +
          '<span class="gcard-play"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z"/></svg></span>' +
        "</a>" +
        '<div class="gcard-body">' +
          '<a class="gcard-title" href="#/oyun/' + g.id + '">' + esc(g.title) + "</a>" +
          (developer ? '<div class="gcard-dev">' + esc(developer) + "</div>" : "") +
          '<div class="gcard-meta">' +
            (size !== "-" ? '<span class="gcard-size">💾 ' + size + "</span>" : "") +
            (g.latestVersion ? '<span class="gcard-ver">v' + esc(g.latestVersion.version || g.version) + "</span>" : "") +
            healthBadges(t) +
            statsHtml +
          "</div>" +
          '<div class="gcard-actions">' + actions + "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function renderCatalog() {
    var grid = $("#catalogGrid");
    var count = $("#catalogCount");
    var games = filteredGames();
    count.textContent = (state.catalog ? state.catalog.games.length : 0) + " torrent listeleniyor";
    if (!games.length) {
      var totalCount = (state.catalog ? state.catalog.games.length : 0);
      grid.innerHTML = totalCount
        ? '<div class="emptystate"><div class="emptystate-icon">🔍</div><h3>Aradığın torrent bulunamadı</h3><p>Filtreyi veya arama terimini değiştirerek tekrar dene.</p></div>'
        : '<div class="emptystate"><div class="emptystate-icon">🧲</div><h3>Katalog yakında dolu</h3><p>İlk torrent ekleniyor. Birkaç gün içinde yeni indirmelerle buradayız.</p></div>';
      return;
    }
    grid.innerHTML = games.map(card).join("");
  }

  function renderGame(id) {
    var el = $("#gameDetail");
    metric("view", id);
    var g = state.catalog && state.catalog.games.find(function (x) { return Number(x.id) === Number(id); });
    if (!g) {
      el.innerHTML = '<div class="empty">Torrent bulunamadı. <a href="#/katalog" style="color:var(--accent)">Kataloğa dön</a></div>';
      return;
    }
    var t = torrentInfo(g);
    var cat = categoryNameFor(g.categoryId);
    var tags = [];
    if (cat) tags.push(cat);
    if (g.genre) tags.push(g.genre);
    if (g.latestVersion) tags.push("v" + (g.latestVersion.version || g.version));

    /* Magnet panel */
    var magnetPanel = "";
    if (t.hasAny) {
      var btnRow = "";
      if (t.magnet) btnRow += '<a class="btn btn-primary btn-lg" href="' + esc(t.magnet) + '" data-metric="download:' + g.id + '">🧲 Magnet ile Aç</a>';
      if (t.magnet) btnRow += '<button class="btn btn-ghost btn-lg" onclick="app.copyText(&quot;' + esc(t.magnet) + '&quot;)">📋 Magnet Kopyala</button>';
      if (t.torrentUrl) btnRow += '<a class="btn btn-ghost btn-lg" href="' + esc(t.torrentUrl) + '" download data-metric="download:' + g.id + '">⬇ .torrent İndir</a>';

      var health = "";
      if (t.seeds != null) health += '<span class="chip style">▲ ' + esc(t.seeds) + " Seeder</span>";
      if (t.leeches != null) health += '<span class="chip dim">▼ ' + esc(t.leeches) + " Leecher</span>";

      magnetPanel =
        '<div class="magnet-panel">' +
          '<h3>🧲 Bu torrenti indir</h3>' +
          '<p>Magnet linki ile istemcin otomatik açılır; dosya indirme hemen başlar.</p>' +
          (health ? '<div class="torrent-health">' + health + "</div>" : "") +
          '<div class="magnet-actions">' + btnRow + "</div>" +
        "</div>";
    }

    var infoRows = "";
    function infoRow(k, v) { return '<div class="info-row"><span class="k">' + esc(k) + "</span><span class='v'>" + esc(v) + "</span></div>"; }
    infoRows += g.developer ? infoRow("Geliştirici", g.developer) : "";
    infoRows += g.publisher ? infoRow("Yayıncı", g.publisher) : "";
    infoRows += infoRow("Kategori", cat || "—");
    infoRows += fmtBytes(t.size) !== "-" ? infoRow("Boyut", fmtBytes(t.size)) : "";
    infoRows += t.seeds != null ? infoRow("Seeder", String(t.seeds)) : "";
    infoRows += t.leeches != null ? infoRow("Leecher", String(t.leeches)) : "";
    infoRows += t.uploader ? infoRow("Yükleyen", t.uploader) : "";
    if (t.sha256) infoRows += infoRow("SHA-256", t.sha256.slice(0, 24) + "…");
    if (g.stats && typeof g.stats.views === "number") infoRows += infoRow("Görüntülenme", "👁 " + fmtCount(g.stats.views));
    if (g.stats && typeof g.stats.downloads === "number") infoRows += infoRow("İndirme", "⬇ " + fmtCount(g.stats.downloads));

    var screens = Array.isArray(g.screenshots) && g.screenshots.length
      ? '<div class="screens"><div class="screens-title">Görseller</div><div class="screens-grid">' +
        g.screenshots.map(function (s) { return '<img class="shot" src="' + esc(s) + '" alt="' + esc(g.title) + '" loading="lazy" />'; }).join("") + "</div></div>"
      : "";

    el.innerHTML =
      '<div class="detail-head">' +
          '<div class="detail-cover-wrap">' + coverWithFallback(g) + (g.isFeatured ? '<span class="gcard-featured">★ Öne Çıkan</span>' : "") + "</div>" +
          '<div class="detail-titleblock">' +
            '<h1>' + esc(g.title) + "</h1>" +
            (g.developer ? '<div class="detail-dev">' + esc(g.developer) + "</div>" : "") +
            '<div class="detail-tags">' + tags.map(function (t2) { return '<span class="tag accent">' + esc(t2) + "</span>"; }).join("") + "</div>" +
          "</div>" +
      "</div>" +
      magnetPanel +
      '<div class="wrap detail-body">' +
        "<div class='detail-main'>" +
          '<div class="detail-desc-title">Hakkında</div>' +
          '<p class="detail-desc">' + esc(g.description || "Açıklama eklenmemiş.") + "</p>" +
          screens +
        "</div>" +
        '<aside class="detail-panel">' +
          '<div class="detail-panel-title">Torrent Bilgileri</div>' +
          '<div class="info-list">' + infoRows + "</div>" +
        "</aside>" +
      "</div>" +
      '<div class="detail-social" id="detailSocial" data-gid="' + (g.id) + '"></div>';
    setTimeout(function () { initComments(g.id); }, 0);
  }

  /* ---------- Router ---------- */

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, "");
    if (!h) return { view: "home" };
    var parts = h.split("/");
    if (parts[0] === "oyun") return { view: "game", id: Number(parts[1]) };
    return { view: parts[0] };
  }

  var VIEWS = ["home", "katalog", "game", "indir", "kurulum", "sss"];

  function route() {
    var r = parseHash();
    if (VIEWS.indexOf(r.view) === -1) { location.hash = "#/"; return; }
    var activeView = r.view;
    $$("[data-view]").forEach(function (el) {
      el.hidden = el.getAttribute("data-view") !== activeView;
    });
    if (r.view === "katalog" || r.view === "game") {
      if (state.catalog) {
        render(r);
      } else if (!state.loading) {
        state.loading = true;
        fetchCatalog()
          .then(function () { render(r); })
          .catch(function (err) {
            state.error = err.message;
            $("#catalogGrid").innerHTML = '<div class="empty">Katalog yüklenemedi: ' + esc(err.message) + ".</div>";
            $("#catalogCount").textContent = "";
          })
          .finally(function () { state.loading = false; });
      }
    } else {
      window.scrollTo(0, 0);
    }
  }

  function render(r) {
    if (r.view === "game") renderGame(r.id);
    else renderCatalog();
    window.scrollTo(0, 0);
  }

  /* ---------- Public ---------- */

  function copyText(text) {
    function done() {
      var el = document.createElement("div");
      el.textContent = "Magnet kopyalandı ✅";
      el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#10b981;color:#06231a;padding:10px 20px;border-radius:10px;font-weight:700;z-index:200;box-shadow:0 10px 30px rgba(0,0,0,.4);";
      document.body.appendChild(el);
      setTimeout(function () { el.remove(); }, 1800);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      done();
    }
  }

  /* ---------- Kurulum Sihirbazi + Yorum/Sohbet (v1.5) ---------- */
  function bindSetupWizard() {
    var next = document.getElementById("setupNext");
    if (!next) return;
    var stepEls = Array.prototype.slice.call(document.querySelectorAll(".sw-step"));
    var status = document.getElementById("setupStatus");
    var bar = document.getElementById("setupBarFill");
    var cur = 0;
    function label(i){ return stepEls[i] ? stepEls[i].querySelector(".sw-title").textContent : ""; }
    function setStatus(t){ if (status) status.textContent = t; }
    function showStep() {
      stepEls.forEach(function (st, i) {
        st.classList.remove("sw-done","sw-active");
        if (i === cur) st.classList.add("sw-active");
        if (i < cur) st.classList.add("sw-done");
        var ch = st.querySelector(".sw-check");
        if (ch) ch.textContent = i < cur ? "✓" : (i === cur ? "⋯" : "·");
      });
      if (bar) bar.style.width = Math.round(((cur + 1) / stepEls.length) * 100) + "%";
    }
    next.addEventListener("click", function () {
      cur++;
      if (cur >= stepEls.length) {
        setStatus("Kurulum tamamlandı. Katalogdan oyunu seç ve başlat.");
        next.textContent = "Kataloğu Aç →";
        next.onclick = function () { location.hash = "#/katalog"; };
        showStep();
        return;
      }
      setStatus("Adım " + (cur + 1) + ": " + label(cur));
      showStep();
      next.textContent = (cur === stepEls.length - 1) ? "Kurulumu Tamamla →" : "Sıradaki →";
    });
    showStep();
  }

  var COMMENTS_CONFIG = {
    supabaseUrl: "https://laavoozgpkrckafyfldy.supabase.co",
    supabaseAnonKey: "sb_publishable_1Mxzm_Mb9FVqX5EsnyLPcQ__Qt06dLw",
    table: "yorumlar"
  };
  function initComments(gameId) {
    var host = document.getElementById("detailSocial");
    if (!host) return;
    var oyun = Number(gameId) || 0;
    var nameKey = "html.user.name";
    var myName = localStorage.getItem(nameKey) || "Misafir";
    var items = [];
    var pollTimer = null;
    function apiGet() {
      var url = COMMENTS_CONFIG.supabaseUrl + "/rest/v1/" + COMMENTS_CONFIG.table +
        "?select=*&oyun=eq." + oyun + "&order=olustu.asc&limit=100";
      return fetch(url, { headers: { apikey: COMMENTS_CONFIG.supabaseAnonKey, Authorization: "Bearer " + COMMENTS_CONFIG.supabaseAnonKey } })
        .then(function (r) { if (!r.ok) throw new Error("supabase " + r.status); return r.json(); });
    }
    function apiPost(item) {
      return fetch(COMMENTS_CONFIG.supabaseUrl + "/rest/v1/" + COMMENTS_CONFIG.table, {
        method: "POST",
        headers: {
          apikey: COMMENTS_CONFIG.supabaseAnonKey,
          Authorization: "Bearer " + COMMENTS_CONFIG.supabaseAnonKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ oyun: oyun, yazar: item.author, email: item.email || null, metin: item.text })
      });
    }
    function renderList() {
      var log = document.getElementById("cmtLog");
      var info = document.getElementById("cmtInfo");
      if (log) log.innerHTML = renderComments(items);
      if (info) info.textContent = items.length ? items.length + " yorum" : "İlk yorumu sen yaz";
    }
    function refresh() {
      apiGet()
        .then(function (rows) {
          items = (rows || []).map(function (r) {
            return { id: r.id, author: r.yazar || "Misafir", text: r.metin || "", email: r.email || "", at: new Date(r.olustu).getTime() };
          });
          renderList();
        })
        .catch(function () {});
    }
    function post() {
      var msg = document.getElementById("cmtMsg");
      if (!msg || !msg.value.trim()) return;
      var nm = document.getElementById("cmtName");
      var em = document.getElementById("cmtEmail");
      if (nm && nm.value.trim()) localStorage.setItem(nameKey, nm.value.trim());
      var item = { id: "c" + Date.now(), author: myName, email: em && em.value.trim() ? em.value.trim() : "", text: msg.value.trim(), at: Date.now() };
      apiPost(item)
        .then(function () { msg.value = ""; refresh(); })
        .catch(function () {
          items.push(item);
          if (items.length > 200) items = items.slice(-200);
          renderList();
          msg.value = "";
        });
    }
    var html =
      '<div class="support-head"><h3>Yorumlar ve Canlı Sohbet</h3>' +
      '<span class="social-badge">CANLI</span>' +
      "</div>" +
      '<p class="support-sub">Herkese açık ortak sohbet. Takma adınla yaz, mesajın tüm ziyaretçilere anında görünür.</p>' +
      '<div class="support-log" id="cmtLog"></div>' +
      '<div class="support-form">' +
        '<div class="support-row">' +
          '<input type="text" id="cmtName" placeholder="Takma ad (boş = Misafir)" maxlength="24" value="' + esc(myName) + '" />' +
          '<input type="email" id="cmtEmail" placeholder="Email (isteğe bağlı)" maxlength="80" />' +
        "</div>" +
        '<textarea id="cmtMsg" maxlength="500" placeholder="Yorumunu yaz, mesajını gönder..."></textarea>' +
        '<button class="btn btn-primary" id="cmtSend" type="button">Yorum Gönder</button>' +
      "</div>" +
      '<p class="sw-status dim" id="cmtInfo"></p>';
    host.innerHTML = html;
    var send = document.getElementById("cmtSend");
    var msg = document.getElementById("cmtMsg");
    if (send) send.addEventListener("click", post);
    if (msg) msg.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); post(); } });
    refresh();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 4000);
  }
  function renderComments(items) {
    if (!items || !items.length) return "";
    return items.map(function (it) {
      var when = new Date(it.at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
      return '<div class="chat-item">' +
        '<div class="chat-meta"><span class="chat-author">' + esc(it.author || "Misafir") + "</span>" +
        '<span class="chat-time">' + when + "</span></div>" +
        "<div>" + esc(it.text) + "</div></div>";
    }).join("");
  }

  window.app = {
    applyFilter: function (v) {
      state.categoryId = v ? Number(v) : null;
      renderCatalog();
    },
    applySearch: function (v) {
      state.search = (v || "").trim();
      renderCatalog();
    },
    copyText: copyText,
    toggleTheme: toggleTheme
  };

  window.addEventListener("hashchange", route);
  document.addEventListener("DOMContentLoaded", function () {
    applyTheme();
    bindSetupWizard();
    var tt = $("#themeToggle");
    if (tt) tt.addEventListener("click", toggleTheme);
    route();
  });
  if (document.readyState !== "loading") { applyTheme(); route(); }

  /* Metric delegation: <a data-metric="view|download:id"> */
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("a[data-metric]") : null;
    if (!el) return;
    var parts = el.getAttribute("data-metric").split(":");
    if (parts[0] === "download") metric("download", parts[1]);
  });

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.parentElement && t.parentElement.classList.contains("screens-grid")) {
      var src = t.src;
      var ov = document.createElement("div");
      ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:100;cursor:zoom-out;";
      var im = new Image();
      im.style.cssText = "max-width:90vw;max-height:90vh;border-radius:10px;";
      im.src = src;
      ov.appendChild(im);
      ov.addEventListener("click", function () { ov.remove(); });
      document.body.appendChild(ov);
    }
  });
})();