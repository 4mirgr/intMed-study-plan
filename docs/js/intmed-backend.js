(function(global){
  "use strict";

  var config = global.INTMED_CONFIG || {};
  var sessionKey = "intmed_supabase_session";

  function configured(){ return /^https:\/\//.test(config.supabaseUrl || "") && !!config.supabaseAnonKey; }
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
  function request(path, options){
    options = options || {};
    var authenticated = options.authenticated !== false;
    function perform(retried){
      var requestOptions = {};
      Object.keys(options).forEach(function(key){ if(key !== "authenticated" && key !== "headers") requestOptions[key] = options[key]; });
      requestOptions.headers = headers(options.headers, authenticated);
      return fetch(config.supabaseUrl.replace(/\/$/, "") + path, requestOptions).then(function(response){
        if(response.status === 401 && authenticated && !retried){
          return response.text().then(function(){ return refreshSession(); }).then(function(){ return perform(true); });
        }
        if(response.status === 204) return null;
        return response.text().then(function(text){
          var body = text ? JSON.parse(text) : null;
          if(!response.ok){
            var error = new Error((body && (body.msg || body.message || body.error_description)) || ("HTTP " + response.status));
            error.status = response.status;
            throw error;
          }
          return body;
        });
      });
    }
    return perform(false);
  }
  function auth(path, body){
    return request("/auth/v1/" + path, {method:"POST", body:JSON.stringify(body), authenticated:false});
  }
  function signIn(email, password){
    return auth("token?grant_type=password", {email:email, password:password}).then(function(value){
      saveSession(value);
      return profile().then(function(p){
        if(!p || !p.approved){ saveSession(null); throw new Error("حساب هنوز توسط مدیر تأیید نشده است."); }
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
      saveSession(null);
      throw error;
    });
    return refreshPromise;
  }
  function signUp(email, password, metadata){
    return auth("signup", {email:email, password:password, data:metadata || {}});
  }
  function resetPassword(email){
    var redirect = global.location ? global.location.origin + global.location.pathname : "";
    var path = "recover" + (redirect ? "?redirect_to=" + encodeURIComponent(redirect) : "");
    return auth(path, {email:email});
  }
  function captureRecoverySession(){
    if(!global.location || !global.location.hash) return false;
    var values = new URLSearchParams(global.location.hash.slice(1));
    if(values.get("type") !== "recovery" || !values.get("access_token")) return false;
    saveSession({
      access_token:values.get("access_token"),
      refresh_token:values.get("refresh_token") || "",
      token_type:values.get("token_type") || "bearer",
      expires_in:Number(values.get("expires_in") || 0),
      user:null,
      recovery:true
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
    var promise = current ? request("/auth/v1/logout", {method:"POST"}).catch(function(){}) : Promise.resolve();
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
      phone:p.phone || "", email:p.email || "", updatedAt:p.updated_at || ""
    };
    state.backendRole = p.role || "user";
    state.backendUsername = p.username || "";
    return state;
  }
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
      return {
        version:3,
        users:users,
        tickets:ticketRows.map(function(row){
          var payload = row.payload || {};
          payload.id = row.id; payload.userId = row.user_id;
          return payload;
        }),
        signups:profiles.filter(function(p){ return !p.approved && !p.rejected; }).map(function(p){
          return {id:p.id, userId:p.id, username:p.username, fullName:p.full_name, email:p.email, mobile:p.phone, status:"pending", createdAt:p.created_at};
        })
      };
    });
  }
  function saveLegacyState(state){
    var current = session();
    if(!current || !current.user) return Promise.reject(new Error("auth"));
    var rows = [];
    Object.keys(state.users || {}).forEach(function(userId){
      var bucket = Object.assign({}, state.users[userId]);
      delete bucket.profile; delete bucket.backendRole; delete bucket.backendUsername; delete bucket.passwordHash;
      rows.push({user_id:userId, state:bucket, updated_at:new Date().toISOString()});
    });
    var ticketRows = (state.tickets || []).map(function(ticket){
      var payload = Object.assign({}, ticket);
      delete payload.id; delete payload.userId;
      return {id:ticket.id, user_id:ticket.userId, payload:payload, updated_at:new Date().toISOString()};
    });
    var profileUpdates = Object.keys(state.users || {}).map(function(userId){
      var bucket = state.users[userId] || {}, p = bucket.profile || {};
      return request("/rest/v1/profiles?id=eq." + encodeURIComponent(userId), {
        method:"PATCH", headers:{Prefer:"return=minimal"}, body:JSON.stringify({
          full_name:p.fullName || null, degree:p.degree || null, id_number:p.idNumber || null,
          phone:p.phone || null, email:p.email || null, updated_at:new Date().toISOString()
        })
      });
    });
    return Promise.all([upsert("study_state", rows, "user_id"), upsert("tickets", ticketRows, "id")].concat(profileUpdates));
  }
  function approveUser(userId, approved){
    return request("/rest/v1/rpc/set_intmed_user_approval", {
      method:"POST", headers:{Prefer:"return=minimal"}, body:JSON.stringify({target_user:userId, new_approved:!!approved})
    });
  }

  global.IntMedBackend = {
    isConfigured:configured,
    session:session,
    signIn:signIn,
    signUp:signUp,
    resetPassword:resetPassword,
    refreshSession:refreshSession,
    captureRecoverySession:captureRecoverySession,
    updatePassword:updatePassword,
    signOut:signOut,
    profile:profile,
    loadLegacyState:loadLegacyState,
    saveLegacyState:saveLegacyState,
    approveUser:approveUser
  };
})(window);
