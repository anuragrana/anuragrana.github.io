/* calc-engine.js – shared financial formula engine for Finance Calculators */

var Utils = {
  formatCurrency: function (value) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency", currency: "INR", maximumFractionDigits: 0
    }).format(Math.round(Number(value) || 0));
  },

  formatCompact: function (value) {
    var v = Math.round(Number(value) || 0);
    var sign = v < 0 ? "-" : "";
    var abs = Math.abs(v);
    if (abs >= 1e7) return sign + "₹" + (abs / 1e7).toFixed(2) + " Crore";
    if (abs >= 1e5) return sign + "₹" + (abs / 1e5).toFixed(2) + " Lac";
    return new Intl.NumberFormat("en-IN", {
      style: "currency", currency: "INR", maximumFractionDigits: 0
    }).format(v);
  },

  formatYears: function (months) {
    var y = Math.floor(months / 12);
    var m = Math.round(months % 12);
    if (m === 0) return y + " years";
    if (y === 0) return m + " months";
    return y + "y " + m + "m";
  },

  formatPercent: function (value, decimals) {
    return (Number(value) || 0).toFixed(decimals !== undefined ? decimals : 2) + "%";
  },

  round: function (value, decimals) {
    var factor = Math.pow(10, decimals || 0);
    return Math.round((Number(value) || 0) * factor) / factor;
  },

  readNumber: function (id) {
    return Number(document.getElementById(id).value);
  },

  validateRange: function (label, value, min, max) {
    if (!Number.isFinite(value)) return label + " must be a valid number.";
    if (value < min) return label + " must be at least " + min + ".";
    if (value > max) return label + " must be at most " + max + ".";
    return "";
  },

  /* Inject a live compact-value hint below each input[data-hint="currency"] */
  initHints: function (form) {
    form.querySelectorAll("input[data-hint='currency']").forEach(function (input) {
      var hint = document.createElement("p");
      hint.className = "mt-1 min-h-[1rem] text-xs text-slate-400 dark:text-slate-500";
      hint.setAttribute("aria-hidden", "true");
      input.parentNode.insertBefore(hint, input.nextSibling);
      function update() {
        var val = parseFloat(input.value);
        hint.textContent = (!isNaN(val) && Math.abs(val) >= 1000) ? Utils.formatCompact(val) : "";
      }
      input.addEventListener("input", update);
      update();
    });
  }
};

