/* Cancele Social Media - frontend for GitHub Pages + Supabase
   Security depends on the RLS policies in supabase-schema.sql. */
(() => {
  "use strict";
  const cfg = window.CANCELE_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("YOUR_") && !cfg.SUPABASE_ANON_KEY.includes("YOUR_") &&
    window.supabase && window.supabase.createClient;
  const db = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = (id) => document.getElementById(id);
  const state = { user:null, profile:null, authMode:"login", view:"feed", activeCommentPost:null, activeChat:null, profiles:[], friends:[], liked:new Set(), posts:[], listings:[], admin:false };
  const views = ["feed","profile","friends","messages","marketplace","admin"];
  const escapeHTML = (s="") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const initials = (s="C") => escapeHTML(s.trim().slice(0,1).toUpperCase() || "C");
  const niceDate = (s) => { try { return new Date(s).toLocaleString([], {dateStyle:"medium",timeStyle:"short"}); } catch { return ""; } };
  const toast = (msg) => { const el=$("toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3000); };
  const errMsg = (e) => e?.message || String(e || "Something went wrong");
  const requireLogin = () => { if(!state.user){ toast("Please log in or create an account first."); $("authPanel").scrollIntoView({behavior:"smooth"}); return false; } return true; };
  const avatar = (profile, cls="avatar") => `<div class="${cls}">${profile?.avatar_url ? `<img src="${escapeHTML(profile.avatar_url)}" alt="">` : initials(profile?.display_name || profile?.email || "C")}</div>`;
  const money = (v) => new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR",maximumFractionDigits:2}).format(Number(v)||0);
  async function uploadFile(file, folder) {
    if(!file || !db || !state.user) return null;
    if(file.size > 30*1024*1024) throw new Error("Files must be 30 MB or smaller.");
    if(!/^(image\/|video\/)/.test(file.type) && folder!=="avatars") throw new Error("Choose an image or video file.");
    if(folder==="avatars" && !file.type.startsWith("image/")) throw new Error("Choose an image for your profile.");
    const ext=(file.name.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"");
    const path=`${state.user.id}/${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const {error}=await db.storage.from("cancele-media").upload(path,file,{upsert:false,contentType:file.type});
    if(error) throw error;
    const {data}=db.storage.from("cancele-media").getPublicUrl(path);
    return data.publicUrl;
  }
  async function loadProfile() {
    if(!state.user) { state.profile=null; return; }
    let {data,error}=await db.from("profiles").select("*").eq("id",state.user.id).maybeSingle();
    if(error) throw error;
    if(!data) {
      const candidate={id:state.user.id,display_name:state.user.user_metadata?.display_name || state.user.email?.split("@")[0] || "Cancele Member"};
      const res=await db.from("profiles").upsert(candidate).select().single();
      if(res.error) throw res.error; data=res.data;
    }
    state.profile=data; state.admin=!!data.is_admin;
  }
  function updateChrome() {
    const p=state.profile;
    $("authPanel").classList.toggle("hidden",!!state.user);
    $("signOutBtn").classList.toggle("hidden",!state.user);
    $("accountName").textContent=p?.display_name || state.user?.email || "Guest";
    $("userBadge").innerHTML=p?.avatar_url?`<img src="${escapeHTML(p.avatar_url)}" alt="">`:initials(p?.display_name || "G");
    $("sideName").textContent=p?.display_name || "Welcome to Cancele";
    $("sideHandle").textContent=p?.bio || (state.user?"Member of Cancele":"Connect • Share • Grow");
    $("sideAvatar").innerHTML=p?.avatar_url?`<img src="${escapeHTML(p.avatar_url)}" alt="">`:initials(p?.display_name || "C");
    $("composerAvatar").innerHTML=p?.avatar_url?`<img src="${escapeHTML(p.avatar_url)}" alt="">`:initials(p?.display_name || "C");
    $("profileAvatar").innerHTML=p?.avatar_url?`<img src="${escapeHTML(p.avatar_url)}" alt="">`:initials(p?.display_name || "C");
    $("profileName").textContent=p?.display_name || "Your profile";
    $("profileEmail").textContent=state.user?.email || "";
    $("profileDisplayName").value=p?.display_name || "";
    $("profileBio").value=p?.bio || "";
    $("adminNav").hidden=!state.admin;
    $("postForm").querySelector("button[type=submit]").disabled=!state.user;
    $("postText").placeholder=state.user?"What's on your mind? Share something good...":"Log in to share a post.";
  }
  function showView(name) {
    if(name==="admin" && !state.admin) { toast("Admin access is restricted."); name="feed"; }
    state.view=name;
    views.forEach(v=>$(v+"View").classList.toggle("hidden",v!==name));
    document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
    document.querySelectorAll(".side-link").forEach(b=>b.classList.toggle("selected",b.dataset.view===name));
    if(name==="feed") loadFeed();
    if(name==="profile") loadMyPosts();
    if(name==="friends") loadFriends();
    if(name==="messages") loadMessagePeople();
    if(name==="marketplace") loadListings();
    if(name==="admin") loadAdminPosts();
  }
  async function loadFeed() {
    if(!db) { $("feedList").innerHTML='<div class="panel empty">Add your Supabase URL and publishable/anon key to start using Cancele.</div>'; return; }
    $("feedStatus").textContent="Loading community posts…";
    let q=db.from("posts").select("id,user_id,content,media_url,media_type,created_at,profiles(id,display_name,avatar_url)").order("created_at",{ascending:false}).limit(50);
    const {data,error}=await q;
    if(error){$("feedStatus").textContent=errMsg(error);$("feedList").innerHTML='<div class="panel empty">Could not load posts. Check your Supabase setup and SQL policies.</div>';return;}
    state.posts=data||[];
    if(state.user && state.posts.length) {
      const ids=state.posts.map(p=>p.id);
      const r=await db.from("likes").select("post_id").eq("user_id",state.user.id).in("post_id",ids);
      state.liked=new Set((r.data||[]).map(x=>x.post_id));
    }
    $("feedStatus").textContent=state.posts.length?`${state.posts.length} recent posts`:"Be the first to share something with your community.";
    $("feedList").innerHTML=state.posts.length?state.posts.map(renderPost).join(""):'<div class="panel empty">No posts yet. Be the first to publish something.</div>';
  }
  function renderPost(p, admin=false) {
    const profile=p.profiles||{};
    const media=p.media_url? (p.media_type?.startsWith("video/")?`<video class="post-media" src="${escapeHTML(p.media_url)}" controls playsinline></video>`:`<img class="post-media" src="${escapeHTML(p.media_url)}" alt="Post attachment" loading="lazy">`):"";
    const liked=state.liked.has(p.id);
    return `<article class="panel post-card" data-post="${p.id}"><div class="post-head">${avatar(profile)}<div class="post-author"><b>${escapeHTML(profile.display_name||"Cancele member")}</b><small>${escapeHTML(niceDate(p.created_at))}</small></div>${(state.user?.id===p.user_id||admin)?`<button class="quiet ${admin?"admin-delete":""}" data-action="delete-post" data-id="${p.id}" title="Delete post">⋯</button>`:""}</div><div class="post-body">${escapeHTML(p.content||"")}</div>${media}<div class="post-stats"><span>♥ <span class="like-count">${p.like_count??""}</span> Likes</span><span><button class="quiet" data-action="comments" data-id="${p.id}">Comments</button></span></div><div class="post-actions"><button class="action-btn ${liked?"liked":""}" data-action="like" data-id="${p.id}">${liked?"♥ Liked":"♡ Like"}</button><button class="action-btn" data-action="comments" data-id="${p.id}">▢ Comment</button><button class="action-btn" data-action="share" data-id="${p.id}">↗ Share</button></div></article>`;
  }
  async function refreshSinglePost(postId) {
    const {data}=await db.from("posts").select("id,user_id,content,media_url,media_type,created_at,profiles(id,display_name,avatar_url)").eq("id",postId).maybeSingle();
    if(data) { const i=state.posts.findIndex(p=>p.id===postId); if(i>=0)state.posts[i]=data; }
  }
  async function publishPost(e) {
    e.preventDefault(); if(!requireLogin())return;
    const content=$("postText").value.trim(), file=$("postMedia").files[0];
    if(!content&&!file){toast("Write something or attach a photo/video.");return;}
    const btn=$("postForm").querySelector('button[type="submit"]'); btn.disabled=true;
    try {
      let media_url=null; if(file)media_url=await uploadFile(file,"posts");
      const {error}=await db.from("posts").insert({user_id:state.user.id,content,media_url,media_type:file?.type||null});
      if(error)throw error;
      $("postText").value="";$("postMedia").value="";$("mediaName").textContent="";
      toast("Your post is live."); await loadFeed();
    } catch(e){toast(errMsg(e));} finally {btn.disabled=false;}
  }
  async function loadMyPosts() {
    if(!db||!state.user){$("myPosts").innerHTML='<div class="panel empty">Log in to view your posts.</div>';return;}
    const {data,error}=await db.from("posts").select("id,user_id,content,media_url,media_type,created_at,profiles(id,display_name,avatar_url)").eq("user_id",state.user.id).order("created_at",{ascending:false}).limit(50);
    $("myPosts").innerHTML=error?`<div class="panel empty">${escapeHTML(errMsg(error))}</div>`:(data?.length?data.map(renderPost).join(""):'<div class="panel empty">You have not posted yet.</div>');
  }
  async function handlePostAction(e) {
    const b=e.target.closest("[data-action]"); if(!b)return;
    const id=b.dataset.id, action=b.dataset.action;
    if(action==="share"){const url=location.href.split("#")[0]+`#post-${id}`;try{await navigator.clipboard.writeText(url);toast("Post link copied.");}catch{toast(url);}return;}
    if(!requireLogin())return;
    if(action==="like"){
      const was=state.liked.has(id);
      const result=was?await db.from("likes").delete().eq("post_id",id).eq("user_id",state.user.id):await db.from("likes").insert({post_id:id,user_id:state.user.id});
      if(result.error){toast(errMsg(result.error));return;}
      was?state.liked.delete(id):state.liked.add(id);
      const card=b.closest(".post-card"); b.classList.toggle("liked",!was); b.textContent=was?"♡ Like":"♥ Liked";
      const countEl=card.querySelector(".like-count"); const count=Number(countEl.textContent||0)+(was?-1:1); countEl.textContent=Math.max(0,count); return;
    }
    if(action==="comments"){state.activeCommentPost=id;$("commentsDialog").showModal();await loadComments(id);return;}
    if(action==="delete-post"){
      if(!confirm("Delete this post? This cannot be undone."))return;
      const result=await db.from("posts").delete().eq("id",id);
      if(result.error){toast(errMsg(result.error));return;}
      toast("Post deleted.");await loadFeed();if(state.view==="profile")await loadMyPosts();if(state.view==="admin")await loadAdminPosts();
    }
  }
  async function loadComments(id) {
    $("commentsList").innerHTML='<div class="empty">Loading comments…</div>';
    const {data,error}=await db.from("comments").select("id,content,created_at,profiles(display_name)").eq("post_id",id).order("created_at",{ascending:true}).limit(100);
    $("commentsList").innerHTML=error?`<div class="empty">${escapeHTML(errMsg(error))}</div>`:data?.length?data.map(c=>`<div class="comment"><b>${escapeHTML(c.profiles?.display_name||"Member")}</b>${escapeHTML(c.content)}<small>${escapeHTML(niceDate(c.created_at))}</small></div>`).join(""):'<div class="empty">No comments yet.</div>';
  }
  async function submitComment(e) {
    e.preventDefault();if(!requireLogin())return;const content=$("commentText").value.trim();if(!content)return;
    const {error}=await db.from("comments").insert({post_id:state.activeCommentPost,user_id:state.user.id,content});
    if(error){toast(errMsg(error));return;} $("commentText").value="";await loadComments(state.activeCommentPost);toast("Comment added.");
  }
  async function saveProfile(e) {
    e.preventDefault();if(!requireLogin())return;
    try {
      const file=$("profilePhoto").files[0];let avatar_url=state.profile?.avatar_url||null;if(file)avatar_url=await uploadFile(file,"avatars");
      const {data,error}=await db.from("profiles").update({display_name:$("profileDisplayName").value.trim(),bio:$("profileBio").value.trim(),avatar_url}).eq("id",state.user.id).select().single();
      if(error)throw error;state.profile=data;updateChrome();$("profileMessage").textContent="Profile saved.";toast("Profile updated.");
    }catch(e){$("profileMessage").textContent=errMsg(e);}
  }
  async function loadFriends() {
    if(!db||!state.user){$("requestsList").innerHTML=$("peopleList").innerHTML='<div class="empty">Log in to connect with people.</div>';return;}
    const {data:all,error}=await db.from("profiles").select("id,display_name,bio,avatar_url").neq("id",state.user.id).order("display_name").limit(100);
    if(error){$("peopleList").innerHTML=`<div class="empty">${escapeHTML(errMsg(error))}</div>`;return;}
    state.profiles=all||[];
    const {data:req}=await db.from("friendships").select("id,requester_id,addressee_id,status").eq("addressee_id",state.user.id).eq("status","pending");
    const {data:mine}=await db.from("friendships").select("id,requester_id,addressee_id,status").or(`requester_id.eq.${state.user.id},addressee_id.eq.${state.user.id}`);
    state.friends=mine||[];
    $("requestsList").innerHTML=req?.length?req.map(r=>{const p=state.profiles.find(x=>x.id===r.requester_id)||{display_name:"Cancele member"};return personRow(p,`<button class="primary" data-friend-action="accept" data-id="${r.id}">Accept</button><button class="quiet" data-friend-action="decline" data-id="${r.id}">Decline</button>`)}).join(""):'<div class="empty">No pending requests.</div>';
    $("peopleList").innerHTML=state.profiles.map(p=>{
      const rel=state.friends.find(f=>(f.requester_id===p.id&&f.addressee_id===state.user.id)||(f.addressee_id===p.id&&f.requester_id===state.user.id));
      let action=rel?.status==="accepted"?`<button class="quiet" data-open-chat="${p.id}">Message</button>`:rel?.status==="pending"?(rel.requester_id===state.user.id?'<span class="tiny muted">Request sent</span>':'<span class="tiny muted">Pending</span>'):`<button class="primary" data-friend-action="request" data-id="${p.id}">Add friend</button>`;
      return personRow(p,action);
    }).join("")||'<div class="empty">No other members yet.</div>';
  }
  function personRow(p,actions=""){return `<div class="person-row">${avatar(p)}<div class="person-info"><b>${escapeHTML(p.display_name||"Cancele member")}</b><small>${escapeHTML(p.bio||"Cancele community member")}</small></div><div class="row-actions">${actions}</div></div>`;}
  async function friendAction(e) {
    const b=e.target.closest("[data-friend-action]");if(!b)return;if(!requireLogin())return;
    const act=b.dataset.friendAction,id=b.dataset.id;let res;
    if(act==="request")res=await db.from("friendships").insert({requester_id:state.user.id,addressee_id:id,status:"pending"});
    if(act==="accept")res=await db.from("friendships").update({status:"accepted"}).eq("id",id).eq("addressee_id",state.user.id);
    if(act==="decline")res=await db.from("friendships").delete().eq("id",id).eq("addressee_id",state.user.id);
    if(res?.error){toast(errMsg(res.error));return;}toast(act==="request"?"Friend request sent.":"Request updated.");await loadFriends();
  }
  async function loadMessagePeople() {
    if(!db||!state.user){$("messagePeople").innerHTML='<div class="empty">Log in to message friends.</div>';return;}
    const {data:rels,error}=await db.from("friendships").select("requester_id,addressee_id,status").eq("status","accepted").or(`requester_id.eq.${state.user.id},addressee_id.eq.${state.user.id}`);
    if(error){$("messagePeople").innerHTML=`<div class="empty">${escapeHTML(errMsg(error))}</div>`;return;}
    const ids=(rels||[]).map(r=>r.requester_id===state.user.id?r.addressee_id:r.requester_id);
    const people=state.profiles.filter(p=>ids.includes(p.id));
    if(!people.length){const {data}=await db.from("profiles").select("id,display_name,bio,avatar_url").in("id",ids.length?ids:["00000000-0000-0000-0000-000000000000"]);state.profiles=[...state.profiles,...(data||[])];}
    const list=state.profiles.filter(p=>ids.includes(p.id));
    $("messagePeople").innerHTML=list.length?list.map(p=>personRow(p,`<button class="primary" data-open-chat="${p.id}">Open chat</button>`)).join(""):'<div class="empty">Add a friend before starting a private conversation.</div>';
  }
  async function openChat(otherId) {
    if(!requireLogin())return;state.activeChat=otherId;const p=state.profiles.find(x=>x.id===otherId);
    $("chatTitle").textContent=p?.display_name||"Cancele member";$("chatSub").textContent="Private conversation";
    await loadChatMessages();
  }
  async function loadChatMessages() {
    if(!state.activeChat||!db)return;
    const other=state.activeChat;
    const {data,error}=await db.from("messages").select("id,sender_id,recipient_id,content,created_at").or(`and(sender_id.eq.${state.user.id},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${state.user.id})`).order("created_at",{ascending:true}).limit(200);
    $("chatMessages").innerHTML=error?`<div class="empty">${escapeHTML(errMsg(error))}</div>`:data?.length?data.map(m=>`<div class="bubble ${m.sender_id===state.user.id?"mine":""}">${escapeHTML(m.content)}<small>${escapeHTML(niceDate(m.created_at))}</small></div>`).join(""):'<div class="empty">Say hello to start the conversation.</div>';
    $("chatMessages").scrollTop=$("chatMessages").scrollHeight;
  }
  async function sendMessage(e) {
    e.preventDefault();if(!requireLogin())return;if(!state.activeChat){toast("Choose a friend first.");return;}
    const content=$("messageText").value.trim();if(!content)return;
    const {error}=await db.from("messages").insert({sender_id:state.user.id,recipient_id:state.activeChat,content});
    if(error){toast(errMsg(error));return;}$("messageText").value="";await loadChatMessages();
  }
  async function loadListings() {
    if(!db){$("marketList").innerHTML='<div class="panel empty">Configure Supabase to load marketplace listings.</div>';return;}
    const {data,error}=await db.from("listings").select("id,user_id,title,description,price,photo_url,created_at,profiles(display_name)").eq("status","active").order("created_at",{ascending:false}).limit(100);
    $("marketList").innerHTML=error?`<div class="panel empty">${escapeHTML(errMsg(error))}</div>`:data?.length?data.map(l=>`<article class="panel market-card">${l.photo_url?`<img class="market-image" src="${escapeHTML(l.photo_url)}" alt="">`:'<div class="market-image"></div>'}<div class="market-info"><h3>${escapeHTML(l.title)}</h3><div class="market-price">${money(l.price)}</div><p>${escapeHTML(l.description||"No description provided.")}</p><div class="market-seller">Listed by ${escapeHTML(l.profiles?.display_name||"Member")} · ${escapeHTML(niceDate(l.created_at))}</div>${state.user&&state.user.id!==l.user_id?`<button class="quiet" data-market-message="${l.user_id}" style="margin-top:10px">Contact seller</button>`:""}</div></article>`).join(""):'<div class="panel empty">No listings yet. Add the first item or service.</div>';
  }
  async function publishListing(e) {
    e.preventDefault();if(!requireLogin())return;
    try {const file=$("listingPhoto").files[0];let photo_url=null;if(file)photo_url=await uploadFile(file,"marketplace");
      const {error}=await db.from("listings").insert({user_id:state.user.id,title:$("listingTitle").value.trim(),description:$("listingDescription").value.trim(),price:Number($("listingPrice").value),photo_url});
      if(error)throw error;$("listingForm").reset();$("listingMessage").textContent="Listing published.";await loadListings();toast("Listing published.");
    }catch(e){$("listingMessage").textContent=errMsg(e);}
  }
  async function loadAdminPosts() {
    if(!db||!state.admin){$("adminPosts").innerHTML='<div class="empty">Administrator permission is required.</div>';return;}
    const {data,error}=await db.from("posts").select("id,user_id,content,media_url,media_type,created_at,profiles(id,display_name,avatar_url)").order("created_at",{ascending:false}).limit(100);
    $("adminPosts").innerHTML=error?`<div class="empty">${escapeHTML(errMsg(error))}</div>`:data?.length?data.map(p=>renderPost(p,true)).join(""):'<div class="empty">No posts to moderate.</div>';
  }
  async function authSubmit(e) {
    e.preventDefault();if(!db){$("authMessage").textContent="Setup required: add your Supabase project URL and publishable/anon key in index.html.";return;}
    const email=$("authEmail").value.trim(),password=$("authPassword").value;
    $("authSubmit").disabled=true;$("authMessage").textContent="Please wait…";
    try {
      if(state.authMode==="signup"){
        const name=$("fullName").value.trim();if(!name)throw new Error("Enter your display name.");
        const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:name}}});if(error)throw error;
        if(data.session){state.user=data.user;await loadProfile();updateChrome();showView("feed");toast("Welcome to Cancele!");}
        else $("authMessage").textContent="Account created. Check your email to confirm, then log in.";
      } else {
        const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;
        state.user=data.user;await loadProfile();updateChrome();showView("feed");toast("Welcome back.");
      }
    } catch(e){$("authMessage").textContent=errMsg(e);}
    finally{$("authSubmit").disabled=false;}
  }
  function setAuthMode(mode) {
    state.authMode=mode;const signup=mode==="signup";
    document.querySelectorAll("[data-auth]").forEach(b=>b.classList.toggle("active",b.dataset.auth===mode));
    $("fullNameWrap").classList.toggle("hidden",!signup);$("fullName").required=signup;$("authPassword").autocomplete=signup?"new-password":"current-password";$("authSubmit").textContent=signup?"Create account":"Log in";$("authMessage").textContent="";
  }
  async function signOut() {if(db)await db.auth.signOut();state.user=null;state.profile=null;state.admin=false;updateChrome();showView("feed");toast("Signed out.");}
  async function boot() {
    $("year").textContent=new Date().getFullYear();
    if(!db){updateChrome();$("authMessage").textContent="Setup required: add your Supabase project URL and publishable/anon key in index.html.";await loadFeed();return;}
    const {data:{session}}=await db.auth.getSession();
    if(session){state.user=session.user;try{await loadProfile();}catch(e){toast(errMsg(e));}}
    updateChrome();showView("feed");
    db.auth.onAuthStateChange((_event,session)=>{setTimeout(async()=>{state.user=session?.user||null;try{await loadProfile();}catch(e){console.error(e);}updateChrome();if(state.view==="feed")loadFeed();},0);});
  }
  document.addEventListener("click",e=>{
    const nav=e.target.closest("[data-view]");if(nav){showView(nav.dataset.view);return;}
    const auth=e.target.closest("[data-auth]");if(auth){setAuthMode(auth.dataset.auth);return;}
    handlePostAction(e);friendAction(e);
    const chat=e.target.closest("[data-open-chat]");if(chat){showView("messages");openChat(chat.dataset.openChat);}
    const seller=e.target.closest("[data-market-message]");if(seller){showView("messages");openChat(seller.dataset.marketMessage);}
  });
  $("authForm").addEventListener("submit",authSubmit);
  $("signOutBtn").addEventListener("click",signOut);
  $("postForm").addEventListener("submit",publishPost);
  $("postMedia").addEventListener("change",()=>{$("mediaName").textContent=$("postMedia").files[0]?.name||"";});
  $("profileForm").addEventListener("submit",saveProfile);
  $("listingForm").addEventListener("submit",publishListing);
  $("commentForm").addEventListener("submit",submitComment);
  $("closeComments").addEventListener("click",()=>$("commentsDialog").close());
  $("messageForm").addEventListener("submit",sendMessage);
  $("requestsList").addEventListener("click",friendAction);$("peopleList").addEventListener("click",friendAction);
  $("messagePeople").addEventListener("click",e=>{const b=e.target.closest("[data-open-chat]");if(b)openChat(b.dataset.openChat);});
  $("feedList").addEventListener("click",handlePostAction);$("myPosts").addEventListener("click",handlePostAction);$("adminPosts").addEventListener("click",handlePostAction);
  $("searchInput").addEventListener("keydown",e=>{if(e.key==="Enter"){const term=e.target.value.trim();if(term){showView("feed");$("feedStatus").textContent=`Search results for “${term}”`;document.querySelectorAll("#feedList .post-card").forEach(card=>card.classList.toggle("hidden",!card.textContent.toLowerCase().includes(term.toLowerCase())));}}});
  boot();
})();