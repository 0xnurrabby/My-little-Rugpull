import { sdk } from "https://esm.sh/@farcaster/miniapp-sdk";
import { Attribution } from "https://esm.sh/ox/erc8021";

const DOMAIN = "https://my-little-rugpull.vercel.app/";
const HOME_URL = "https://my-little-rugpull.vercel.app/";
const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

// REQUIRED by spec
const BUILDER_CODE = "TODO_REPLACE_BUILDER_CODE";
const RECIPIENT = "0x000000000000000000000000000000000000dEaD";

const dataSuffix = Attribution.toDataSuffix({
  codes: [BUILDER_CODE],
});

const els = {
  connect: document.getElementById("btn-connect"),
  tip: document.getElementById("btn-tip"),
  scan: document.getElementById("btn-scan"),
  next: document.getElementById("btn-next"),
  feed: document.getElementById("btn-feed"),
  pet: document.getElementById("btn-pet"),
  clean: document.getElementById("btn-clean"),
  owner: document.getElementById("owner"),
  petName: document.getElementById("pet-name"),
  petHealth: document.getElementById("pet-health"),
  petLiq: document.getElementById("pet-liq"),
  petPrice: document.getElementById("pet-price"),
  tokenList: document.getElementById("token-list"),
  log: document.getElementById("log"),
  flash: document.getElementById("flash"),
  toast: document.getElementById("toast"),
  miniappState: document.getElementById("miniapp-state"),
  chainState: document.getElementById("chain-state"),
  canvas: document.getElementById("pet-canvas"),
  sheet: document.getElementById("tip-sheet"),
  sheetBackdrop: document.getElementById("tip-backdrop"),
  sheetCancel: document.getElementById("tip-cancel"),
  sheetCta: document.getElementById("tip-cta"),
  sheetCustom: document.getElementById("tip-custom"),
  sheetFoot: document.getElementById("tip-footnote"),
};

let eth = null; // EIP-1193
let address = null;
let chainId = null;

let pets = [];
let activeIndex = 0;
let deathTimer = null;
let priceTimer = null;

const TIP_UI = {
  open: false,
  usdAmount: null,
  state: "idle", // idle | preparing | confirm | sending | done
};

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function log(msg) {
  const t = new Date();
  const stamp = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  els.log.textContent = `[${stamp}] ${msg}\n` + els.log.textContent.slice(0, 2200);
}

function isProbablyChecksumAddress(addr) {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function setMiniAppState(ok) {
  els.miniappState.textContent = ok ? "Mini App context detected" : "Web context detected (still works, but Mini App chrome requires Farcaster host)";
}

function setChainState() {
  const map = {
    "0x2105": "Base Mainnet (0x2105)",
    "0x14a34": "Base Sepolia (0x14a34)",
  };
  els.chainState.textContent = map[chainId] || `Unsupported chain (${chainId || "unknown"})`;
}

function onlyDigitsDot(s) {
  return (s || "").replace(/[^0-9.]/g, "");
}

function parseUsd(s) {
  const cleaned = onlyDigitsDot(String(s)).trim();
  if (!cleaned) return null;
  if ((cleaned.match(/\./g) || []).length > 1) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

function encodeErc20Transfer(to, amountRaw) {
  // selector: a9059cbb
  // data = selector + padded recipient + padded amount
  const selector = "a9059cbb";
  if (!isProbablyChecksumAddress(to)) throw new Error("Invalid recipient address");
  const toNo0x = to.toLowerCase().replace(/^0x/, "");
  const toPadded = toNo0x.padStart(64, "0");
  const amtHex = amountRaw.toString(16);
  const amtPadded = amtHex.padStart(64, "0");
  return "0x" + selector + toPadded + amtPadded;
}

async function getEthProvider() {
  // Prefer Farcaster-hosted provider
  try {
    const p = await sdk.wallet.getEthereumProvider();
    if (p) return p;
  } catch (_) {}
  // Fallback: injected provider (web browser mode)
  if (window.ethereum) return window.ethereum;
  return null;
}

async function connect() {
  eth = await getEthProvider();
  if (!eth) {
    toast("No Ethereum provider found in this environment.");
    return;
  }
  try {
    const accounts = await eth.request({ method: "eth_requestAccounts", params: [] });
    address = accounts?.[0] || null;
    chainId = await eth.request({ method: "eth_chainId", params: [] });
    els.owner.textContent = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
    setChainState();
    if (!address) throw new Error("No account returned");
    log("Wallet connected.");
  } catch (e) {
    log(`Connect canceled or failed: ${e?.message || e}`);
    toast("Connect canceled.");
  }
}

async function ensureBaseMainnet() {
  if (!eth) throw new Error("No provider");
  chainId = await eth.request({ method: "eth_chainId", params: [] });
  if (chainId === "0x2105") return true;
  // Try switch
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] });
    chainId = "0x2105";
    setChainState();
    return true;
  } catch (e) {
    setChainState();
    throw new Error("Please switch to Base Mainnet (0x2105) to send USDC tips.");
  }
}