var Calc = {
  /* SIP future value */
  sipFV: function (monthly, annualRate, years) {
    var n = Math.round(years * 12);
    var r = annualRate / 12 / 100;
    if (n <= 0) return 0;
    if (r === 0) return monthly * n;
    return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  },

  /* Monthly SIP required to reach target */
  sipRequired: function (target, annualRate, years) {
    var n = Math.round(years * 12);
    var r = annualRate / 12 / 100;
    if (n <= 0) return 0;
    if (r === 0) return target / n;
    return target * r / ((Math.pow(1 + r, n) - 1) * (1 + r));
  },

  /* EMI */
  emi: function (principal, annualRate, months) {
    var r = annualRate / 12 / 100;
    if (months <= 0) return 0;
    if (r === 0) return principal / months;
    var pow = Math.pow(1 + r, months);
    return principal * r * pow / (pow - 1);
  },

  /* Full amortization schedule */
  amortization: function (principal, annualRate, months) {
    var r = annualRate / 12 / 100;
    var emiAmt = Calc.emi(principal, annualRate, months);
    var schedule = [];
    var balance = principal;
    for (var m = 1; m <= months; m++) {
      var interest = balance * r;
      var princ = emiAmt - interest;
      balance = Math.max(0, balance - princ);
      schedule.push({ month: m, emi: emiAmt, principal: princ, interest: interest, balance: balance });
    }
    return schedule;
  },

  /* CAGR % */
  cagr: function (initial, final, years) {
    if (initial <= 0 || years <= 0) return 0;
    return (Math.pow(final / initial, 1 / years) - 1) * 100;
  },

  /* Lumpsum future value */
  lumpsumFV: function (amount, cagrPct, years) {
    return amount * Math.pow(1 + cagrPct / 100, years);
  },

  /* Inflation-adjusted future cost */
  inflationFV: function (amount, inflationPct, years) {
    return amount * Math.pow(1 + inflationPct / 100, years);
  },

  /* Step-up SIP corpus (month-by-month for accuracy) */
  stepUpSipFV: function (monthly, stepUpPct, annualReturn, years) {
    var r = annualReturn / 12 / 100;
    var g = stepUpPct / 100;
    var corpus = 0;
    var n = Math.round(years * 12);
    for (var m = 1; m <= n; m++) {
      var yearIdx = Math.floor((m - 1) / 12);
      corpus = corpus * (1 + r) + monthly * Math.pow(1 + g, yearIdx);
    }
    return corpus;
  },

  stepUpSipInvested: function (monthly, stepUpPct, years) {
    var total = 0;
    for (var y = 0; y < Math.round(years); y++) {
      total += monthly * Math.pow(1 + stepUpPct / 100, y) * 12;
    }
    return total;
  },

  /* SWP longevity in months (exact formula) */
  swpMonths: function (corpus, monthlyWithdrawal, annualReturn) {
    if (monthlyWithdrawal <= 0) return Infinity;
    var r = annualReturn / 12 / 100;
    if (r === 0) return corpus / monthlyWithdrawal;
    var ratio = corpus * r / monthlyWithdrawal;
    if (ratio >= 1) return Infinity;
    return -Math.log(1 - ratio) / Math.log(1 + r);
  },

  /* SWP balance after n months */
  swpBalance: function (corpus, monthlyWithdrawal, annualReturn, months) {
    var r = annualReturn / 12 / 100;
    if (r === 0) return Math.max(0, corpus - monthlyWithdrawal * months);
    var n = months;
    return corpus * Math.pow(1 + r, n) - monthlyWithdrawal * ((Math.pow(1 + r, n) - 1) / r);
  },

  /* Loan prepayment analysis */
  prepayment: function (outstanding, annualRate, existingEmi, extraPayment) {
    var r = annualRate / 12 / 100;
    function tenureMonths(P, emi, rate) {
      if (rate === 0) return Math.ceil(P / emi);
      if (emi <= P * rate) return Infinity;
      return Math.ceil(-Math.log(1 - P * rate / emi) / Math.log(1 + rate));
    }
    function totalInterest(P, emi, rate, maxM) {
      var bal = P, interest = 0;
      for (var m = 0; m < maxM && bal > 0.5; m++) {
        var intAmt = bal * rate;
        interest += intAmt;
        bal -= (emi - intAmt);
      }
      return interest;
    }
    var origMonths = tenureMonths(outstanding, existingEmi, r);
    var newMonths = tenureMonths(outstanding, existingEmi + extraPayment, r);
    if (!isFinite(origMonths) || origMonths > 600) return null;
    var origInterest = totalInterest(outstanding, existingEmi, r, origMonths);
    var newInterest = totalInterest(outstanding, existingEmi + extraPayment, r, newMonths);
    return {
      origMonths: origMonths,
      newMonths: newMonths,
      savedMonths: origMonths - newMonths,
      interestSaved: origInterest - newInterest,
      newPayoffDate: newMonths
    };
  },

  /* FIRE corpus (real-return SWR method) */
  fireCorpus: function (monthlyExpenses, annualReturn, inflationPct) {
    var realReturn = Math.max(0.5, annualReturn - inflationPct);
    return (monthlyExpenses * 12) / (realReturn / 100);
  },

  /* Months to reach FIRE target */
  fireMonths: function (target, currentSavings, monthlyInvestment, annualReturn) {
    var r = annualReturn / 12 / 100;
    var balance = currentSavings;
    if (balance >= target) return 0;
    for (var m = 1; m <= 1200; m++) {
      balance = balance * (1 + r) + monthlyInvestment;
      if (balance >= target) return m;
    }
    return Infinity;
  }
};

