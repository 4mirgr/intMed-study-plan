(function(global){
  "use strict";

  var config = global.INTMED_CONFIG || {};
  var sessionKey = "intmed_supabase_session";
  var activeOrigin = "";
  // Each origin gets a hard timeout so a hung connection (common on restricted
  // mobile networks) falls over to the next candidate instead of waiting forever.
  var REQUEST_TIMEOUT_MS = 7000;

  function configured(){ return /^https:\/\//.test(config.supabaseUrl || config.supabaseFallbackUrl || "") && !!config.supabaseAnonKey; }
  function session(){
    try{ return JSON.parse(localStorage.getItem(sessionKey) || "null"); }catch(e){ return null; }
  }
  function saveSession(value){
    try{
      if(value) localStorage.setItem(sessionKey, JSON.stringify(value));
      else localStorage.removeItem(sessionKey);
    }catch(e){}
  }
  function headers(extra, authenticated){
    var result = {apikey:config.supabaseAnonKey, "Content-Type":"application/json"};
    var current = session();
    if(authenticated !== false && current && current.access_token) result.Authorization = "Bearer " + current.access_token;
    Object.keys(extra || {}).forEach(function(key){ result[key] = extra[key]; });
    return result;
  }
  function isNetworkOrTimeoutError(error){
    if(!error || error.status) return false;
    var msg = (error.message || "") + "";
    return error.name === "AbortError" ||
      /fetch|network|load failed|offline|aborted|failed to fetch|timeout/i.test(msg);
  }
  function request(path, options){
    options = options || {};
    var authenticated = options.authenticated !== false;
    function origins(){
      var values=[activeOrigin,config.supabaseUrl,config.supabaseFallbackUrl].filter(function(value,index,list){
        return /^https:\/\//.test(value||"") && list.indexOf(value)===index;
      });
      return values;
    }
    function perform(retried){
      var requestOptions = {};
      Object.keys(options).forEach(function(key){ if(key !== "authenticated" && key !== "headers") requestOptions[key] = options[key]; });
      requestOptions.headers = headers(options.headers, authenticated);
      var candidates=origins();
      function send(index, firstNetworkError){
        if(index >= candidates.length){
          if(firstNetworkError){
            if(isNetworkOrTimeoutError(firstNetworkError)){
              firstNetworkError.message =
                "ارتباط مرورگر با سرور حساب برقرار نشد. دکمهٔ «بررسی اتصال به سرور ورود» را بزنید؛ سپس با اینترنت دیگر یا تغییر وضعیت VPN دوباره امتحان کنید. این خطا به معنی اشتباه بودن رمز نیست.";
            }
            throw firstNetworkError;
          }
          return Promise.reject(new Error("Backend is not configured"));
        }
        var origin = candidates[index];
        var controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
        var timer = null;
        var opts = {};
        Object.keys(requestOptions).forEach(function(k){ opts[k] = requestOptions[k]; });
        if(controller){
          opts.signal = controller.signal;
          timer = setTimeout(function(){ try{ controller.abort(); }catch(e){} }, REQUEST_TIMEOUT_MS);
        }
        return fetch(origin.replace(/\/$/, "") + path, opts).then(function(response){
          if(timer) clearTimeout(timer);
          activeOrigin = origin;
          if(response.status === 401 && authenticated && !retried){
            return response.text().then(function(){ return refreshSession(); }).then(function(){ return perform(true); });
          }
          if(response.status === 204) return null;
          return response.text().then(function(text){
            var body = text ? JSON.parse(text) : null;
            if(!response.ok){
              var error = new Error((body && (body.msg || body.message || body.error_description)) || ("HTTP " + response.status));
              error.status = response.status;
              error.code = body && (body.error_code || body.code);
              throw error;
            }
            return body;
          });
        }).catch(function(error){
          if(timer) clearTimeout(timer);
          if(isNetworkOrTimeoutError(error) && index + 1 < candidates.length){
            return send(index + 1, firstNetworkError || error);
          }
          if(isNetworkOrTimeoutError(error) && firstNetworkError){
            if(isNetworkOrTimeoutError(firstNetworkError)){
              firstNetworkError.message =
                "ارتباط مرورگر با سرور حساب برقرار نشد. دکمهٔ «بررسی اتصال به سرور ورود» را بزنید؛ سپس با اینترنت دیگر یا تغییر وضعیت VPN دوباره امتحان کنید. این خطا به معنی اشتباه بودن رمز نیست.";
            }
            throw firstNetworkError;
          }
          if(isNetworkOrTimeoutError(error)){
            error.message =
              "ارتباط مرورگر با سرور حساب برقرار نشد. دکمهٔ «بررسی اتصال به سرور ورود» را بزنید؛ سپس با اینترنت دیگر یا تغییر وضعیت VPN دوباره امتحان کنید. این خطا به معنی اشتباه بودن رمز نیست.";
          }
          throw error;
        });
      }
      if(!candidates.length) return Promise.reject(new Error("Backend is not configured"));
      return send(0);
    }
    return perform(false);
  }
  function auth(path, body){
    return request("/auth/v1/" + path, {method:"POST", body:JSON.stringify(body), authenticated:false});
  }
  function signIn(username, password){
    username=String(username||"").trim().toLowerCase();
    // Email compatibility preserves existing accounts during the one-time rollout.
    var login = username.indexOf("@") !== -1
      ? auth("token?grant_type=password", {email:username, password:password})
      : request("/functions/v1/intmed-login", {method:"POST", authenticated:false, body:JSON.stringify({username:username,password:password})});
    return login.catch(function(error){
      if(!error.status && isNetworkOrTimeoutError(error)){
        error.message="ارتباط مرورگر با سرور حساب برقرار نشد. دکمهٔ بررسی اتصال را بزنید؛ سپس با اینترنت دیگر یا تغییر وضعیت VPN دوباره امتحان کنید. این خطا به معنی اشتباه بودن رمز نیست.";
      }
      if(error.status === 404) error.message = "ورود با نام کاربری هنوز در سرور فعال نشده است؛ تا تکمیل راه‌اندازی از ایمیل حساب استفاده کنید.";
      throw error;
    }).then(function(value){
      saveSession(value);
      return profile().then(function(p){
        if(!p || !p.approved || p.rejected){ saveSession(null); throw new Error("حساب هنوز توسط مدیر تأیید نشده است."); }
        return {session:value, profile:p};
      });
    });
  }
  var refreshPromise = null;
  function refreshSession(){
    var current = session();
    if(!current || !current.refresh_token){ saveSession(null); return Promise.reject(new Error("auth")); }
    if(refreshPromise) return refreshPromise;
    refreshPromise = auth("token?grant_type=refresh_token", {refresh_token:current.refresh_token}).then(function(value){
      saveSession(value);
      refreshPromise = null;
      return value;
    }).catch(function(error){
      refreshPromise = null;
      // A network/server failure must not destroy the refresh session. Only a
      // definitive rejected refresh requires a fresh password login.
      if(error.status === 400 || error.status === 401 || error.status === 403){
        saveSession(null);
        error.message = "auth";
      }
      throw error;
    });
    return refreshPromise;
  }
  function signUp(email, password, metadata){
    return auth("signup", {email:email, password:password, data:metadata || {}}).then(function(value){
      // With email-enumeration protection, Supabase may answer 200 for an
      // existing confirmed email but return a user with no new identity.
      if(value && value.user && Array.isArray(value.user.identities) && value.user.identities.length === 0){
        var duplicate = new Error("این ایمیل قبلاً ثبت شده است.");
        duplicate.code = "duplicate_email";
        throw duplicate;
      }
      return value;
    }).catch(function(error){
      if(error.code === "user_already_exists" || /already registered|already exists|email.*registered|ایمیل.*ثبت/i.test(error.message || "")){
        error.code = "duplicate_email";
        error.message = "این ایمیل قبلاً ثبت شده است.";
      }
      if(!error.status && isNetworkOrTimeoutError(error))error.message="ارتباط با سرور ثبت‌نام برقرار نشد. اینترنت یا VPN را تغییر دهید و دوباره تلاش کنید.";
      throw error;
    });
  }
  function resetPassword(email){
    if(email.indexOf('@')===-1)return request('/functions/v1/intmed-recovery',{method:'POST',authenticated:false,body:JSON.stringify({action:'recover',identity:email})});
    var redirect = global.location ? global.location.origin + global.location.pathname : "";
    var path = "recover" + (redirect ? "?redirect_to=" + encodeURIComponent(redirect) : "");
    return auth(path, {email:email});
  }
  function captureRecoverySession(){
    if(!global.location || !global.location.hash) return false;
    var values = new URLSearchParams(global.location.hash.slice(1));
    var flowType = values.get("type");
    if((flowType !== "recovery" && flowType !== "invite") || !values.get("access_token")) return false;
    saveSession({
      access_token:values.get("access_token"),
      refresh_token:values.get("refresh_token") || "",
      token_type:values.get("token_type") || "bearer",
      expires_in:Number(values.get("expires_in") || 0),
      user:null,
      recovery:true,
      flow_type:flowType
    });
    if(global.history && global.history.replaceState){
      global.history.replaceState(null, "", global.location.pathname + global.location.search);
    }
    return true;
  }
  function updatePassword(password){
    return request("/auth/v1/user", {method:"PUT", body:JSON.stringify({password:password})});
  }
  function signOut(){
    var current = session();
    var promise = current ? request("/auth/v1/logout?scope=local", {method:"POST"}).catch(function(){}) : Promise.resolve();
    return promise.then(function(){ saveSession(null); });
  }
  function profile(){
    var current = session();
    var id = current && current.user && current.user.id;
    return request("/rest/v1/profiles?id=eq." + encodeURIComponent(id || "") + "&select=*&limit=1", {headers:{Accept:"application/vnd.pgrst.object+json"}});
  }
  function select(path){ return request("/rest/v1/" + path, {headers:{Accept:"application/json"}}); }
  function upsert(table, rows, conflict){
    if(!rows.length) return Promise.resolve();
    var suffix = conflict ? "?on_conflict=" + encodeURIComponent(conflict) : "";
    return request("/rest/v1/" + table + suffix, {
      method:"POST",
      headers:{Prefer:"resolution=merge-duplicates,return=minimal"},
      body:JSON.stringify(rows)
    });
  }
  function profileToBucket(p, stateRow){
    var state = (stateRow && stateRow.state) || {};
    state.itemState = state.itemState || {};
    state.meta = state.meta || {currentPhaseOverride:null};
    state.highlights = state.highlights || {};
    state.loginLog = state.loginLog || [];
    state.profile = {
      fullName:p.full_name || "", degree:p.degree || "", idNumber:p.id_number || "",
      phone:p.phone || "", email:p.email || "", specialty:p.specialty === "پزشکی داخلی" ? "بیماری های داخلی" : (p.specialty || ""), province:p.province || "", updatedAt:p.updated_at || ""
    };
    state.backendRole = p.role || "user";
    state.backendUsername = p.username || "";
    state.backendApproved=p.approved===true;state.backendRejected=p.rejected===true;state.backendCreatedAt=p.created_at||"";
    return state;
  }
  var loadedSnapshot = null;
  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  function canonical(value){
    if(Array.isArray(value)) return value.map(canonical);
    if(value && typeof value === "object"){
      var result={};Object.keys(value).sort().forEach(function(key){result[key]=canonical(value[key]);});return result;
    }
    return value;
  }
  function equal(a,b){ return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
  function loadLegacyState(){
    return Promise.all([
      select("profiles?select=*"),
      select("study_state?select=user_id,state,updated_at"),
      select("tickets?select=id,user_id,payload,updated_at")
    ]).then(function(results){
      var profiles = results[0] || [], stateRows = results[1] || [], ticketRows = results[2] || [];
      var stateByUser = {};
      stateRows.forEach(function(row){ stateByUser[row.user_id] = row; });
      var users = {};
      profiles.forEach(function(p){ users[p.id] = profileToBucket(p, stateByUser[p.id]); });
      var result = {
        version:3,
        users:users,
        tickets:ticketRows.map(function(row){
          var payload = row.payload || {};
          payload.id = row.id; payload.userId = row.user_id;
          return payload;
        }),
        signups:profiles.filter(function(p){ return !p.approved && !p.rejected; }).map(function(p){
          return {id:p.id, userId:p.id, username:p.username, fullName:p.full_name, email:p.email, mobile:p.phone, degree:p.degree, specialty:p.specialty, province:p.province, idNumber:p.id_number, status:"pending", createdAt:p.created_at};
        })
      };
      loadedSnapshot = clone(result);
      return result;
    });
  }
  function cleanBucket(bucket){
    var result = Object.assign({}, bucket || {});
    delete result.profile; delete result.backendRole; delete result.backendUsername; delete result.passwordHash; delete result.backendApproved; delete result.backendRejected; delete result.backendCreatedAt;
    return result;
  }
  function mergeChangedKeys(remote, before, after){
    var result = Object.assign({}, remote || {});
    var keys = new Set(Object.keys(before || {}).concat(Object.keys(after || {})));
    keys.forEach(function(key){
      if(key === "__proto__" || key === "constructor" || key === "prototype") return;
      if(equal((before || {})[key], (after || {})[key])) return;
      if(Object.prototype.hasOwnProperty.call(after || {},key)) result[key] = clone(after[key]);
      else delete result[key];
    });
    return result;
  }
  function mergeStudyDelta(remote, before, after){
    remote=remote||{};before=before||{};after=after||{};
    var result = Object.assign({}, remote || {});
    result.itemState = mergeChangedKeys(result.itemState, before.itemState, after.itemState);
    // Activity counters use additive deltas so two devices do not overwrite
    // each other's positive increments inside the same topic/day entry.
    Object.keys(after.itemState||{}).forEach(function(key){
      if(!/^activity:.+:\d{4}-\d{2}-\d{2}$/.test(key))return;
      var prior=(before.itemState||{})[key]||{},next=after.itemState[key]||{},latest=(remote.itemState||{})[key]||{};
      if(equal(prior,next))return;
      var merged=Object.assign({},latest);
      ["opens","seconds"].forEach(function(field){merged[field]=(Number(latest[field])||0)+Math.max(0,(Number(next[field])||0)-(Number(prior[field])||0));});
      merged.types=Object.assign({},latest.types||{});
      Object.keys(next.types||{}).forEach(function(type){if(type!=="__proto__"&&type!=="constructor"&&type!=="prototype")merged.types[type]=(Number((latest.types||{})[type])||0)+Math.max(0,(Number(next.types[type])||0)-(Number((prior.types||{})[type])||0));});
      merged.lastOpenedAt=[latest.lastOpenedAt||"",next.lastOpenedAt||""].sort().pop();result.itemState[key]=merged;
    });
    Object.keys(after.itemState||{}).forEach(function(key){
      if(key.indexOf("quiz:")!==0)return;
      var latest=(remote.itemState||{})[key],next=after.itemState[key];
      if(latest && next && latest.answeredAt && next.answeredAt && latest.answeredAt<next.answeredAt)result.itemState[key]=latest;
    });
    Object.keys(after.itemState||{}).forEach(function(key){
      var latest=(remote.itemState||{})[key],next=after.itemState[key],prior=(before.itemState||{})[key];
      if(!latest||!next||equal(prior,next))return;
      if(key.indexOf("exam-answer:")===0&&latest.answeredAt&&next.answeredAt&&latest.answeredAt<=next.answeredAt)result.itemState[key]=latest;
      if(key.indexOf("exam-grade:")===0&&latest.gradedAt&&next.gradedAt&&latest.gradedAt<=next.gradedAt)result.itemState[key]=latest;
      if(key.indexOf("exam-draft:")===0&&latest.updatedAt&&next.updatedAt&&latest.updatedAt>next.updatedAt)result.itemState[key]=latest;
    });
    result.meta = mergeChangedKeys(result.meta, before.meta, after.meta);
    result.highlights = Object.assign({}, result.highlights || {});
    new Set(Object.keys(before.highlights || {}).concat(Object.keys(after.highlights || {}))).forEach(function(topic){
      var toMap = function(list){ var map = {}; (list || []).forEach(function(h){ map[h.id]=h; }); return map; };
      var merged = mergeChangedKeys(toMap(result.highlights[topic]), toMap((before.highlights || {})[topic]), toMap((after.highlights || {})[topic]));
      result.highlights[topic] = Object.keys(merged).map(function(id){ return merged[id]; });
    });
    var logs = {};
    (result.loginLog || []).concat(after.loginLog || []).forEach(function(row){ logs[row.at]=row; });
    result.loginLog = Object.keys(logs).sort().slice(-500).map(function(at){return logs[at];});
    return result;
  }
  function saveOwnState(userId, before, after, attempt){
    return select("study_state?user_id=eq." + encodeURIComponent(userId) + "&select=state,updated_at&limit=1").then(function(rows){
      var remote = (rows || [])[0];
      var merged = mergeStudyDelta(remote && remote.state, before, after);
      if(!remote){
        return request("/rest/v1/study_state?on_conflict=user_id", {
          method:"POST", headers:{Prefer:"resolution=ignore-duplicates,return=representation"},
          body:JSON.stringify({user_id:userId,state:merged})
        });
      }
      var nextTime = new Date(Math.max(Date.now(), Date.parse(remote.updated_at) + 1)).toISOString();
      return request("/rest/v1/study_state?user_id=eq." + encodeURIComponent(userId) + "&updated_at=eq." + encodeURIComponent(remote.updated_at), {
        method:"PATCH",headers:{Prefer:"return=representation"}, body:JSON.stringify({state:merged,updated_at:nextTime})
      });
    }).then(function(saved){
      if(saved && saved.length) return;
      if(attempt >= 2) throw new Error("conflict");
      return saveOwnState(userId,before,after,attempt+1);
    });
  }
  function saveLegacyState(state){
    var current = session();
    if(!current || !current.user || !loadedSnapshot) return Promise.reject(new Error("auth"));
    var owner = current.user.id;
    var snapshot = clone(state);
    var old = loadedSnapshot;
    var work = [];
    var own = cleanBucket((snapshot.users || {})[owner]);
    var before = cleanBucket((old.users || {})[owner]);
    // Admin profile visibility never means rewriting other users' study snapshots.
    if(!equal(own,before)) work.push(saveOwnState(owner,before,own,0));
    (snapshot.tickets || []).forEach(function(ticket){
      var previous = (old.tickets || []).find(function(row){return row.id===ticket.id;});
      if(equal(ticket,previous)) return;
      var payload = Object.assign({},ticket);delete payload.id;delete payload.userId;
      work.push(upsert("tickets",[{id:ticket.id,user_id:ticket.userId,payload:payload,updated_at:new Date().toISOString()}],"id"));
    });
    Object.keys(snapshot.users || {}).forEach(function(userId){
      var p = (snapshot.users[userId] || {}).profile || {};
      if(equal(p,((old.users || {})[userId] || {}).profile || {})) return;
      work.push(request("/rest/v1/profiles?id=eq."+encodeURIComponent(userId),{
        method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({full_name:p.fullName||null,degree:p.degree||null,id_number:p.idNumber||null,phone:p.phone||null,...((p.specialty || (((old.users || {})[userId] || {}).profile || {}).specialty) ? {specialty:p.specialty||null} : {}),...((p.province || (((old.users || {})[userId] || {}).profile || {}).province) ? {province:p.province||null} : {}),updated_at:new Date().toISOString()})
      }));
    });
    return Promise.all(work).then(function(){ loadedSnapshot=snapshot; });
  }
  function approveUser(userId, approved){
    return request("/rest/v1/rpc/set_intmed_user_approval", {
      method:"POST", headers:{Prefer:"return=minimal"}, body:JSON.stringify({target_user:userId, new_approved:!!approved})
    });
  }

  function deleteUser(userId){
    var current=session();
    if(!current || !current.user || current.user.id===userId) return Promise.reject(new Error("حذف حساب خودتان مجاز نیست."));
    return request("/rest/v1/rpc/delete_intmed_user", {
      method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({target_user:userId})
    }).then(function(){
      if(loadedSnapshot){
        delete loadedSnapshot.users[userId];
        loadedSnapshot.tickets=(loadedSnapshot.tickets||[]).filter(function(t){return t.userId!==userId;});
        loadedSnapshot.signups=(loadedSnapshot.signups||[]).filter(function(s){return (s.userId||s.id)!==userId;});
      }
    }).catch(function(error){
      if(error.status===404) error.message="امکان حذف کاربر هنوز در دیتابیس فعال نشده است؛ فایل delete_user.sql باید نصب شود.";
      throw error;
    });
  }

  function updateProfile(p){
    var current=session(),id=current && current.user && current.user.id;
    if(!id)return Promise.reject(new Error("auth"));
    var fields={fullName:"full_name",degree:"degree",specialty:"specialty",province:"province",idNumber:"id_number",phone:"phone"},body={updated_at:new Date().toISOString()};
    Object.keys(fields).forEach(function(key){body[fields[key]]=p[key]||null;});
    return request("/rest/v1/profiles?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(body)}).then(function(){
      if(loadedSnapshot && loadedSnapshot.users[id])Object.keys(fields).forEach(function(key){loadedSnapshot.users[id].profile[key]=p[key]||"";});
    });
  }
  function updateUsername(username){
    return request("/rest/v1/rpc/update_intmed_username",{method:"POST",body:JSON.stringify({new_username:username})}).then(function(){
      var id=session().user.id;if(loadedSnapshot && loadedSnapshot.users[id])loadedSnapshot.users[id].backendUsername=username;
    });
  }
  function updateEmail(email){return request("/auth/v1/user",{method:"PUT",body:JSON.stringify({email:email})});}
  function adminUpdateUser(userId,p,username,email){
    return request("/functions/v1/intmed-admin-user",{method:"POST",body:JSON.stringify({userId:userId,profile:p,username:username,email:email})});
  }

  function newsletterAction(payload){return request("/functions/v1/intmed-newsletter",{method:"POST",body:JSON.stringify(payload)});}
  function notificationAction(action,chatId){return request("/functions/v1/intmed-signup-notify",{method:"POST",body:JSON.stringify({action:action,chatId:chatId})});}
  global.IntMedBackend = {
    isConfigured:configured,
    session:session,
    signIn:signIn,
    checkAuthConnection:function(){return request("/auth/v1/health",{authenticated:false});},
    signUp:signUp,
    resetPassword:resetPassword,
    refreshSession:refreshSession,
    captureRecoverySession:captureRecoverySession,
    updatePassword:updatePassword,
    signOut:signOut,
    profile:profile,
    loadLegacyState:loadLegacyState,
    saveLegacyState:saveLegacyState,
    approveUser:approveUser,
    deleteUser:deleteUser,updateProfile:updateProfile,updateUsername:updateUsername,updateEmail:updateEmail,adminUpdateUser:adminUpdateUser,notificationAction:notificationAction,newsletterAction:newsletterAction
  };
})(window);
