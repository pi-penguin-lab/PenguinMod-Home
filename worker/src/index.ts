import { json, error, notFound, getQuery, getPath } from "./util";
import { UserDO } from "./user";
import { ProjectDO } from "./project";
import { AppDO } from "./app";

export interface Env {
  UserDO: DurableObjectNamespace<UserDO>;
  ProjectDO: DurableObjectNamespace<ProjectDO>;
  AppDO: DurableObjectNamespace<AppDO>;
  PROJECT_BUCKET: R2Bucket;
}

function getUserStub(env: Env, username: string): DurableObjectStub<UserDO> {
  return env.UserDO.get(env.UserDO.idFromName(username.toLowerCase()));
}

function getProjectStub(env: Env, projectId: string): DurableObjectStub<ProjectDO> {
  return env.ProjectDO.get(env.ProjectDO.idFromName(projectId));
}

function getAppStub(env: Env): DurableObjectStub<AppDO> {
  return env.AppDO.get(env.AppDO.idFromName("app"));
}

async function readBody(req: Request): Promise<any> {
  const text = await req.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

async function verifyAuth(env: Env, username: string, token: string): Promise<boolean> {
  if (!username || !token) return false;
  const stub = getUserStub(env, username);
  const result = await stub.getTokenUser(token, username);
  return result !== null;
}

export { UserDO } from "./user";
export { ProjectDO } from "./project";
export { AppDO } from "./app";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const q = url.searchParams;
    const method = request.method;
    const body = await readBody(request);

    const parts = path.split("/").filter(Boolean);

    if (parts[0] === "api" && parts[1] === "v1") {
      const domain = parts[2];
      const resource = parts[3];
      const subresource = parts[4];
      const action = parts[5];

      try {
        // ===== HEALTH =====
        if (method === "GET" && path === "/api/v1") {
          return json({ status: "ok", version: "1.0.0" });
        }

        // ===== USERS =====
        if (domain === "users") {
          if (resource === "createAccount" && method === "POST") {
            const { username, password, birthday, country } = body;
            const stub = getUserStub(env, username);
            const result = await stub.createAccount(username, password, "", birthday || "", country || "");
            if ((result as any).token) {
              const app = getAppStub(env);
              await app.registerUser();
            }
            return json(result, (result as any).error ? 400 : 200);
          }

          if (resource === "passwordlogin" && method === "POST") {
            const { username, password } = body;
            const stub = getUserStub(env, username);
            return json(await stub.passwordLogin(username, password));
          }

          if (resource === "tokenlogin" && method === "GET") {
            const username = q.get("username") || "";
            const token = q.get("token") || "";
            const stub = getUserStub(env, username);
            return json(await stub.tokenLogin(token, username));
          }

          if (resource === "logout" && method === "POST") {
            const username = body.username || "";
            const stub = getUserStub(env, username);
            return json(await stub.logout(username));
          }

          if (resource === "userfromcode" && method === "GET") {
            const token = q.get("token") || "";
            const username = q.get("username") || "";
            if (!token) return error("Missing token");
            if (username) {
const stub = getUserStub(env, username);
            const user = await stub.getUserFromToken(token, username);
            if ((user as any).error) return json(user, 400);
            return json({
              admin: user.is_admin, approver: user.is_approver,
              birthdayEntered: !!user.birthday, countryEntered: !!user.country,
              isEmailVerified: !!user.is_email_verified,
              username: user.username,
            });
            }
            return error("Missing username");
          }

          if (resource === "extrainfostatus" && method === "GET") {
            const token = q.get("token") || "";
            const username = q.get("username") || "";
            if (!username) return error("Missing username");
            const stub = getUserStub(env, username);
            return json(await stub.extraInfoStatus(token, username));
          }

          if (resource === "changePassword" && method === "POST") {
            const { username, token, old_password, new_password } = body;
            const stub = getUserStub(env, username);
            const authed = await verifyAuth(env, username, token);
            if (!authed) return error("Unauthorized", 401);
            return json(await stub.changePassword(token, username, old_password, new_password));
          }

          if (resource === "changeUsername" && method === "POST") {
            const { username, token, newUsername } = body;
            const authed = await verifyAuth(env, username, token);
            if (!authed) return error("Unauthorized", 401);
            const stub = getUserStub(env, username);
            return json(await stub.changeUsername(token, username, newUsername));
          }

          if (resource === "getpfp" && method === "GET") {
            const username = q.get("username") || "";
            if (!username) return new Response(null, { status: 204 });
            const key = `pfps/${username}`;
            const obj = await env.PROJECT_BUCKET.get(key);
            if (!obj) return new Response(null, { status: 204 });
            const headers: Record<string, string> = { "Access-Control-Allow-Origin": "*" };
            headers["Content-Type"] = obj.httpMetadata?.contentType || "image/png";
            return new Response(obj.body, { headers });
          }

          if (resource === "getusername" && method === "GET") {
            const id = q.get("ID") || "";
            return json({ username: `user_${id}` });
          }

          if (resource === "getBadges" && method === "GET") {
            const username = q.get("username") || "";
            const stub = getUserStub(env, username);
            return json(await stub.getBadges());
          }

          if (resource === "meta" && subresource === "getfollowercount" && method === "GET") {
            const username = q.get("username") || "";
            const stub = getUserStub(env, username);
            return new Response(String(await stub.getFollowerCount()));
          }

          if (resource === "profile" && method === "GET") {
            const target = q.get("target") || "";
            const includeBio = q.has("bio");
            const username = q.get("username") || "";
            const stub = getUserStub(env, target);
            return json(await stub.getProfile(target, includeBio));
          }

          if (resource === "userexists" && method === "GET") {
            const username = q.get("username") || "";
            const stub = getUserStub(env, username);
            return json(await stub.usernameExists());
          }

          if (resource === "isfollowing" && method === "GET") {
            const username = q.get("username") || "";
            const target = q.get("target") || "";
            const stub = getUserStub(env, username);
            return json(await stub.isFollowing(target));
          }

          if (resource === "follow" && method === "POST") {
            const { username, token, target, toggle } = body;
            const authed = await verifyAuth(env, username, token);
            if (!authed) return error("Unauthorized", 401);
            const stub = getUserStub(env, username);
            return json(await stub.toggleFollow(username, target, toggle));
          }

          if (resource === "getMyFeed" && method === "GET") {
            const username = q.get("username") || "";
            const page = parseInt(q.get("page") || "0");
            const stub = getUserStub(env, username);
            return json(await stub.getFeed(page));
          }

          if (resource === "getmessages" && method === "GET") {
            const username = q.get("username") || "";
            const page = parseInt(q.get("page") || "0");
            const stub = getUserStub(env, username);
            return json(await stub.getMessages(page));
          }

          if (resource === "getmessagecount" && method === "GET") {
            const username = q.get("username") || "";
            const stub = getUserStub(env, username);
            return json(await stub.getMessageCount());
          }

          if (resource === "getunreadmessagecount" && method === "GET") {
            const username = q.get("username") || "";
            const stub = getUserStub(env, username);
            return json(await stub.getUnreadMessageCount());
          }

          if (resource === "markMessageAsRead" && method === "POST") {
            const { username, token, messageID } = body;
            const stub = getUserStub(env, username);
            return json(await stub.markMessageAsRead(messageID, username));
          }

          if (resource === "markAllMessagesAsRead" && method === "POST") {
            const { username, token } = body;
            const stub = getUserStub(env, username);
            return json(await stub.markAllMessagesAsRead(username));
          }

          if (resource === "setBio" && method === "POST") {
            const { username, token, bio } = body;
            const stub = getUserStub(env, username);
            return json(await stub.setBio(username, bio));
          }

          if (resource === "setmyfeaturedproject" && method === "POST") {
            const { username, token, project, title } = body;
            const stub = getUserStub(env, username);
            return json(await stub.setFeaturedProject(username, project, title));
          }

          if (resource === "filloutSafetyDetails" && method === "POST") {
            const { username, token, birthday, country } = body;
            const stub = getUserStub(env, username);
            return json(await stub.filloutSafetyDetails(username, birthday, country));
          }

          if (resource === "privateProfile" && method === "POST") {
            const { username, token, privateProfile, privateToFollowing } = body;
            const stub = getUserStub(env, username);
            return json(await stub.privateProfile(username, !!privateProfile, !!privateToFollowing));
          }

          if (resource === "setEmail" && method === "POST") {
            const { username, token, email } = body;
            const stub = getUserStub(env, username);
            return json(await stub.setEmail(username, email));
          }

          if (resource === "setBadges" && method === "POST") {
            const { username, token, badges, target } = body;
            const stub = getUserStub(env, target || username);
            return json(await stub.setBadges(badges || []));
          }

          if (resource === "setbadgesmultiple" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "ban" && method === "POST") {
            const { username, token, target } = body;
            const stub = getUserStub(env, target);
            return json(await stub.ban(target));
          }

          if (resource === "assignPossition" && method === "POST") {
            const { username, token, target, admin, approver } = body;
            const stub = getUserStub(env, target);
            return json(await stub.assignPosition(target, !!admin, !!approver));
          }

          if (resource === "addMessage" && method === "POST") {
            const { username, token, target, message } = body;
            const stub = getUserStub(env, target);
            return json(await stub.addMessage(username, message?.message || "", message?.type || "mod"));
          }

          if (resource === "deleteaccount" && method === "POST") {
            const { username, token, target } = body;
            const stub = getUserStub(env, target);
            return json(await stub.deleteAccount(target));
          }

          if (resource === "blockuser" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "hasblocked" && method === "GET") {
            return json({ has_blocked: false });
          }

          if (resource === "banuserip" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "banip" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "getAllIPs" && method === "GET") {
            return json({ ips: [] });
          }

          if (resource === "getAllAccountsWithIP" && method === "GET") {
            return json({ users: [] });
          }

          if (resource === "getAlts" && method === "GET") {
            return json({ alts: [] });
          }

          if (resource === "changeusernameadmin" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "getmods" && method === "GET") {
            return json({ mods: [] });
          }

          if (resource === "getadmins" && method === "GET") {
            return json({ admins: [] });
          }

          if (resource === "requestrankup" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "putonwatchlist" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "setBioAdmin" && method === "POST") {
            const { username, token, bio, target } = body;
            const stub = getUserStub(env, target || username);
            return json(await stub.setBio(target || username, bio));
          }

          if (resource === "setpfp" && method === "POST") {
            const username = q.get("username") || "";
            const token = q.get("token") || "";
            const stub = getUserStub(env, username);
            const user = await stub.getTokenUser(token, username);
            if (!user) return error("Unauthorized", 401);
            const blob = await request.blob();
            await env.PROJECT_BUCKET.put(`pfps/${username}`, blob, {
              httpMetadata: { contentType: blob.type || "image/png" },
            });
            return json({ success: true });
          }

          if (resource === "setpfpadmin" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "removeoauthmethod" && method === "POST") {
            return json({ success: true });
          }

          if (method === "GET" && resource === "resetpassword" && subresource === "reset") {
            return json({ token: "placeholder" });
          }

          if (method === "POST" && resource === "resetpassword" && subresource === "reset") {
            return json({ token: "placeholder" });
          }

          if (resource === "resetpassword" && subresource === "sendEmail" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "resetpassword" && subresource === "sendVerifyEmail" && method === "POST") {
            return json({ success: true });
          }
        }

        // ===== PROJECTS =====
        if (domain === "projects") {
          if (resource === "getprojects" && method === "GET") {
            const page = parseInt(q.get("page") || "0");
            const username = q.get("username") || "";
            const app = getAppStub(env);
            const projects = await app.searchProjects("", page);
            return json(projects);
          }

          if (resource === "searchprojects" && method === "GET") {
            const query = q.get("query") || "";
            const page = parseInt(q.get("page") || "0");
            const type = q.get("type") || undefined;
            const reverse = q.get("reverse") === "true";
            const app = getAppStub(env);
            return json(await app.searchProjects(query, page, type, reverse));
          }

          if (resource === "searchusers" && method === "GET") {
            const query = q.get("query") || "";
            const page = parseInt(q.get("page") || "0");
            const app = getAppStub(env);
            return json(await app.searchUsers(query, page));
          }

          if (resource === "getprojectsbyauthor" && method === "GET") {
            const page = parseInt(q.get("page") || "0");
            const app = getAppStub(env);
            return json(await app.searchProjects("", page));
          }

          if (resource === "frontpage" && method === "GET") {
            const app = getAppStub(env);
            return json(await app.getFrontPage([]));
          }

          if (resource === "getproject" && method === "GET") {
            const id = q.get("projectID") || "";
            const type = q.get("requestType") || "metadata";
            if (type === "thumbnail") {
              return new Response(null, { status: 204 });
            }
            const stub = getProjectStub(env, id);
            const meta = await stub.getMetadata();
            if ((meta as any).error) return json(meta, 404);
            return json(meta);
          }

          if (resource === "getremixes" && method === "GET") {
            const id = q.get("projectID") || "";
            const page = parseInt(q.get("page") || "0");
            const stub = getProjectStub(env, id);
            return json(await stub.getRemixes(page));
          }

          if (resource === "getprojectwrapper" && method === "GET") {
            return json({
              project: { data: [] },
              assets: [],
              error: "Not implemented - use studio for project playback",
            });
          }

          if (resource === "getmyprojects" && method === "GET") {
            const app = getAppStub(env);
            return json(await app.searchProjects("", parseInt(q.get("page") || "0")));
          }

          if (resource === "uploadProject" && method === "POST") {
            return json({ id: Math.floor(Math.random() * 1000000) });
          }

          if (resource === "updateProject" && method === "POST") {
            return json({ id: q.get("projectID") || body.projectID || "0" });
          }

          if (resource === "approve" && method === "GET") {
            const id = q.get("id") || "";
            const stub = getProjectStub(env, id);
            return json(await stub.approve());
          }

          if (resource === "manualfeature" && method === "POST") {
            const { projectID, toggle } = body;
            const stub = getProjectStub(env, String(projectID));
            return json(await stub.setFeatured(!!toggle));
          }

          if (resource === "setCanBeFeatured" && method === "POST") {
            const { projectID, toggle } = body;
            const stub = getProjectStub(env, String(projectID));
            return json(await stub.setCanBeFeatured(!!toggle));
          }

          if (resource === "restore" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "hardDeleteProject" && method === "POST") {
            const { projectID } = body;
            const stub = getProjectStub(env, String(projectID));
            return json(await stub.delete());
          }

          if (resource === "softreject" && method === "POST") {
            const { project, message } = body;
            const stub = getProjectStub(env, String(project));
            return json(await stub.reject(message || "Rejected"));
          }

          if (resource === "hardreject" && method === "POST") {
            const { project } = body;
            const stub = getProjectStub(env, String(project));
            return json(await stub.reject("Hard rejected"));
          }

          if (resource === "dispute" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "modresponse" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "modmessage" && method === "POST") {
            const { username, token, target, message } = body;
            const stub = getUserStub(env, target);
            return json(await stub.addMessage(username, message, "mod"));
          }

          if (resource === "deletemodmessage" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "toggleviewing" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "toggleuploading" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "toggleaccountcreation" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "deletethumb" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "downloadHardReject" && method === "GET") {
            return json({ project: { data: [] }, assets: [] });
          }

          // /api/v1/projects/interactions/...
          if (resource === "interactions") {
            if (subresource === "voteToggle" && method === "POST") {
              const { projectId, username, toggle } = body;
              const stub = getProjectStub(env, String(projectId));
              return json(await stub.toggleVote(username, !!toggle));
            }

            if (subresource === "loveToggle" && method === "POST") {
              const { projectId, username, toggle } = body;
              const stub = getProjectStub(env, String(projectId));
              return json(await stub.toggleLove(username, !!toggle));
            }

            if (subresource === "registerView" && method === "POST") {
              const { projectID } = body;
              const stub = getProjectStub(env, String(projectID));
              return json(await stub.registerView());
            }
          }

          if (resource === "getuserstatewrapper" && method === "GET") {
            const projectId = q.get("projectId") || "";
            const username = q.get("username") || "";
            const stub = getProjectStub(env, projectId);
            return json(await stub.getUserState(username));
          }

          // Project file data storage (used by scratch-gui studio)
          if (resource === "data") {
            if (method === "GET" && subresource) {
              // GET /api/v1/projects/data/{id} - return project JSON
              const obj = await env.PROJECT_BUCKET.get(`projects/${subresource}.json`);
              if (!obj) return json({ error: "NotFound" }, 404);
              const data = await obj.text();
              return new Response(data, {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
              });
            }
            if (method === "POST") {
              // POST /api/v1/projects/data/ - create project
              const projectData = await request.text();
              const id = String(Math.floor(Math.random() * 1000000));
              const title = q.get("title") || "Untitled";
              await env.PROJECT_BUCKET.put(`projects/${id}.json`, projectData);
              // Create project metadata in DO
              const stub = getProjectStub(env, id);
              await stub.create({
                id: parseInt(id), title, instructions: "", notes: "",
                authorUsername: "guest", remixOf: 0, tags: ""
              });
              const app = getAppStub(env);
              await app.registerProject(parseInt(id), title, "guest", "");
              return json({ "content-name": parseInt(id) });
            }
            if (method === "PUT" && subresource) {
              // PUT /api/v1/projects/data/{id} - update project
              const projectData = await request.text();
              const title = q.get("title") || "";
              await env.PROJECT_BUCKET.put(`projects/${subresource}.json`, projectData);
              if (title) {
                const stub = getProjectStub(env, subresource);
                await stub.update({ title });
              }
              return json({ id: parseInt(subresource) });
            }
          }

          // Asset storage (used by scratch-gui studio)
          if (resource === "assets" && method === "GET" && subresource) {
            // GET /api/v1/projects/assets/{id}.{format} - return asset
            const key = `assets/${subresource}`;
            const obj = await env.PROJECT_BUCKET.get(key);
            if (!obj) return json({ error: "NotFound" }, 404);
            const headers: Record<string, string> = { "Access-Control-Allow-Origin": "*" };
            headers["Content-Type"] = obj.httpMetadata?.contentType || "application/octet-stream";
            return new Response(obj.body, { headers });
          }
          if (resource === "assets" && method === "POST" && subresource) {
            // POST /api/v1/projects/assets/{id}.{format} - store asset
            const key = `assets/${subresource}`;
            const blob = await request.blob();
            await env.PROJECT_BUCKET.put(key, blob, {
              httpMetadata: { contentType: blob.type || "application/octet-stream" }
            });
            return json({ success: true });
          }
        }

        // ===== REPORTS =====
        if (domain === "reports") {
          if (resource === "sendReport" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "getReportsByTarget" && method === "GET") {
            return json({ reports: [] });
          }

          if (resource === "getReports" && method === "GET") {
            return json({ reports: [] });
          }

          if (resource === "deleteReport" && method === "POST") {
            return json({ success: true });
          }
        }

        // ===== MISC =====
        if (domain === "misc") {
          if (resource === "getStats" && method === "GET") {
            const app = getAppStub(env);
            return json(await app.getStats());
          }

          if (resource === "getProfanityList" && method === "GET") {
            const app = getAppStub(env);
            return json(await app.getProfanityList());
          }

          if (resource === "setProfanityList" && method === "POST") {
            const { json: jsonData } = body;
            const app = getAppStub(env);
            return json(await app.setProfanityList(jsonData?.words || []));
          }

          if (resource === "setLastPolicyUpdate" && method === "POST") {
            const app = getAppStub(env);
            await app.setConfig("lastPolicyUpdate", JSON.stringify(body));
            return json({ success: true });
          }

          if (resource === "getLastPolicyUpdate" && method === "GET") {
            const app = getAppStub(env);
            const val = await app.getConfig("lastPolicyUpdate");
            return json(val ? JSON.parse(val) : {});
          }

          if (resource === "markTOSAsRead" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "markPrivacyPolicyAsRead" && method === "POST") {
            return json({ success: true });
          }

          if (resource === "markGuidelinesAsRead" && method === "POST") {
            return json({ success: true });
          }
        }
      } catch (e: any) {
        return error(e.message || "Internal error", 500);
      }
    }

    // /api/users/addMessage (no v1)
    if (path === "/api/users/addMessage" && method === "POST") {
      const { username, token, target, message } = body;
      const stub = getUserStub(env, target);
      return json(await stub.addMessage(username, message?.message || "", message?.type || "mod"));
    }

    // /api/projects/approve (no v1)
    if (path === "/api/projects/approve" && method === "GET") {
      const id = q.get("id") || "";
      const stub = getProjectStub(env, id);
      return json(await stub.approve());
    }

    // Asset storage (legacy path used by scratch-storage)
    // /internalapi/asset/{id}.{format}/get/
    const assetMatch = path.match(/^\/internalapi\/asset\/(.+)\.(.+)\/get\/?$/);
    if (assetMatch && method === "GET") {
      const key = `assets/${assetMatch[1]}.${assetMatch[2]}`;
      const obj = await env.PROJECT_BUCKET.get(key);
      if (!obj) return json({ error: "NotFound" }, 404);
      const headers: Record<string, string> = { "Access-Control-Allow-Origin": "*" };
      headers["Content-Type"] = obj.httpMetadata?.contentType || "application/octet-stream";
      return new Response(obj.body, { headers });
    }
    // POST /{id}.{format} - store asset
    const assetPutMatch = path.match(/^\/(.+)\.(.+)$/);
    if (assetPutMatch && method === "POST") {
      const key = `assets/${assetPutMatch[1]}.${assetPutMatch[2]}`;
      const blob = await request.blob();
      await env.PROJECT_BUCKET.put(key, blob, {
        httpMetadata: { contentType: blob.type || "application/octet-stream" }
      });
      return json({ success: true });
    }

    return notFound();
  },
};
