use chrono::Utc;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub sort_order: i32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Phrase {
    pub id: String,
    pub group_id: String,
    pub title: String,
    pub content: String,
    pub content_type: String,
    pub image_data: Option<String>,
    pub hotkey: Option<String>,
    pub abbreviation: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextExpansion {
    pub id: String,
    pub abbreviation: String,
    pub expanded_text: String,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessRule {
    pub id: String,
    pub process_name: String,
    pub group_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new<P: AsRef<Path>>(path: P) -> SqlResult<Self> {
        let conn = Connection::open(path)?;
        let db = Database { conn };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> SqlResult<()> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT '📁',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS phrases (
                id TEXT PRIMARY KEY,
                group_id TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                content_type TEXT NOT NULL DEFAULT 'text',
                image_data TEXT,
                hotkey TEXT,
                abbreviation TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS text_expansions (
                id TEXT PRIMARY KEY,
                abbreviation TEXT NOT NULL UNIQUE,
                expanded_text TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS process_rules (
                id TEXT PRIMARY KEY,
                process_name TEXT NOT NULL,
                group_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_phrases_group ON phrases(group_id);
            CREATE INDEX IF NOT EXISTS idx_phrases_title ON phrases(title);
            CREATE INDEX IF NOT EXISTS idx_process_rules_name ON process_rules(process_name);
            CREATE INDEX IF NOT EXISTS idx_text_expansions_abbr ON text_expansions(abbreviation);"
        )?;

        // Seed default data if empty
        let count: i64 = self.conn
            .query_row("SELECT COUNT(*) FROM groups", [], |r| r.get(0))
            .unwrap_or(0);

        if count == 0 {
            self.seed_default_data()?;
        }

        Ok(())
    }

    fn seed_default_data(&self) -> SqlResult<()> {
        let now = Utc::now().to_rfc3339();
        let general_id = Uuid::new_v4().to_string();
        let email_id = Uuid::new_v4().to_string();
        let code_id = Uuid::new_v4().to_string();

        self.conn.execute(
            "INSERT INTO groups (id, name, icon, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![general_id, "通用", "📋", 0, now],
        )?;
        self.conn.execute(
            "INSERT INTO groups (id, name, icon, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![email_id, "邮箱模板", "📧", 1, now],
        )?;
        self.conn.execute(
            "INSERT INTO groups (id, name, icon, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![code_id, "代码片段", "💻", 2, now],
        )?;

        // Default phrases
        let phrases = vec![
            (&general_id, "谢谢", "谢谢！\n感谢您的帮助。", "text", ""),
            (&general_id, "确认收到", "收到，我确认一下。", "text", ""),
            (&email_id, "正式问候", "尊敬的 {name}：\n\n您好！\n\n此致\n敬礼", "text", ""),
            (&email_id, "跟进邮件", "您好 {name}，\n\n关于之前讨论的事项，想跟您跟进一下进度。\n\n谢谢！", "text", ""),
            (&code_id, "Python HTTP", "import requests\n\nresponse = requests.get('https://api.example.com')\nprint(response.json())", "text", ""),
            (&code_id, "Git 常用命令", "git add .\ngit commit -m \"feat: description\"\ngit push origin main", "text", ""),
        ];

        for (i, (gid, title, content, ctype, _hotkey)) in phrases.iter().enumerate() {
            self.conn.execute(
                "INSERT INTO phrases (id, group_id, title, content, content_type, image_data, hotkey, abbreviation, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, NULL, ?6, ?7, ?7)",
                params![Uuid::new_v4().to_string(), gid, title, content, ctype, i as i32, now],
            )?;
        }

        // Default text expansions
        let expansions = vec![
            (";addr", "北京市朝阳区xxx路xxx号"),
            (";phone", "138-0000-0000"),
            (";sig", "张三\n高级工程师\nXX科技有限公司\n电话: 138-0000-0000"),
        ];

        for (abbr, text) in expansions {
            self.conn.execute(
                "INSERT INTO text_expansions (id, abbreviation, expanded_text, enabled, created_at)
                 VALUES (?1, ?2, ?3, 1, ?4)",
                params![Uuid::new_v4().to_string(), abbr, text, now],
            )?;
        }

        Ok(())
    }

    // ==================== Groups ====================
    pub fn get_groups(&self) -> SqlResult<Vec<Group>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, icon, sort_order, created_at FROM groups ORDER BY sort_order"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Group {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                sort_order: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_group(&self, name: &str, icon: &str) -> SqlResult<Group> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let max_order: i32 = self.conn
            .query_row("SELECT COALESCE(MAX(sort_order), -1) FROM groups", [], |r| r.get(0))
            .unwrap_or(-1);

        self.conn.execute(
            "INSERT INTO groups (id, name, icon, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, name, icon, max_order + 1, now],
        )?;

        Ok(Group {
            id,
            name: name.to_string(),
            icon: icon.to_string(),
            sort_order: max_order + 1,
            created_at: now,
        })
    }

    pub fn update_group(&self, id: &str, name: &str, icon: &str) -> SqlResult<()> {
        self.conn.execute(
            "UPDATE groups SET name = ?1, icon = ?2 WHERE id = ?3",
            params![name, icon, id],
        )?;
        Ok(())
    }

    pub fn delete_group(&self, id: &str) -> SqlResult<()> {
        self.conn.execute("DELETE FROM phrases WHERE group_id = ?1", params![id])?;
        self.conn.execute("DELETE FROM groups WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn reorder_groups(&self, ids: &[String]) -> SqlResult<()> {
        for (i, id) in ids.iter().enumerate() {
            self.conn.execute(
                "UPDATE groups SET sort_order = ?1 WHERE id = ?2",
                params![i as i32, id],
            )?;
        }
        Ok(())
    }

    // ==================== Phrases ====================
    pub fn get_phrases(&self) -> SqlResult<Vec<Phrase>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, group_id, title, content, content_type, image_data, hotkey, abbreviation, sort_order, created_at, updated_at
             FROM phrases ORDER BY sort_order"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Phrase {
                id: row.get(0)?,
                group_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                content_type: row.get(4)?,
                image_data: row.get(5)?,
                hotkey: row.get(6)?,
                abbreviation: row.get(7)?,
                sort_order: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_phrases_by_group(&self, group_id: &str) -> SqlResult<Vec<Phrase>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, group_id, title, content, content_type, image_data, hotkey, abbreviation, sort_order, created_at, updated_at
             FROM phrases WHERE group_id = ?1 ORDER BY sort_order"
        )?;
        let rows = stmt.query_map(params![group_id], |row| {
            Ok(Phrase {
                id: row.get(0)?,
                group_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                content_type: row.get(4)?,
                image_data: row.get(5)?,
                hotkey: row.get(6)?,
                abbreviation: row.get(7)?,
                sort_order: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    pub fn search_phrases(&self, query: &str) -> SqlResult<Vec<Phrase>> {
        let pattern = format!("%{}%", query);
        let mut stmt = self.conn.prepare(
            "SELECT id, group_id, title, content, content_type, image_data, hotkey, abbreviation, sort_order, created_at, updated_at
             FROM phrases WHERE title LIKE ?1 OR content LIKE ?1 OR abbreviation LIKE ?1
             ORDER BY sort_order LIMIT 50"
        )?;
        let rows = stmt.query_map(params![pattern], |row| {
            Ok(Phrase {
                id: row.get(0)?,
                group_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                content_type: row.get(4)?,
                image_data: row.get(5)?,
                hotkey: row.get(6)?,
                abbreviation: row.get(7)?,
                sort_order: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_phrase(
        &self,
        group_id: &str,
        title: &str,
        content: &str,
        content_type: &str,
        image_data: Option<&str>,
        hotkey: Option<&str>,
        abbreviation: Option<&str>,
    ) -> SqlResult<Phrase> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let max_order: i32 = self.conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM phrases WHERE group_id = ?1",
                params![group_id],
                |r| r.get(0),
            )
            .unwrap_or(-1);

        self.conn.execute(
            "INSERT INTO phrases (id, group_id, title, content, content_type, image_data, hotkey, abbreviation, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
            params![id, group_id, title, content, content_type, image_data, hotkey, abbreviation, max_order + 1, now],
        )?;

        Ok(Phrase {
            id,
            group_id: group_id.to_string(),
            title: title.to_string(),
            content: content.to_string(),
            content_type: content_type.to_string(),
            image_data: image_data.map(|s| s.to_string()),
            hotkey: hotkey.map(|s| s.to_string()),
            abbreviation: abbreviation.map(|s| s.to_string()),
            sort_order: max_order + 1,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_phrase(
        &self,
        id: &str,
        title: &str,
        content: &str,
        content_type: &str,
        image_data: Option<&str>,
        hotkey: Option<&str>,
        abbreviation: Option<&str>,
        group_id: &str,
    ) -> SqlResult<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE phrases SET title = ?1, content = ?2, content_type = ?3, image_data = ?4,
             hotkey = ?5, abbreviation = ?6, group_id = ?7, updated_at = ?8 WHERE id = ?9",
            params![title, content, content_type, image_data, hotkey, abbreviation, group_id, now, id],
        )?;
        Ok(())
    }

    pub fn delete_phrase(&self, id: &str) -> SqlResult<()> {
        self.conn.execute("DELETE FROM phrases WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_phrase_by_id(&self, id: &str) -> SqlResult<Phrase> {
        self.conn.query_row(
            "SELECT id, group_id, title, content, content_type, image_data, hotkey, abbreviation, sort_order, created_at, updated_at
             FROM phrases WHERE id = ?1",
            params![id],
            |row| {
                Ok(Phrase {
                    id: row.get(0)?,
                    group_id: row.get(1)?,
                    title: row.get(2)?,
                    content: row.get(3)?,
                    content_type: row.get(4)?,
                    image_data: row.get(5)?,
                    hotkey: row.get(6)?,
                    abbreviation: row.get(7)?,
                    sort_order: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            },
        )
    }

    // ==================== Text Expansions ====================
    pub fn get_text_expansions(&self) -> SqlResult<Vec<TextExpansion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, abbreviation, expanded_text, enabled, created_at FROM text_expansions ORDER BY abbreviation"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(TextExpansion {
                id: row.get(0)?,
                abbreviation: row.get(1)?,
                expanded_text: row.get(2)?,
                enabled: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_enabled_expansions(&self) -> SqlResult<Vec<TextExpansion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, abbreviation, expanded_text, enabled, created_at FROM text_expansions WHERE enabled = 1"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(TextExpansion {
                id: row.get(0)?,
                abbreviation: row.get(1)?,
                expanded_text: row.get(2)?,
                enabled: true,
                created_at: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_text_expansion(&self, abbreviation: &str, expanded_text: &str) -> SqlResult<TextExpansion> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO text_expansions (id, abbreviation, expanded_text, enabled, created_at) VALUES (?1, ?2, ?3, 1, ?4)",
            params![id, abbreviation, expanded_text, now],
        )?;
        Ok(TextExpansion {
            id,
            abbreviation: abbreviation.to_string(),
            expanded_text: expanded_text.to_string(),
            enabled: true,
            created_at: now,
        })
    }

    pub fn update_text_expansion(&self, id: &str, abbreviation: &str, expanded_text: &str, enabled: bool) -> SqlResult<()> {
        self.conn.execute(
            "UPDATE text_expansions SET abbreviation = ?1, expanded_text = ?2, enabled = ?3 WHERE id = ?4",
            params![abbreviation, expanded_text, enabled as i32, id],
        )?;
        Ok(())
    }

    pub fn delete_text_expansion(&self, id: &str) -> SqlResult<()> {
        self.conn.execute("DELETE FROM text_expansions WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ==================== Process Rules ====================
    pub fn get_process_rules(&self) -> SqlResult<Vec<ProcessRule>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, process_name, group_id, created_at FROM process_rules ORDER BY process_name"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ProcessRule {
                id: row.get(0)?,
                process_name: row.get(1)?,
                group_id: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        rows.collect()
    }

    pub fn set_process_rule(&self, process_name: &str, group_id: &str) -> SqlResult<ProcessRule> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT OR REPLACE INTO process_rules (id, process_name, group_id, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, process_name, group_id, now],
        )?;
        Ok(ProcessRule {
            id,
            process_name: process_name.to_string(),
            group_id: group_id.to_string(),
            created_at: now,
        })
    }

    pub fn delete_process_rule(&self, id: &str) -> SqlResult<()> {
        self.conn.execute("DELETE FROM process_rules WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn get_group_for_process(&self, process_name: &str) -> SqlResult<Option<String>> {
        let result = self.conn.query_row(
            "SELECT group_id FROM process_rules WHERE process_name = ?1",
            params![process_name],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(gid) => Ok(Some(gid)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    // ==================== Settings ====================
    pub fn get_setting(&self, key: &str) -> SqlResult<Option<String>> {
        let result = self.conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn get_settings(&self) -> SqlResult<Vec<Setting>> {
        let mut stmt = self.conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |row| {
            Ok(Setting {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })?;
        rows.collect()
    }

    pub fn update_setting(&self, key: &str, value: &str) -> SqlResult<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    // ==================== Import/Export ====================
    pub fn export_all(&self) -> SqlResult<serde_json::Value> {
        let groups = self.get_groups()?;
        let phrases = self.get_phrases()?;
        let expansions = self.get_text_expansions()?;
        let rules = self.get_process_rules()?;

        Ok(serde_json::json!({
            "version": 1,
            "groups": groups,
            "phrases": phrases,
            "text_expansions": expansions,
            "process_rules": rules,
        }))
    }

    pub fn import_data(&self, data: &serde_json::Value) -> SqlResult<()> {
        // Clear existing data
        self.conn.execute("DELETE FROM process_rules", [])?;
        self.conn.execute("DELETE FROM text_expansions", [])?;
        self.conn.execute("DELETE FROM phrases", [])?;
        self.conn.execute("DELETE FROM groups", [])?;

        if let Some(groups) = data["groups"].as_array() {
            for g in groups {
                self.conn.execute(
                    "INSERT INTO groups (id, name, icon, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        g["id"].as_str().unwrap_or_default(),
                        g["name"].as_str().unwrap_or(""),
                        g["icon"].as_str().unwrap_or("📁"),
                        g["sort_order"].as_i64().unwrap_or(0) as i32,
                        g["created_at"].as_str().unwrap_or(""),
                    ],
                )?;
            }
        }

        if let Some(phrases) = data["phrases"].as_array() {
            for p in phrases {
                self.conn.execute(
                    "INSERT INTO phrases (id, group_id, title, content, content_type, image_data, hotkey, abbreviation, sort_order, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    params![
                        p["id"].as_str().unwrap_or_default(),
                        p["group_id"].as_str().unwrap_or_default(),
                        p["title"].as_str().unwrap_or(""),
                        p["content"].as_str().unwrap_or(""),
                        p["content_type"].as_str().unwrap_or("text"),
                        p["image_data"].as_str(),
                        p["hotkey"].as_str(),
                        p["abbreviation"].as_str(),
                        p["sort_order"].as_i64().unwrap_or(0) as i32,
                        p["created_at"].as_str().unwrap_or(""),
                        p["updated_at"].as_str().unwrap_or(""),
                    ],
                )?;
            }
        }

        if let Some(expansions) = data["text_expansions"].as_array() {
            for e in expansions {
                self.conn.execute(
                    "INSERT INTO text_expansions (id, abbreviation, expanded_text, enabled, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        e["id"].as_str().unwrap_or_default(),
                        e["abbreviation"].as_str().unwrap_or(""),
                        e["expanded_text"].as_str().unwrap_or(""),
                        e["enabled"].as_bool().unwrap_or(true) as i32,
                        e["created_at"].as_str().unwrap_or(""),
                    ],
                )?;
            }
        }

        if let Some(rules) = data["process_rules"].as_array() {
            for r in rules {
                self.conn.execute(
                    "INSERT INTO process_rules (id, process_name, group_id, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![
                        r["id"].as_str().unwrap_or_default(),
                        r["process_name"].as_str().unwrap_or(""),
                        r["group_id"].as_str().unwrap_or_default(),
                        r["created_at"].as_str().unwrap_or(""),
                    ],
                )?;
            }
        }

        Ok(())
    }
}
