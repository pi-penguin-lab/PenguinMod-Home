import { DurableObject } from "cloudflare:workers";

export interface Env {
  AppDO: DurableObjectNamespace<AppDO>;
}

interface ProjectIndexRow {
  project_id: number;
  title: string;
  author_username: string;
  is_featured: number;
  vote_count: number;
  view_count: number;
  created_at: string;
}

interface ProfanityRow {
  word: string;
}

export class AppDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY, value INTEGER DEFAULT 0
      )`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS project_index (
        project_id INTEGER PRIMARY KEY, title TEXT, author_username TEXT,
        is_featured INTEGER DEFAULT 0, vote_count INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0, tags TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS profanity_list (
        word TEXT PRIMARY KEY
      )`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY, value TEXT
      )`);
      ctx.storage.sql.exec(`INSERT OR IGNORE INTO stats (key, value) VALUES ('users', 0)`);
      ctx.storage.sql.exec(`INSERT OR IGNORE INTO stats (key, value) VALUES ('projects', 0)`);
      ctx.storage.sql.exec(`INSERT OR IGNORE INTO stats (key, value) VALUES ('total_views', 0)`);
      ctx.storage.sql.exec(`INSERT OR IGNORE INTO stats (key, value) VALUES ('total_loves', 0)`);
    });
  }

  getStat(key: string): number {
    const rows = this.ctx.storage.sql.exec<{ value: number }>("SELECT value FROM stats WHERE key = ?", key).toArray();
    return rows[0]?.value ?? 0;
  }

  incrementStat(key: string): void {
    this.ctx.storage.sql.exec("UPDATE stats SET value = value + 1 WHERE key = ?", key);
  }

  async getStats(): Promise<{ users: number; projects: number; totalViews: number; totalLoves: number }> {
    return {
      users: this.getStat("users"),
      projects: this.getStat("projects"),
      totalViews: this.getStat("total_views"),
      totalLoves: this.getStat("total_loves"),
    };
  }

  async registerUser(): Promise<void> {
    this.incrementStat("users");
  }

  async registerProject(projectId: number, title: string, authorUsername: string, tags: string): Promise<void> {
    this.incrementStat("projects");
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO project_index (project_id, title, author_username, tags) VALUES (?, ?, ?, ?)",
      projectId, title, authorUsername, tags
    );
  }

  async getFrontPage(blockedUserIds: number[]): Promise<{
    latest: any[]; featured: any[]; voted: any[]; viewed: any[]; tagged: any[];
    selectedTag: string; suggested: any[] | null;
  }> {
    const blockedStr = blockedUserIds.length ? blockedUserIds.map(() => "?").join(",") : "0";

    const latest = this.ctx.storage.sql.exec<ProjectIndexRow>(
      `SELECT * FROM project_index ORDER BY created_at DESC LIMIT 20`
    ).toArray();

    const featured = this.ctx.storage.sql.exec<ProjectIndexRow>(
      `SELECT * FROM project_index WHERE is_featured = 1 ORDER BY created_at DESC LIMIT 10`
    ).toArray();

    const voted = this.ctx.storage.sql.exec<ProjectIndexRow>(
      `SELECT * FROM project_index ORDER BY vote_count DESC LIMIT 10`
    ).toArray();

    const viewed = this.ctx.storage.sql.exec<ProjectIndexRow>(
      `SELECT * FROM project_index ORDER BY view_count DESC LIMIT 10`
    ).toArray();

    const tagged = this.ctx.storage.sql.exec<ProjectIndexRow>(
      `SELECT * FROM project_index WHERE tags != '' ORDER BY created_at DESC LIMIT 20`
    ).toArray();

    const selectedTag = tagged.length > 0 ? `#${(tagged[0].tags || "").split(",")[0]}` : "";

    const mapRow = (r: ProjectIndexRow) => ({
      id: r.project_id,
      title: r.title,
      author: { username: r.author_username },
      stats: { views: r.view_count, loves: 0 },
      thumbnail: null,
      created_at: r.created_at,
    });

    return {
      latest: latest.map(mapRow),
      featured: featured.map(mapRow),
      voted: voted.map(mapRow),
      viewed: viewed.map(mapRow),
      tagged: tagged.slice(0, 20).map(mapRow),
      selectedTag,
      suggested: null,
    };
  }

  async indexProjectFromSearch(projectId: number, title: string, authorUsername: string, isFeatured: number, votes: number, views: number, tags: string): Promise<void> {
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO project_index (project_id, title, author_username, is_featured, vote_count, view_count, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
      projectId, title, authorUsername, isFeatured, votes, views, tags
    );
  }

  async searchProjects(query: string, page: number, type?: string, reverse?: boolean): Promise<ProjectIndexRow[]> {
    const offset = page * 50;
    const dir = reverse ? "ASC" : "DESC";
    let sql = "SELECT * FROM project_index WHERE (title LIKE ? OR author_username LIKE ?)";
    const params: any[] = [`%${query}%`, `%${query}%`];

    if (type === "featured") sql += " AND is_featured = 1";
    else if (type === "views") sql += " ORDER BY view_count " + dir;
    else if (type === "votes") sql += " ORDER BY vote_count " + dir;
    else sql += " ORDER BY created_at " + dir;

    if (!type || type === "newest" || type === "uploaddate") {
      sql = "SELECT * FROM project_index WHERE (title LIKE ? OR author_username LIKE ?) ORDER BY created_at " + dir;
    }

    sql += " LIMIT 50 OFFSET ?";
    params.push(offset);

    return this.ctx.storage.sql.exec<ProjectIndexRow>(sql, ...params).toArray();
  }

  async searchUsers(query: string, page: number): Promise<{ username: string }[]> {
    return [];
  }

  async getProfanityList(): Promise<{ words: string[] }> {
    const rows = this.ctx.storage.sql.exec<ProfanityRow>("SELECT word FROM profanity_list").toArray();
    return { words: rows.map((r) => r.word) };
  }

  async setProfanityList(words: string[]): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("DELETE FROM profanity_list");
    for (const w of words) {
      this.ctx.storage.sql.exec("INSERT INTO profanity_list (word) VALUES (?)", w);
    }
    return { success: true };
  }

  async getConfig(key: string): Promise<string | null> {
    const rows = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM config WHERE key = ?", key).toArray();
    return rows[0]?.value ?? null;
  }

  async setConfig(key: string, value: string): Promise<void> {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", key, value);
  }
}