/* PageSharer – screenshots the full calculator page (inputs + results) and shares/downloads it */
var PageSharer = {
  _SVG: '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share as Image',

  share: function () {
    var btn = document.getElementById("imgShareBtn");
    var self = this;
    if (btn) { btn.textContent = "Generating…"; btn.disabled = true; }

    function restore() { if (btn) { btn.innerHTML = self._SVG; btn.disabled = false; } }

    function doCapture() {
      html2canvas(document.querySelector("main"), { scale: 2, useCORS: true, logging: false, backgroundColor: null })
        .then(function (canvas) {
          restore();
          var dataUrl = canvas.toDataURL("image/png");
          var title = document.title.replace(/\s*\|.*$/, "").trim();
          var fname = title.replace(/\s+/g, "-").toLowerCase() + ".png";
          canvas.toBlob(function (blob) {
            var file = new File([blob], fname, { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              navigator.share({ files: [file], title: title })
                .catch(function (e) { if (e.name !== "AbortError") self._showModal(dataUrl, fname); });
            } else {
              self._showModal(dataUrl, fname);
            }
          }, "image/png");
        })
        .catch(restore);
    }

    if (typeof html2canvas !== "undefined") {
      doCapture();
    } else {
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      s.onload = doCapture;
      s.onerror = restore;
      document.head.appendChild(s);
    }
  },

  _showModal: function (dataUrl, fname) {
    var overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;";

    var img = document.createElement("img");
    img.src = dataUrl;
    img.style.cssText = "max-width:100%;max-height:72vh;border-radius:8px;object-fit:contain;";
    img.setAttribute("alt", "Calculator results");

    /* hint shown on touch devices (WebView / mobile) */
    var isTouchDevice = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
    var hint = document.createElement("p");
    hint.textContent = isTouchDevice ? "Long-press image → Save / Share" : "Right-click image to copy or save";
    hint.style.cssText = "color:rgba(255,255,255,0.65);margin-top:12px;font-size:13px;text-align:center;font-family:sans-serif;";

    var dlLink = document.createElement("a");
    dlLink.href = dataUrl;
    dlLink.download = fname;
    dlLink.textContent = "Download PNG";
    dlLink.style.cssText = "display:inline-block;margin-top:14px;background:#0f766e;color:#fff;padding:10px 28px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;font-family:sans-serif;";

    var closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText = "margin-top:10px;background:transparent;color:rgba(255,255,255,0.55);padding:8px 20px;border-radius:6px;font-size:13px;border:1px solid rgba(255,255,255,0.2);cursor:pointer;font-family:sans-serif;";

    function close() { document.body.removeChild(overlay); }
    closeBtn.onclick = close;
    overlay.onclick = function (e) { if (e.target === overlay) close(); };

    overlay.appendChild(img);
    overlay.appendChild(hint);
    overlay.appendChild(dlLink);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
  }
};

/* Stepper – wires up [data-step] buttons to their target inputs */
var Stepper = {
  init: function (form) {
    form.querySelectorAll("[data-step]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = document.getElementById(this.dataset.target);
        if (!input) return;
        var step = parseFloat(this.dataset.step);
        var current = parseFloat(input.value) || 0;
        var min = parseFloat(input.min);
        var max = parseFloat(input.max);
        /* Integer arithmetic to avoid floating-point drift (e.g. 0.1+0.2=0.300...04) */
        var dec = (step.toString().split(".")[1] || "").length;
        var factor = Math.pow(10, dec);
        var newVal = Math.round(current * factor + step * factor) / factor;
        if (isFinite(min)) newVal = Math.max(min, newVal);
        if (isFinite(max)) newVal = Math.min(max, newVal);
        input.value = newVal;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  }
};
