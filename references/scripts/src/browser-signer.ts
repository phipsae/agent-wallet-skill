import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { exec } from "child_process";
import { randomBytes } from "crypto";
import type { Address, Hex } from "viem";

export interface SessionMeta {
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

export function requestBrowserSignature(request: SignRequest): Promise<SignResult> {
  return new Promise((resolve, reject) => {
    const nonce = randomBytes(16).toString("hex");
    const app = new Hono();
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
      clearTimeout(timeout);
      setTimeout(() => { server.close(); }, 500);
      return context.json({ ok: true });
    });

    const url = `http://localhost:3000?token=${nonce}`;
    const server = serve({ fetch: app.fetch, port: 3000 }, () => {
      console.log(`\n  Open in your browser: ${url}`);
      console.log("  Waiting for wallet...\n");
      const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      exec(`${command} ${url}`);
    });

    const timeout = setTimeout(() => { reject(new Error("Timed out (5 min)")); server.close(); }, 300000);
  });
}

function signingPage(request: SignRequest, nonce: string): string {
  const connectOnly = request.connectOnly ?? false;
  const hasTypedData = !!request.typedData;
  const txJson = request.tx ? JSON.stringify(request.tx) : "null";
  const typedDataJson = hasTypedData
    ? JSON.stringify(request.typedData, (_key, value) => typeof value === "bigint" ? "0x" + value.toString(16) : value)
    : "null";

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
const TX=${txJson},TYPED_DATA=${typedDataJson},CONNECT_ONLY=${connectOnly},NONCE='${nonce}',CHAINS={8453:base,84532:baseSepolia},chain=CHAINS[${request.chainId}]||base;
const SESSION_META=${request.sessionMeta ? JSON.stringify(request.sessionMeta) : 'null'};
let wc,account;

(function decodeSession(){
  if(!TYPED_DATA) return;
  const raw=TYPED_DATA.message?.callData||JSON.stringify(TYPED_DATA);
  const cd=raw.toLowerCase().replace(/0x/g,'');
  if(!cd.includes('e9ae5c53')&&!cd.includes('ad568b3f')) return;
  const el=document.getElementById('session-info');
  const ADDR={'833589fcd6edb6e08f4c7c32d4f71b54bda02913':'USDC',
    '4200000000000000000000000000000000000006':'WETH',
    '50c5725949a6f0c72e6c4a641f24049a917db0cb':'DAI',
    '2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22':'cbETH',
    '2626664c2603336e57b271c5c0b26f421741e481':'Uniswap V3 Router',
    'a238dd80c259a72e81d7e4664a9801593f98d1c5':'Aave V3 Pool'};
  const SEL={'a9059cbb':'transfer','095ea7b3':'approve',
    '04e45aaf':'swap (exactInputSingle)','617ba037':'supply'};
  const SPENDING_POLICY='00000088d48cf102a8cdb0137a9b173f957c6343';
  const tokens=[],protocols=[],funcs=[];
  for(const[a,n]of Object.entries(ADDR)){
    if(!cd.includes(a))continue;
    if(['USDC','WETH','DAI','cbETH'].includes(n))tokens.push(n);
    else protocols.push(n);
  }
  for(const[s,n]of Object.entries(SEL)){if(cd.includes(s))funcs.push(n);}
  const hasLimit=cd.includes(SPENDING_POLICY);
  if(!tokens.length&&!protocols.length&&!funcs.length){
    el.className='warning';el.style.display='block';
    el.innerHTML='<h3>Could not decode calldata</h3><p>Review the raw data in the wallet carefully before signing.</p>';
    return;
  }
  let html='<h3>This session key will be able to:</h3><ul>';
  for(const f of funcs){
    if(f==='approve'&&tokens.length&&protocols.length){
      html+='<li>Approve '+tokens.join(', ')+' for '+protocols.join(', ')+'</li>';
    }else if(f==='transfer'&&tokens.length){
      html+='<li>Transfer '+tokens.join(', ')+'</li>';
    }else if((f==='swap (exactInputSingle)'||f==='supply')&&protocols.length){
      html+='<li>'+f.charAt(0).toUpperCase()+f.slice(1)+' on '+protocols.join(', ')+'</li>';
    }else{
      html+='<li>'+f.charAt(0).toUpperCase()+f.slice(1)+'</li>';
    }
  }
  html+='</ul>';
  if(hasLimit){
    if(SESSION_META)html+='<p>Spending limit: '+SESSION_META.limitAmount+' '+SESSION_META.limitToken+' (on-chain enforced)</p>';
    else html+='<p>On-chain spending limit enforced</p>';
  }
  if(SESSION_META){
    const exp=new Date(SESSION_META.expiresAt*1000).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
    html+='<p>Duration: '+SESSION_META.durationHours+'h - expires '+exp+' (on-chain enforced)</p>';
  }else{
    html+='<p>Time-limited session (on-chain enforced)</p>';
  }
  html+='<p class="note">Your wallet will show raw hex calldata. The summary above is what you are actually approving.</p>';
  el.className='decoded';el.style.display='block';el.innerHTML=html;
})();

document.getElementById('connect').onclick=async()=>{if(!window.ethereum){document.getElementById('result').innerHTML='<div class="status error">No wallet found. Install a browser wallet.</div>';return}
wc=createWalletClient({chain,transport:custom(window.ethereum)});[account]=await wc.requestAddresses();
document.getElementById('wallet-status').textContent='Connected: '+account.slice(0,6)+'...'+account.slice(-4);
document.getElementById('connect').style.display='none';
try{await wc.switchChain({id:chain.id})}catch{}
if(CONNECT_ONLY){document.getElementById('result').innerHTML='<div class="status success">Wallet connected! You can close this tab.</div>';
await fetch('/api/result?token='+NONCE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signer:account})});return}
document.getElementById('sign').style.display='block'};
document.getElementById('sign').onclick=async()=>{const btn=document.getElementById('sign');
try{btn.disabled=true;btn.textContent='Check your wallet...';
document.getElementById('result').innerHTML='<div class="status waiting">Waiting for wallet...</div>';
let result;
if(TYPED_DATA){
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
