import React, {useEffect, useState} from 'react';
export const supabase = typeof window !== 'undefined' && window.supabase
 ? window.supabase.createClient('https://kyhsljmjibzlgomgmmkn.supabase.co', 'sb_publishable_u0qrF7ZGzWc2e6WMNzPhyw_VOTUPdMx') : null;
const panel={maxWidth:460,margin:'12vh auto',padding:28,fontFamily:'sans-serif',lineHeight:1.6,color:'#1B2B4B',background:'#fff',border:'1px solid #E2DDD6',borderRadius:12};
const field={display:'block',width:'100%',padding:10,margin:'8px 0 18px',boxSizing:'border-box'};
const button={padding:'10px 16px',margin:'8px 8px 0 0',cursor:'pointer'};
export function AccountScreen({recovery=false,onRecovered=()=>{}}) {
 const [mode,setMode]=useState(recovery?'password':'signin');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){
  e.preventDefault(); if(busy||!supabase)return;setBusy(true);setMessage('');
  try {
   let result;
   if(mode==='reset') {
    result=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+'/?reset=1'});
   } else if(mode==='password') {
    if(password!==confirm)throw Error('Passwords do not match.');
    result=await supabase.auth.updateUser({password});
   } else if(mode==='signup') result=await supabase.auth.signUp({email:email.trim(),password});
   else result=await supabase.auth.signInWithPassword({email:email.trim(),password});
   if(result.error)throw result.error;
   if(mode==='reset')setMessage('If this address can receive a reset email, check your inbox for the link.');
   if(mode==='signup')setMessage('Check your email if confirmation is required, then sign in. Creating an account does not grant product access.');
   if(mode==='password') {window.history.replaceState(null,'',window.location.pathname);onRecovered();}
  }catch(e){setMessage(e.message||'Unable to complete this request. Please try again.');}
  finally{setBusy(false);}
 }
 return <form style={panel} onSubmit={submit}><h1>Polaris Parenting Project</h1>
 <h2>{mode==='password'?'Set your password':mode==='reset'?'Reset your password':mode==='signup'?'Create your account':'Sign in'}</h2>
 {mode!=='password'&&<label>Email<input style={field} type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>}
 {mode!=='reset'&&<label>Password<input style={field} type="password" autoComplete={mode==='signin'?'current-password':'new-password'} minLength={mode==='signin'?undefined:12} value={password} onChange={e=>setPassword(e.target.value)} required /></label>}
 {mode==='password'&&<label>Confirm password<input style={field} type="password" autoComplete="new-password" minLength={12} value={confirm} onChange={e=>setConfirm(e.target.value)} required /></label>}
 <p role="status">{message}</p><button style={button} disabled={busy} type="submit">{busy?'Please wait…':mode==='password'?'Save password':mode==='reset'?'Send reset link':mode==='signup'?'Create account':'Sign in'}</button>
 {!recovery&&<><button style={button} type="button" onClick={()=>{setMode(mode==='reset'?'signin':'reset');setMessage('');setPassword('');}}>{mode==='reset'?'Back to sign in':'Forgot password?'}</button><button style={button} type="button" onClick={()=>{setMode(mode==='signup'?'signin':'signup');setMessage('');setPassword('');}}>{mode==='signup'?'Back to sign in':'Create account'}</button></>}
 <p>Help: <a href="mailto:support@polarisparentingproject.com">support@polarisparentingproject.com</a></p></form>;
}
export default function AccessGate({product,children}) {
 const [user,setUser]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState('');
 const [recovery,setRecovery]=useState(()=>new URLSearchParams(window.location.search).has('reset') || /type=(recovery|invite)/.test(window.location.hash));
 const [access,setAccess]=useState(null),[,setTick]=useState(0);
 useEffect(()=>{
  if(!supabase)return;
  let alive=true;
  supabase.auth.getSession().then(({data,error})=>{if(alive){if(error)setError('Unable to check your login. Reload to retry.');setUser(data?.session?.user||null);setReady(true);}}).catch(()=>{if(alive){setError('Unable to connect. Reload to retry.');setReady(true);}});
  const {data}=supabase.auth.onAuthStateChange((event,session)=>{if(alive){setUser(session?.user||null);setAccess(null);if(event==='PASSWORD_RECOVERY')setRecovery(true);}});
  return ()=>{alive=false;data.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{
  if(!user||recovery||!supabase)return;
  let alive=true,serial=0;
  async function refresh(){const request=++serial;try{
   const {data,error}=await supabase.rpc('product_access',{requested_product:product});
   if(!alive||request!==serial)return;
   if(error||!data||typeof data.allowed!=='boolean'||!Number.isFinite(Date.parse(data.server_now)))throw Error();
   const ttl=data.expires_at===null?null:Date.parse(data.expires_at)-Date.parse(data.server_now);
   if(ttl!==null&&!Number.isFinite(ttl))throw Error();
   setAccess({...data,userId:user.id,deadline:ttl===null?null:performance.now()+Math.max(0,ttl)});setError('');
  }catch(e){if(alive&&request===serial){setAccess(null);setError('Unable to verify access. Reload to retry. Your saved work has not been deleted.');}}}
  refresh(); const interval=setInterval(refresh,30000); const tickTimer=setInterval(()=>setTick(x=>x+1),500);
  window.addEventListener('focus',refresh);
  return ()=>{alive=false;clearInterval(interval);clearInterval(tickTimer);window.removeEventListener('focus',refresh);};
 },[user?.id,product,recovery]);
 if(!supabase)return <div style={panel} role="alert">Connection unavailable. Reload this page to sign in.</div>;
 if(!ready)return <div style={panel}>Checking your login…</div>;
 if(error)return <div style={panel} role="alert">{error}</div>;
 if(!user)return <AccountScreen />;
 if(recovery)return <AccountScreen recovery onRecovered={()=>setRecovery(false)} />;
 if(!access||access.userId!==user.id)return <div style={panel}>Checking product access…</div>;
 if(!access.allowed||(access.deadline!==null&&performance.now()>=access.deadline))return <div style={panel}><h1>Access unavailable</h1><p>Your access may have ended or may not yet be enabled. Saved work has not been deleted.</p><p>Contact support@polarisparentingproject.com for help.</p><button style={button} onClick={()=>supabase.auth.signOut()}>Sign out</button></div>;
 return <React.Fragment key={user.id}>{access.expires_at&&<div role="status" style={{padding:10,textAlign:'center'}}>Complimentary access through {new Date(access.expires_at).toLocaleString()}.</div>}{React.cloneElement(children,{verifiedUser:user})}</React.Fragment>;
}