function seededRandom(seedStr) {
  // xorshift-ish from string
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17; h >>>= 0;
    h ^= h << 5;  h >>>= 0;
    return (h >>> 0) / 4294967296;
  };
}

function buildMysteryPets(owner) {
  const rand = seededRandom(owner.toLowerCase());
  const names = ["ELONCUM","DOGEPOOP","RUGME","HONEYTRAP","VAPOR","MOONWART","PEPE404","LIQUIDN'T","FROGFART","CATRUG"];
  const out = [];
  const count = 6 + Math.floor(rand() * 4);
  for (let i = 0; i < count; i++) {
    const sym = "$" + names[Math.floor(rand()*names.length)];
    const liq = Math.max(100, Math.floor(rand() * 50000));
    const base = rand() * 0.02;
    out.push({
      id: `mystery-${i}`,
      symbol: sym,
      liquidityUsd: liq,
      priceUsd: base,
      alive: true,
      health: 70,
      mood: "??",
      lastCare: Date.now(),
      lastChart: 0,
    });
  }
  return out.sort((a,b)=>a.liquidityUsd-b.liquidityUsd);
}

function renderTokenList() {
  els.tokenList.innerHTML = "";
  pets.forEach((p, idx) => {
    const div = document.createElement("div");
    div.className = "token";
    div.addEventListener("click", () => {
      activeIndex = idx;
      renderPet();
      drawPet();
      log(`Selected ${p.symbol}.`);
    });
    const left = document.createElement("div");
    const sym = document.createElement("div");
    sym.className = "sym";
    sym.textContent = p.symbol;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `liq $${p.liquidityUsd.toLocaleString()} • price $${p.priceUsd.toFixed(6)}`;
    left.appendChild(sym);
    left.appendChild(meta);

    const pill = document.createElement("div");
    pill.className = "pill " + (p.alive ? (p.liquidityUsd < 2500 ? "bad":"good") : "bad");
    pill.textContent = p.alive ? (p.liquidityUsd < 2500 ? "paper-thin":"somewhat real") : "rekt";

    div.appendChild(left);
    div.appendChild(pill);
    els.tokenList.appendChild(div);
  });
}

function activePet() {
  return pets[activeIndex] || null;
}

function renderPet() {
  const p = activePet();
  if (!p) {
    els.petName.textContent = "—";
    els.petHealth.textContent = "—";
    els.petLiq.textContent = "—";
    els.petPrice.textContent = "—";
    return;
  }
  els.petName.textContent = p.alive ? p.symbol : `${p.symbol} (REKT)`;
  els.petHealth.textContent = p.alive ? `${Math.max(0, Math.round(p.health))}%` : "0%";
  els.petLiq.textContent = `$${p.liquidityUsd.toLocaleString()}`;
  els.petPrice.textContent = p.alive ? `$${p.priceUsd.toFixed(6)}` : "$0.000000";
}

