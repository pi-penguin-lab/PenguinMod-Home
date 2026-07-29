import { DurableObject } from "cloudflare:workers";

export interface Env {
  ProjectDO: DurableObjectNamespace<ProjectDO>;
}

interface ProjectRow {
  id: number;
  title: string;
  instructions: string;
  notes_and_credits: string;
  author_username: string;
  thumbnail_type: string;
  is_featured: number;
  can_be_featured: number;
  is_approved: number;
  is_rejected: number;
  rejection_message: string;
  love_count: number;
  vote_count: number;
  view_count: number;
  tags: string;
  remix_of: number;
  created_at: string;
  updated_at: string;
}

export class ProjectDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY, title TEXT NOT NULL, instructions TEXT DEFAULT '',
        notes_and_credits TEXT DEFAULT '', author_username TEXT NOT NULL,
        author_id INTEGER DEFAULT 0, thumbnail_type TEXT DEFAULT '',
        thumbnail_data TEXT DEFAULT '', remix_of INTEGER DEFAULT 0,
        is_featured INTEGER DEFAULT 0, can_be_featured INTEGER DEFAULT 1,
        is_approved INTEGER DEFAULT 0, is_rejected INTEGER DEFAULT 0,
        rejection_message TEXT DEFAULT '', love_count INTEGER DEFAULT 0,
        vote_count INTEGER DEFAULT 0, view_count INTEGER DEFAULT 0,
        tags TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS loves (
        username TEXT, PRIMARY KEY (username)
      )`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS votes (
        username TEXT, PRIMARY KEY (username)
      )`);
    });
  }

  async create(data: {
    id: number; title: string; instructions: string; notes: string;
    authorUsername: string; remixOf: number; tags: string;
  }): Promise<{ id: number } | { error: string }> {
    const existing = this.ctx.storage.sql.exec<ProjectRow>("SELECT id FROM projects WHERE id = ?", data.id).toArray();
    if (existing.length > 0) return { error: "ProjectExists" };
    this.ctx.storage.sql.exec(
      "INSERT INTO projects (id, title, instructions, notes_and_credits, author_username, remix_of, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
      data.id, data.title, data.instructions, data.notes, data.authorUsername, data.remixOf, data.tags
    );
    return { id: data.id };
  }

  async update(data: {
    title?: string; instructions?: string; notes?: string;
  }): Promise<{ success: boolean } | { error: string }> {
    const existing = this.ctx.storage.sql.exec<ProjectRow>("SELECT id FROM projects WHERE id = ?", this.ctx.id.name).toArray();
    if (existing.length === 0) return { error: "NotFound" };
    if (data.title) this.ctx.storage.sql.exec("UPDATE projects SET title = ? WHERE id = ?", data.title, this.ctx.id.name);
    if (data.instructions) this.ctx.storage.sql.exec("UPDATE projects SET instructions = ? WHERE id = ?", data.instructions, this.ctx.id.name);
    if (data.notes) this.ctx.storage.sql.exec("UPDATE projects SET notes_and_credits = ? WHERE id = ?", data.notes, this.ctx.id.name);
    this.ctx.storage.sql.exec("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", this.ctx.id.name);
    return { success: true };
  }

  async getMetadata(): Promise<ProjectRow | { error: string }> {
    const rows = this.ctx.storage.sql.exec<ProjectRow>("SELECT * FROM projects WHERE id = ?", this.ctx.id.name).toArray();
    if (rows.length === 0) return { error: "NotFound" };
    return rows[0];
  }

  async approve(): Promise<{ success: boolean } | { error: string }> {
    const existing = this.ctx.storage.sql.exec<ProjectRow>("SELECT id FROM projects WHERE id = ?", this.ctx.id.name).toArray();
    if (existing.length === 0) return { error: "NotFound" };
    this.ctx.storage.sql.exec("UPDATE projects SET is_approved = 1, is_rejected = 0 WHERE id = ?", this.ctx.id.name);
    return { success: true };
  }

  async reject(message: string): Promise<{ success: boolean } | { error: string }> {
    const existing = this.ctx.storage.sql.exec<ProjectRow>("SELECT id FROM projects WHERE id = ?", this.ctx.id.name).toArray();
    if (existing.length === 0) return { error: "NotFound" };
    this.ctx.storage.sql.exec("UPDATE projects SET is_rejected = 1, rejection_message = ? WHERE id = ?", message, this.ctx.id.name);
    return { success: true };
  }

  async setFeatured(toggle: boolean): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE projects SET is_featured = ? WHERE id = ?", toggle ? 1 : 0, this.ctx.id.name);
    return { success: true };
  }

  async setCanBeFeatured(toggle: boolean): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE projects SET can_be_featured = ? WHERE id = ?", toggle ? 1 : 0, this.ctx.id.name);
    return { success: true };
  }

  async getRemixes(page: number): Promise<{ projects: ProjectRow[] }> {
    const offset = page * 50;
    const rows = this.ctx.storage.sql.exec<ProjectRow>(
      "SELECT * FROM projects WHERE remix_of = ? ORDER BY created_at DESC LIMIT 50 OFFSET ?",
      this.ctx.id.name, offset
    ).toArray();
    return { projects: rows };
  }

  async registerView(): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE projects SET view_count = view_count + 1 WHERE id = ?", this.ctx.id.name);
    return { success: true };
  }

  async toggleVote(username: string, toggle: boolean): Promise<{ success: boolean }> {
    if (toggle) {
      this.ctx.storage.sql.exec("INSERT OR IGNORE INTO votes (username) VALUES (?)", username);
      this.ctx.storage.sql.exec("UPDATE projects SET vote_count = (SELECT COUNT(*) FROM votes) WHERE id = ?", this.ctx.id.name);
    } else {
      this.ctx.storage.sql.exec("DELETE FROM votes WHERE username = ?", username);
      this.ctx.storage.sql.exec("UPDATE projects SET vote_count = (SELECT COUNT(*) FROM votes) WHERE id = ?", this.ctx.id.name);
    }
    return { success: true };
  }

  async toggleLove(username: string, toggle: boolean): Promise<{ success: boolean }> {
    if (toggle) {
      this.ctx.storage.sql.exec("INSERT OR IGNORE INTO loves (username) VALUES (?)", username);
      this.ctx.storage.sql.exec("UPDATE projects SET love_count = (SELECT COUNT(*) FROM loves) WHERE id = ?", this.ctx.id.name);
    } else {
      this.ctx.storage.sql.exec("DELETE FROM loves WHERE username = ?", username);
      this.ctx.storage.sql.exec("UPDATE projects SET love_count = (SELECT COUNT(*) FROM loves) WHERE id = ?", this.ctx.id.name);
    }
    return { success: true };
  }

  async getUserState(username: string): Promise<{ hasLoved: boolean; hasVoted: boolean }> {
    const loved = this.ctx.storage.sql.exec<{ username: string }>("SELECT username FROM loves WHERE username = ?", username).toArray();
    const voted = this.ctx.storage.sql.exec<{ username: string }>("SELECT username FROM votes WHERE username = ?", username).toArray();
    return { hasLoved: loved.length > 0, hasVoted: voted.length > 0 };
  }

  async delete(): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("DELETE FROM projects WHERE id = ?", this.ctx.id.name);
    return { success: true };
  }
}
