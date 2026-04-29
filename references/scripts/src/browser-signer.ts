import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { spawn } from "child_process";
import { randomBytes } from "crypto";
import type { Address, Hex } from "viem";

export interface SessionMeta {
  presetName: string;
  actions: string[];
  limitAmount: string;
  limitToken: string;
  durationHours: string;
  expiresAt: number;
}

export interface SignRequest {
  title: string;
  description: string;
  tx?: { to: Address; data: Hex; value?: string };
  typedData?: any;
  rawHash?: Hex;
  chainId: number;
  chainName: string;
  connectOnly?: boolean;
  sessionMeta?: SessionMeta;
}

export interface SignResult {
  signer: Address;
  txHash?: Hex;
  signature?: Hex;
}

function openBrowser(url: string) {
  const [command, args] = process.platform === "darwin"
    ? ["open", [url]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => {});
  child.unref();
}

export function requestBrowserSignature(request: SignRequest): Promise<SignResult> {
  return new Promise((resolve, reject) => {
    const nonce = randomBytes(16).toString("hex");
    const app = new Hono();
    let settled = false;
    let timeout: NodeJS.Timeout;
    let server: ReturnType<typeof serve>;

    app.get("/", (context) => {
      if (context.req.query("token") !== nonce) return context.text("Invalid token", 403);
      return context.html(signingPage(request, nonce));
    });
    app.post("/api/result", async (context) => {
      if (context.req.query("token") !== nonce) return context.json({ error: "Invalid token" }, 403);
      const body = await context.req.json<{ signer?: Address; txHash?: Hex; signature?: Hex; error?: string }>();
      if (body.error) reject(new Error(body.error));
      else {
        console.log(request.connectOnly ? "\n  Wallet connected." : "\n  Signed. Submitting to bundler...");
        resolve({ signer: body.signer!, txHash: body.txHash, signature: body.signature });
      }
      settled = true;
      clearTimeout(timeout);
      setTimeout(() => { server.close(); }, 500);
      return context.json({ ok: true });
    });

    const url = `http://127.0.0.1:3000?token=${nonce}`;
    server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3000 }, () => {
      console.log(`\n  Open in your browser: ${url}`);
      console.log("  Waiting for wallet...\n");
      openBrowser(url);
    });

    server.once("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const message = error.code === "EADDRINUSE"
        ? "Local signer port 3000 is already in use. Stop the other process and retry."
        : `Local signer failed: ${error.message}`;
      reject(new Error(message));
    });

    timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Timed out (5 min)"));
      server.close();
    }, 300000);
  });
}