function maybeFlash() {
  const r = Math.random();
  els.flash.style.display = r < 0.14 ? "block" : "none";
}

function tickHealth() {
  const p = activePet();
  if (!p || !p.alive) return;
  const now = Date.now();
  const since = now - p.lastCare;
  // decay: ~1% per 8s
  const decay = (since / 8000);
  p.health = Math.max(0, p.health - decay);
  p.lastCare = now;
  // tie to price movement: small effect
  const priceFactor = Math.min(1.6, Math.max(0.25, p.priceUsd / 0.01));
  p.health = Math.max(0, Math.min(100, p.health * (0.985 + 0.015*priceFactor)));
  if (p.health <= 0.5) {
    p.alive = false;
    p.priceUsd = 0;
    log(`${p.symbol} has gone to zero. Tombstone spawned. Rekt.`);
  }
  renderPet();
  drawPet();
}

function randomPriceWalk() {
  pets.forEach((p) => {
    if (!p.alive) return;
    const vol = p.liquidityUsd < 2000 ? 0.28 : 0.12;
    const delta = (Math.random() - 0.5) * vol;
    p.priceUsd = Math.max(0, p.priceUsd * (1 + delta));
    // sudden rug chance rises as liquidity drops
    const rugChance = p.liquidityUsd < 1500 ? 0.04 : 0.012;
    if (Math.random() < rugChance) {
      p.alive = false;
      p.priceUsd = 0;
      p.health = 0;
      log(`${p.symbol} rugpulled itself in the night. Rekt.`);
    }
  });
  renderTokenList();
  renderPet();
  drawPet();
}

function drawPet() {
  const ctx = els.canvas.getContext("2d");
  const w = els.canvas.width, h = els.canvas.height;
  // background
  ctx.fillStyle = "#0b0b0b";
  ctx.fillRect(0,0,w,h);

  // scanlines
  for (let y=0; y<h; y+=4) {
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(0,y,w,1);
  }

  // frame
  ctx.strokeStyle = "rgba(232,232,232,0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(6,6,w-12,h-12);

  const p = activePet();
  ctx.imageSmoothingEnabled = false;

  if (!p) {
    ctx.fillStyle = "#e8e8e8";
    ctx.font = "14px var(--mono)";
    ctx.fillText("NO PETS. HIT SCAN.", 24, 40);
    return;
  }

  // monochrome palette
  const alive = p.alive;
  const base = alive ? 220 : 120;
  const accent = alive ? 170 : 80;

  // monster body
  const bx = 78, by = 62, bw = 164, bh = 130;
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = "#0b0b0b";
  ctx.fillRect(bx+18, by+34, 28, 28);
  ctx.fillRect(bx+bw-46, by+34, 28, 28);

  // pupils glitch
  const jitter = alive ? Math.floor(Math.random()*2) : 0;
  ctx.fillStyle = `rgb(${accent},${accent},${accent})`;
  ctx.fillRect(bx+28+jitter, by+44, 8, 8);
  ctx.fillRect(bx+bw-36-jitter, by+44, 8, 8);

  // mouth
  ctx.fillStyle = "#0b0b0b";
  ctx.fillRect(bx+58, by+86, 48, 10);

  // health bar
  const hp = Math.max(0, Math.min(1, p.health/100));
  ctx.strokeStyle = "rgba(232,232,232,0.25)";
  ctx.strokeRect(18, 208, 284, 14);
  ctx.fillStyle = hp > 0.35 ? "rgba(124,255,124,0.75)" : "rgba(255,107,107,0.75)";
  ctx.fillRect(18, 208, Math.floor(284*hp), 14);

  // tombstone if dead
  if (!alive) {
    ctx.fillStyle = "rgba(255,107,107,0.85)";
    ctx.fillRect(250, 92, 38, 62);
    ctx.fillStyle = "#0b0b0b";
    ctx.font = "10px var(--mono)";
    ctx.fillText("REKT", 254, 126);
  }

  // label
  ctx.fillStyle = "rgba(232,232,232,0.9)";
  ctx.font = "12px var(--mono)";
  ctx.fillText(p.symbol, 18, 34);
}

