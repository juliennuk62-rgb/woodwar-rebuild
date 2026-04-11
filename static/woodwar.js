/* =============================================================
   Woodwar Rebuild — frontend helpers
   Vanilla JS, zero dependencies. Loaded by base.html on every page.

   Provides three reusable widgets:

   1. Countdown — live "in 3h 14min" / progress bar combo for any
      ongoing operation (training, building upgrade, cooldown).
      Usage:
        <span data-countdown-until="2026-04-11T15:30:00Z"
              data-countdown-from="2026-04-11T15:00:00Z">…</span>

   2. ProgressBar — pure visual fill 0..100% rendered from
      data-progress attribute (or computed from countdown above).

   3. FlashFeedback — adds a brief pulse animation to any button
      with class .ww-action when clicked.

   Everything is self-initializing on DOMContentLoaded and on
   dynamic injection via the public WW.refresh() function.
   ============================================================= */
(function () {
  "use strict";

  // ----------------- Time helpers -----------------

  function parseISO(s) {
    if (!s) return null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  /**
   * Format a duration in seconds as a human-friendly string :
   *  - 45s              if < 1 min
   *  - 12min 03s        if < 1 h
   *  - 2h 14min         if < 1 day
   *  - 1j 03h           otherwise
   */
  function formatRemaining(sec) {
    if (sec <= 0) return "terminé";
    if (sec < 60) return Math.floor(sec) + "s";
    if (sec < 3600) {
      var m = Math.floor(sec / 60);
      var s = Math.floor(sec - m * 60);
      return m + "min " + pad(s) + "s";
    }
    if (sec < 86400) {
      var h = Math.floor(sec / 3600);
      var mm = Math.floor((sec - h * 3600) / 60);
      return h + "h " + pad(mm) + "min";
    }
    var d = Math.floor(sec / 86400);
    var hh = Math.floor((sec - d * 86400) / 3600);
    return d + "j " + pad(hh) + "h";
  }

  // ----------------- Countdown widget -----------------

  /**
   * For each element with data-countdown-until, replace its content
   * with a live countdown. If data-countdown-from is also present,
   * a progress bar is rendered showing the elapsed fraction.
   *
   * Optional attributes:
   *  data-countdown-label  — prefix shown before the time (default empty)
   *  data-countdown-on-end — JS expression evaluated when reaching 0
   *  data-countdown-reload — when present, reload the page on end
   */
  function initCountdowns(root) {
    var nodes = (root || document).querySelectorAll(
      "[data-countdown-until]:not([data-countdown-init])"
    );
    nodes.forEach(function (node) {
      var until = parseISO(node.getAttribute("data-countdown-until"));
      if (!until) return;
      var from = parseISO(node.getAttribute("data-countdown-from"));
      var label = node.getAttribute("data-countdown-label") || "";
      var reloadOnEnd = node.hasAttribute("data-countdown-reload");

      node.setAttribute("data-countdown-init", "1");

      // Build inner DOM:
      //   <span class="ww-cd-label">…</span>
      //   <span class="ww-cd-time">…</span>
      //   <span class="ww-cd-bar"><span class="ww-cd-bar-fill"></span></span>
      var labelEl = null;
      if (label) {
        labelEl = document.createElement("span");
        labelEl.className = "ww-cd-label";
        labelEl.textContent = label + " ";
      }
      var timeEl = document.createElement("span");
      timeEl.className = "ww-cd-time";

      var barEl = null, fillEl = null;
      if (from) {
        barEl = document.createElement("span");
        barEl.className = "ww-cd-bar";
        fillEl = document.createElement("span");
        fillEl.className = "ww-cd-bar-fill";
        barEl.appendChild(fillEl);
      }

      node.innerHTML = "";
      if (labelEl) node.appendChild(labelEl);
      node.appendChild(timeEl);
      if (barEl) node.appendChild(barEl);

      var totalMs = from ? (until.getTime() - from.getTime()) : null;

      function tick() {
        var now = Date.now();
        var remainingMs = until.getTime() - now;
        var remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
        timeEl.textContent = formatRemaining(remainingSec);

        if (fillEl && totalMs > 0) {
          var elapsedMs = now - from.getTime();
          var pct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
          fillEl.style.width = pct.toFixed(2) + "%";

          // Color shift: green > yellow > orange as time approaches 0.
          if (pct < 50) fillEl.dataset.zone = "early";
          else if (pct < 85) fillEl.dataset.zone = "mid";
          else fillEl.dataset.zone = "late";
        }

        if (remainingSec <= 0) {
          node.classList.add("ww-cd-done");
          clearInterval(node._wwTimer);
          if (reloadOnEnd) {
            // Reload after a short delay so the user sees "terminé".
            setTimeout(function () { window.location.reload(); }, 600);
          }
          return;
        }
      }

      tick();
      node._wwTimer = setInterval(tick, 1000);
    });
  }

  // ----------------- Standalone progress bar -----------------

  /**
   * Any element with data-progress (0..100) gets rendered as a bar.
   *  <div data-progress="42">…</div>
   */
  function initProgressBars(root) {
    var nodes = (root || document).querySelectorAll(
      "[data-progress]:not([data-progress-init])"
    );
    nodes.forEach(function (node) {
      var pct = parseFloat(node.getAttribute("data-progress")) || 0;
      pct = Math.min(100, Math.max(0, pct));

      node.setAttribute("data-progress-init", "1");
      node.classList.add("ww-progress");

      var fill = document.createElement("span");
      fill.className = "ww-progress-fill";
      fill.style.width = pct.toFixed(1) + "%";

      var label = document.createElement("span");
      label.className = "ww-progress-label";
      label.textContent = pct.toFixed(0) + "%";

      node.innerHTML = "";
      node.appendChild(fill);
      node.appendChild(label);
    });
  }

  // ----------------- Action button feedback -----------------

  /**
   * Add a brief "pulse" + spinner on click for any .ww-action button
   * inside a form. Helps the player know the click was registered.
   */
  function initActionFeedback(root) {
    var btns = (root || document).querySelectorAll(
      ".ww-action:not([data-action-init])"
    );
    btns.forEach(function (btn) {
      btn.setAttribute("data-action-init", "1");
      btn.addEventListener("click", function () {
        btn.classList.add("ww-action-clicked");
        // Re-enable visual after 600ms.
        setTimeout(function () {
          btn.classList.remove("ww-action-clicked");
        }, 600);
      });
    });

    // Forms that submit to a POST endpoint get a tiny pending overlay.
    var forms = (root || document).querySelectorAll(
      "form[method='post']:not([data-form-init])"
    );
    forms.forEach(function (form) {
      form.setAttribute("data-form-init", "1");
      form.addEventListener("submit", function () {
        form.classList.add("ww-form-pending");
      });
    });
  }

  // ----------------- Public init -----------------

  function refresh(root) {
    initCountdowns(root);
    initProgressBars(root);
    initActionFeedback(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { refresh(); });
  } else {
    refresh();
  }

  // Expose for templates that inject content dynamically.
  window.WW = {
    refresh: refresh,
    formatRemaining: formatRemaining,
  };
})();