function signingPage(request: SignRequest, nonce: string): string {
  const connectOnly = request.connectOnly ?? false;
  const hasTypedData = !!request.typedData;
  const txJson = request.tx ? JSON.stringify(request.tx) : "null";
  const typedDataJson = hasTypedData
    ? JSON.stringify(request.typedData, (_key, value) => typeof value === "bigint" ? "0x" + value.toString(16) : value)
    : "null";
  const rawHashJson = request.rawHash ? JSON.stringify(request.rawHash) : "null";

  return `<!DOCTYPE html><html><head><title>${request.title}</title><meta charset="utf-8">
<style>body{font-family:system-ui;max-width:520px;margin:60px auto;padding:0 20px;line-height:1.5}
button{padding:14px 28px;font-size:16px;font-weight:600;cursor:pointer;border:none;border-radius:12px;width:100%}
#connect{background:#3b82f6;color:#fff}#sign{background:#10b981;color:#fff;display:none;margin-top:16px}
.status{margin:20px 0;padding:16px;border-radius:12px;text-align:center}
.error{background:#fee2e2;color:#991b1b}.success{background:#d1fae5;color:#065f46}.waiting{background:#fef3c7;color:#92400e}
#wallet-status{text-align:center;color:#666;margin-bottom:16px;font-size:14px}
#session-info{margin-bottom:24px;padding:16px 20px;border-radius:12px;font-size:14px;line-height:1.7;display:none}
#session-info.decoded{background:#f0fdf4;border:1px solid #86efac;color:#14532d}
#session-info.warning{background:#fefce8;border:1px solid #fde047;color:#713f12}
#session-info h3{margin:0 0 8px;font-size:15px}
#session-info ul{margin:4px 0 12px;padding-left:20px}
#session-info .note{font-size:13px;color:#6b7280;margin-top:8px;font-style:italic}</style></head><body>
<h2>${request.title}</h2><p style="color:#666;margin-bottom:32px">${request.description}</p>
<div id="session-info"></div>
<p id="wallet-status">No wallet connected</p><button id="connect">Connect Wallet</button>
<button id="sign">Sign</button><div id="result"></div>
<script type="module">
import{createWalletClient,custom}from'https://esm.sh/viem@2.23.0';
import{base,baseSepolia}from'https://esm.sh/viem@2.23.0/chains';
const TX=${txJson},TYPED_DATA=${typedDataJson},RAW_HASH=${rawHashJson},CONNECT_ONLY=${connectOnly},NONCE='${nonce}',CHAINS={8453:base,84532:baseSepolia},chain=CHAINS[${request.chainId}]||base;
const SESSION_META=${request.sessionMeta ? JSON.stringify(request.sessionMeta) : 'null'};
let wc,account;

(function showSessionInfo(){
  if(!SESSION_META) return;
  const el=document.getElementById('session-info');
  let html='<h3>'+SESSION_META.presetName+'</h3>';
  html+='<p><strong>Allowed actions:</strong></p><ul>';
  for(const a of SESSION_META.actions) html+='<li>'+a+'</li>';
  html+='</ul>';
  html+='<p>Per-transaction limit: '+SESSION_META.limitAmount+' '+SESSION_META.limitToken+' (policy enforced)</p>';
  const exp=new Date(SESSION_META.expiresAt*1000).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
  html+='<p>Duration: '+SESSION_META.durationHours+'h - expires '+exp+' (on-chain enforced)</p>';
  html+='<p class="note">Your wallet will show the raw signing request. The summary above is what you are approving.</p>';
  el.className='decoded';el.style.display='block';el.innerHTML=html;
})();

document.getElementById('connect').onclick=async()=>{if(!window.ethereum){document.getElementById('result').innerHTML='<div class="status error">No wallet found. Install a browser wallet.</div>';return}
wc=createWalletClient({chain,transport:custom(window.ethereum)});[account]=await wc.requestAddresses();
document.getElementById('wallet-status').textContent='Connected: '+account.slice(0,6)+'...'+account.slice(-4);
document.getElementById('connect').style.display='none';
try{await wc.switchChain({id:chain.id})}catch(error){
document.getElementById('result').innerHTML='<div class="status error">Switch to ${request.chainName} in your wallet and retry.</div>';
await fetch('/api/result?token='+NONCE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({error:'Wallet is not connected to ${request.chainName}'})});
return}
if(CONNECT_ONLY){document.getElementById('result').innerHTML='<div class="status success">Wallet connected! You can close this tab.</div>';
await fetch('/api/result?token='+NONCE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signer:account})});return}
document.getElementById('sign').style.display='block'};
document.getElementById('sign').onclick=async()=>{const btn=document.getElementById('sign');
try{btn.disabled=true;btn.textContent='Check your wallet...';
document.getElementById('result').innerHTML='<div class="status waiting">Waiting for wallet...</div>';
let result;
if(RAW_HASH){
  const sig=await wc.signMessage({account,message:{raw:RAW_HASH}});
  result={signer:account,signature:sig};
}else if(TYPED_DATA){
  const sig=await wc.signTypedData({account,...TYPED_DATA});
  result={signer:account,signature:sig};
}else if(TX){
  const hash=await wc.sendTransaction({account,to:TX.to,data:TX.data,value:TX.value?BigInt(TX.value):0n,chain});
  result={signer:account,txHash:hash};
}
document.getElementById('result').innerHTML='<div class="status success">Signed! You can close this tab.</div>';
await fetch('/api/result?token='+NONCE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
btn.textContent='Done'}catch(error){document.getElementById('result').innerHTML='<div class="status error">'+error.message+'</div>';
btn.disabled=false;btn.textContent='Sign';
await fetch('/api/result?token='+NONCE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({error:error.message})})}};
</script></body></html>`;
}