function nextPet() {
  if (!pets.length) return;
  activeIndex = (activeIndex + 1) % pets.length;
  renderPet();
  drawPet();
}

function care(action) {
  const p = activePet();
  if (!p) {
    toast("Scan first.");
    return;
  }
  if (!p.alive) {
    log(`You ${action} the tombstone. It feels cold.`);
    drawPet();
    return;
  }
  const bonus = action === "feed" ? 14 : action === "pet" ? 8 : 10;
  p.health = Math.min(100, p.health + bonus);
  p.lastCare = Date.now();
  log(action === "feed" ? `You stare at ${p.symbol}'s chart. It gets stronger (somehow).` :
      action === "pet" ? `You pet ${p.symbol}. It emits a cursed chime.` :
      `You clean the cage. The liquidity smell lingers.`);
  renderPet();
  drawPet();
}

function openTipSheet() {
  TIP_UI.open = true;
  TIP_UI.usdAmount = null;
  TIP_UI.state = "idle";
  els.sheetCustom.value = "";
  els.sheetFoot.textContent = "";
  els.sheetCta.textContent = "Send USDC";
  els.sheet.classList.remove("hidden");
}

function closeTipSheet() {
  TIP_UI.open = false;
  els.sheet.classList.add("hidden");
}

function setTipState(state) {
  TIP_UI.state = state;
  if (state === "idle") {
    els.sheetCta.textContent = "Send USDC";
    els.sheetFoot.textContent = "";
    return;
  }
  if (state === "preparing") {
    els.sheetCta.textContent = "Preparing tip…";
    els.sheetFoot.textContent = "Warming up the chain (1–1.5s)…";
    return;
  }
  if (state === "confirm") {
    els.sheetCta.textContent = "Confirm in wallet";
    els.sheetFoot.textContent = "Wallet prompt opening…";
    return;
  }
  if (state === "sending") {
    els.sheetCta.textContent = "Sending…";
    els.sheetFoot.textContent = "Submitting ERC-5792 calls…";
    return;
  }
  if (state === "done") {
    els.sheetCta.textContent = "Send again";
    els.sheetFoot.textContent = "Tip sent. You are now ethically complicit.";
    return;
  }
}

function isBuilderConfigured() {
  if (BUILDER_CODE === "TODO_REPLACE_BUILDER_CODE") return false;
  if (!isProbablyChecksumAddress(RECIPIENT)) return false;
  return true;
}

function selectedUsdAmount() {
  if (TIP_UI.usdAmount != null) return TIP_UI.usdAmount;
  const n = parseUsd(els.sheetCustom.value);
  if (n == null) return null;
  return n;
}

async function sendTip() {
  if (!eth) {
    await connect();
    if (!eth) return;
  }
  if (!address) {
    await connect();
    if (!address) return;
  }
  if (!isBuilderConfigured()) {
    toast("Tip disabled: set BUILDER_CODE (and ensure RECIPIENT is valid).");
    log("Tip blocked: BUILDER_CODE is still TODO, or RECIPIENT invalid.");
    return;
  }

  const usd = selectedUsdAmount();
  if (!usd || usd <= 0) {
    toast("Enter a valid amount.");
    return;
  }

  // convert USD -> USDC base units (6 decimals)
  const units = BigInt(Math.round(usd * 1_000_000));
  if (units <= 0n) {
    toast("Amount too small.");
    return;
  }

  try {
    await ensureBaseMainnet();
  } catch (e) {
    toast(e.message || "Wrong network.");
    log(e.message || String(e));
    return;
  }

  setTipState("preparing");
  els.sheetCta.disabled = true;

  // Pre-transaction UX: animate BEFORE wallet opens (1–1.5 seconds)
  await new Promise((r)=>setTimeout(r, 1250));

  setTipState("confirm");

  const data = encodeErc20Transfer(RECIPIENT, units);

  const req = {
    version: "2.0.0",
    from: address,
    chainId: chainId,
    atomicRequired: true,
    calls: [{
      to: USDC_CONTRACT,
      value: "0x0",
      data,
    }],
    capabilities: {
      dataSuffix,
    },
  };

  try {
    setTipState("sending");
    // ERC-5792: wallet_sendCalls
    const res = await eth.request({ method: "wallet_sendCalls", params: [req] });
    log(`Tip sent (wallet_sendCalls). Response: ${typeof res === "string" ? res : JSON.stringify(res)}`);
    toast("Tip sent.");
    setTipState("done");
  } catch (e) {
    // user rejection handling
    const msg = e?.message || String(e);
    if ((e?.code === 4001) || /rejected/i.test(msg)) {
      toast("Tip canceled.");
      log("User rejected tip confirmation.");
      setTipState("idle");
    } else {
      toast("Tip failed. See log.");
      log(`Tip failed: ${msg}`);
      setTipState("idle");
    }
  } finally {
    els.sheetCta.disabled = false;
  }
}

