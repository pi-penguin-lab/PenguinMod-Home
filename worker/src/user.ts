import { DurableObject } from "cloudflare:workers";
import { hashPassword, randomToken, hashToken } from "./util";

export interface Env {
  UserDO: DurableObjectNamespace<UserDO>;
}

interface ProfileRow {
  username: string;
  password_hash: string;
  password_salt: string;
  email: string;
  birthday: string;
  country: string;
  bio: string;
  is_admin: number;
  is_approver: number;
  is_email_verified: number;
  featured_project: number;
  featured_project_title: string;
  private_profile: number;
  private_to_following: number;
  is_banned: number;
  created_at: string;
}

export class UserDO extends DurableObject<Env> {
  private username: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.username = "";
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS profile (
        username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
        email TEXT DEFAULT '', birthday TEXT DEFAULT '', country TEXT DEFAULT '',
        bio TEXT DEFAULT '', is_admin INTEGER DEFAULT 0, is_approver INTEGER DEFAULT 0,
        is_email_verified INTEGER DEFAULT 0, featured_project INTEGER DEFAULT 0,
        featured_project_title TEXT DEFAULT '', private_profile INTEGER DEFAULT 0,
        private_to_following INTEGER DEFAULT 0, is_banned INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS tokens (
        token_hash TEXT PRIMARY KEY, created_at TEXT DEFAULT (datetime('now'))
      )`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS follows (
        target_username TEXT PRIMARY KEY, created_at TEXT DEFAULT (datetime('now'))
      )`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
        from_username TEXT, message_content TEXT, is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS feed (
        id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
        from_username TEXT NOT NULL, data_json TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS badges (
        badge TEXT PRIMARY KEY
      )`);
    });
  }

  async createAccount(username: string, password: string, email: string, birthday: string, country: string): Promise<{ token: string } | { error: string }> {
    const existing = this.ctx.storage.sql.exec<ProfileRow>("SELECT username FROM profile WHERE username = ?", username).toArray();
    if (existing.length > 0) return { error: "UsernameTaken" };
    const { hash, salt } = await hashPassword(password);
    this.ctx.storage.sql.exec(
      "INSERT INTO profile (username, password_hash, password_salt, email, birthday, country) VALUES (?, ?, ?, ?, ?, ?)",
      username, hash, salt, email, birthday, country
    );
    const token = randomToken();
    const tokenHash = await hashToken(token);
    this.ctx.storage.sql.exec("INSERT INTO tokens (token_hash) VALUES (?)", tokenHash);
    return { token };
  }

  async passwordLogin(username: string, password: string): Promise<{ token: string } | { error: string }> {
    const rows = this.ctx.storage.sql.exec<ProfileRow>("SELECT password_hash, password_salt, is_banned FROM profile WHERE username = ?", username).toArray();
    if (rows.length === 0) return { error: "InvalidCredentials" };
    if (rows[0].is_banned) return { error: "AccountBanned" };
    const { hash } = await hashPassword(password, rows[0].password_salt);
    if (rows[0].password_hash !== hash) return { error: "InvalidCredentials" };
    const token = randomToken();
    const tokenHash = await hashToken(token);
    this.ctx.storage.sql.exec("INSERT INTO tokens (token_hash) VALUES (?)", tokenHash);
    return { token };
  }

  async tokenLogin(token: string): Promise<{ username: string } | { error: string }> {
    const tokenHash = await hashToken(token);
    const rows = this.ctx.storage.sql.exec<{ token_hash: string }>("SELECT token_hash FROM tokens WHERE token_hash = ?", tokenHash).toArray();
    if (rows.length === 0) return { error: "InvalidToken" };
    return { username: this.username };
  }

  async logout(): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("DELETE FROM tokens");
    return { success: true };
  }

  async getUserFromToken(token: string): Promise<ProfileRow & { error?: string }> {
    const tokenHash = await hashToken(token);
    const tokRows = this.ctx.storage.sql.exec<{ token_hash: string }>("SELECT token_hash FROM tokens WHERE token_hash = ?", tokenHash).toArray();
    if (tokRows.length === 0) return { error: "InvalidToken" } as any;
    const rows = this.ctx.storage.sql.exec<ProfileRow>("SELECT * FROM profile WHERE username = ?", this.username).toArray();
    if (rows.length === 0) return { error: "UserNotFound" } as any;
    return rows[0];
  }

  async getProfile(target: string, includeBio: boolean): Promise<Record<string, unknown> | { error: string }> {
    const rows = this.ctx.storage.sql.exec<ProfileRow>("SELECT * FROM profile WHERE username = ?", target).toArray();
    if (rows.length === 0) return { error: "UserNotFound" };
    const p = rows[0];
    const badgeRows = this.ctx.storage.sql.exec<{ badge: string }>("SELECT badge FROM badges").toArray();
    return {
      username: p.username,
      bio: includeBio ? p.bio : undefined,
      isAdmin: !!p.is_admin,
      isApprover: !!p.is_approver,
      isEmailVerified: !!p.is_email_verified,
      birthdayEntered: !!p.birthday,
      countryEntered: !!p.country,
      featuredProject: p.featured_project,
      featuredProjectTitle: p.featured_project_title,
      badges: badgeRows.map((b) => b.badge),
      created_at: p.created_at,
    };
  }

  async extraInfoStatus(token: string): Promise<{ birthdayEntered: boolean; countryEntered: boolean; isEmailVerified: boolean } | { error: string }> {
    const user = await this.getUserFromToken(token);
    if ((user as any).error) return user as any;
    return { birthdayEntered: !!user.birthday, countryEntered: !!user.country, isEmailVerified: !!user.is_email_verified };
  }

  async usernameExists(): Promise<{ exists: boolean }> {
    const rows = this.ctx.storage.sql.exec<ProfileRow>("SELECT username FROM profile WHERE username = ?", this.username).toArray();
    return { exists: rows.length > 0 };
  }

  async changePassword(token: string, oldPassword: string, newPassword: string): Promise<{ token: string } | { error: string }> {
    const rows = this.ctx.storage.sql.exec<ProfileRow>("SELECT password_hash, password_salt FROM profile WHERE username = ?", this.username).toArray();
    if (rows.length === 0) return { error: "UserNotFound" };
    const { hash: oldHash } = await hashPassword(oldPassword, rows[0].password_salt);
    if (rows[0].password_hash !== oldHash) return { error: "InvalidPassword" };
    const { hash: newHash, salt: newSalt } = await hashPassword(newPassword);
    this.ctx.storage.sql.exec("UPDATE profile SET password_hash = ?, password_salt = ? WHERE username = ?", newHash, newSalt, this.username);
    this.ctx.storage.sql.exec("DELETE FROM tokens");
    const newToken = randomToken();
    const newTokenHash = await hashToken(newToken);
    this.ctx.storage.sql.exec("INSERT INTO tokens (token_hash) VALUES (?)", newTokenHash);
    return { token: newToken };
  }

  async changeUsername(token: string, newUsername: string): Promise<{ token: string } | { error: string }> {
    const existing = this.ctx.storage.sql.exec<ProfileRow>("SELECT username FROM profile WHERE username = ?", newUsername).toArray();
    if (existing.length > 0) return { error: "UsernameTaken" };
    this.ctx.storage.sql.exec("UPDATE profile SET username = ? WHERE username = ?", newUsername, this.username);
    this.ctx.storage.sql.exec("DELETE FROM tokens");
    const newToken = randomToken();
    const newTokenHash = await hashToken(newToken);
    this.ctx.storage.sql.exec("INSERT INTO tokens (token_hash) VALUES (?)", newTokenHash);
    return { token: newToken };
  }

  async setBio(bio: string): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE profile SET bio = ? WHERE username = ?", bio, this.username);
    return { success: true };
  }

  async getBadges(): Promise<{ badges: string[] }> {
    const rows = this.ctx.storage.sql.exec<{ badge: string }>("SELECT badge FROM badges").toArray();
    return { badges: rows.map((r) => r.badge) };
  }

  async setBadges(badges: string[]): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("DELETE FROM badges");
    for (const b of badges) {
      this.ctx.storage.sql.exec("INSERT INTO badges (badge) VALUES (?)", b);
    }
    return { success: true };
  }

  async getFollowerCount(): Promise<number> {
    const rows = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) as count FROM follows").toArray();
    return rows[0]?.count ?? 0;
  }

  async isFollowing(target: string): Promise<{ following: boolean }> {
    const rows = this.ctx.storage.sql.exec<{ target_username: string }>(
      "SELECT target_username FROM follows WHERE target_username = ?", target
    ).toArray();
    return { following: rows.length > 0 };
  }

  async toggleFollow(target: string, toggle: boolean): Promise<{ success: boolean } | { error: string }> {
    if (toggle) {
      this.ctx.storage.sql.exec("INSERT OR IGNORE INTO follows (target_username) VALUES (?)", target);
      this.ctx.storage.sql.exec("INSERT INTO feed (type, from_username, data_json) VALUES (?, ?, ?)", "follow", this.username, JSON.stringify({ username: target }));
    } else {
      this.ctx.storage.sql.exec("DELETE FROM follows WHERE target_username = ?", target);
    }
    return { success: true };
  }

  async getFeed(page: number): Promise<{ feed: any[] }> {
    const offset = page * 50;
    const rows = this.ctx.storage.sql.exec<{ id: number; type: string; from_username: string; data_json: string; created_at: string }>(
      "SELECT * FROM feed ORDER BY id DESC LIMIT 50 OFFSET ?", offset
    ).toArray();
    return { feed: rows.map((r) => ({ id: r.id, type: r.type, username: r.from_username, data: JSON.parse(r.data_json || "{}"), created_at: r.created_at })) };
  }

  async addMessage(fromUsername: string, messageContent: string, type: string): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("INSERT INTO messages (type, from_username, message_content) VALUES (?, ?, ?)", type, fromUsername, messageContent);
    return { success: true };
  }

  async getMessages(page: number): Promise<{ messages: any[] }> {
    const offset = page * 50;
    const rows = this.ctx.storage.sql.exec<{ id: number; type: string; from_username: string; message_content: string; is_read: number; created_at: string }>(
      "SELECT * FROM messages ORDER BY id DESC LIMIT 50 OFFSET ?", offset
    ).toArray();
    return { messages: rows };
  }

  async getMessageCount(): Promise<{ count: number }> {
    const rows = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) as count FROM messages").toArray();
    return { count: rows[0]?.count ?? 0 };
  }

  async getUnreadMessageCount(): Promise<{ count: number }> {
    const rows = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) as count FROM messages WHERE is_read = 0").toArray();
    return { count: rows[0]?.count ?? 0 };
  }

  async markMessageAsRead(messageId: number): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE messages SET is_read = 1 WHERE id = ?", messageId);
    return { success: true };
  }

  async markAllMessagesAsRead(): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE messages SET is_read = 1");
    return { success: true };
  }

  async setFeaturedProject(projectId: number, title: string): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE profile SET featured_project = ?, featured_project_title = ? WHERE username = ?", projectId, title, this.username);
    return { success: true };
  }

  async filloutSafetyDetails(birthday: string, country: string): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE profile SET birthday = ?, country = ? WHERE username = ?", birthday, country, this.username);
    return { success: true };
  }

  async setEmail(email: string): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE profile SET email = ? WHERE username = ?", email, this.username);
    return { success: true };
  }

  async privateProfile(privateProfile: boolean, privateToFollowing: boolean): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE profile SET private_profile = ?, private_to_following = ? WHERE username = ?", privateProfile ? 1 : 0, privateToFollowing ? 1 : 0, this.username);
    return { success: true };
  }

  async ban(): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE profile SET is_banned = 1 WHERE username = ?", this.username);
    this.ctx.storage.sql.exec("DELETE FROM tokens");
    return { success: true };
  }

  async assignPosition(admin: boolean, approver: boolean): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE profile SET is_admin = ?, is_approver = ? WHERE username = ?", admin ? 1 : 0, approver ? 1 : 0, this.username);
    return { success: true };
  }

  async deleteAccount(): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("DELETE FROM profile WHERE username = ?", this.username);
    this.ctx.storage.sql.exec("DELETE FROM tokens");
    return { success: true };
  }

  async getTokenUser(token: string): Promise<{ username: string } | null> {
    const tokenHash = await hashToken(token);
    const rows = this.ctx.storage.sql.exec<{ token_hash: string }>("SELECT token_hash FROM tokens WHERE token_hash = ?", tokenHash).toArray();
    if (rows.length === 0) return null;
    return { username: this.username };
  }
}