function bindTipSheet() {
  document.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const usd = Number(btn.getAttribute("data-usd"));
      TIP_UI.usdAmount = usd;
      els.sheetCustom.value = "";
      toast(`Selected $${usd}`);
    });
  });
  els.sheetBackdrop.addEventListener("click", closeTipSheet);
  els.sheetCancel.addEventListener("click", closeTipSheet);
  els.sheetCta.addEventListener("click", async () => {
    if (TIP_UI.state === "done") {
      TIP_UI.state = "idle";
      setTipState("idle");
      return;
    }
    if (TIP_UI.state !== "idle") return;
    await sendTip();
  });
  els.sheetCustom.addEventListener("input", () => {
    TIP_UI.usdAmount = null;
    const n = parseUsd(els.sheetCustom.value);
    if (n == null && els.sheetCustom.value.trim().length) {
      els.sheetFoot.textContent = "Invalid number.";
    } else {
      els.sheetFoot.textContent = "";
    }
  });
}

async function scan() {
  if (!address) {
    toast("Connect first.");
    return;
  }
  // In Mini App contexts, providers vary; many do not expose a token-portfolio API.
  // We ship a deterministic fallback list so the game is always playable.
  pets = buildMysteryPets(address);
  activeIndex = 0;
  renderTokenList();
  renderPet();
  drawPet();
  log(`Shame Scan complete. Found ${pets.length} suspicious creatures.`);
}

function startTimers() {
  window.clearInterval(deathTimer);
  window.clearInterval(priceTimer);
  deathTimer = window.setInterval(() => {
    maybeFlash();
    tickHealth();
  }, 1200);
  priceTimer = window.setInterval(() => {
    randomPriceWalk();
  }, 4500);
}

async function boot() {
  // Mini App detection: if the SDK loads, we are in a host that supports it.
  let miniappOk = false;
  try {
    await sdk.actions.ready();
    miniappOk = true;
  } catch (e) {
    // Still keep the app functional in web contexts, but Mini App chrome depends on host.
  }
  setMiniAppState(miniappOk);
  els.connect.addEventListener("click", connect);
  els.scan.addEventListener("click", scan);
  els.next.addEventListener("click", nextPet);
  els.feed.addEventListener("click", () => care("feed"));
  els.pet.addEventListener("click", () => care("pet"));
  els.clean.addEventListener("click", () => care("clean"));
  els.tip.addEventListener("click", openTipSheet);

  bindTipSheet();
  startTimers();
  drawPet();

  // keep chain label updated
  try {
    eth = await getEthProvider();
    if (eth) {
      chainId = await eth.request({ method: "eth_chainId", params: [] });
      setChainState();
      eth.on?.("chainChanged", (c) => {
        chainId = c;
        setChainState();
      });
      eth.on?.("accountsChanged", (accs) => {
        address = accs?.[0] || null;
        els.owner.textContent = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
      });
    }
  } catch (_) {}

  log("Boot complete.");
}

boot();
