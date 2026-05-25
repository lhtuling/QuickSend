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
    pub tags: Option<String>,
    pub sort_order: i32,
    pub favorite: bool,
    pub usage_count: i32,
    pub last_used_at: Option<String>,
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
        let db = Self { conn };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> SqlResult<()> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT '*',
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
                tags TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                favorite INTEGER NOT NULL DEFAULT 0,
                usage_count INTEGER NOT NULL DEFAULT 0,
                last_used_at TEXT,
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
            CREATE INDEX IF NOT EXISTS idx_phrases_title ON phrases(title);",
        )?;

        self.ensure_phrase_columns()?;

        self.conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_phrases_usage ON phrases(favorite, usage_count, last_used_at);
            CREATE INDEX IF NOT EXISTS idx_process_rules_name ON process_rules(process_name);
            CREATE INDEX IF NOT EXISTS idx_text_expansions_abbr ON text_expansions(abbreviation);",
        )?;

        let count: i64 = self
            .conn
            .query_row("SELECT COUNT(*) FROM groups", [], |row| row.get(0))
            .unwrap_or(0);
        if count == 0 {
            self.seed_default_data()?;
        }

        Ok(())
    }

    fn ensure_phrase_columns(&self) -> SqlResult<()> {
        let columns = {
            let mut stmt = self.conn.prepare("PRAGMA table_info(phrases)")?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
            rows.collect::<SqlResult<Vec<_>>>()?
        };

        if !columns.iter().any(|column| column == "favorite") {
            self.conn.execute(
                "ALTER TABLE phrases ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }
        if !columns.iter().any(|column| column == "tags") {
            self.conn
                .execute("ALTER TABLE phrases ADD COLUMN tags TEXT", [])?;
        }
        if !columns.iter().any(|column| column == "usage_count") {
            self.conn.execute(
                "ALTER TABLE phrases ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0",
                [],
            )?;
        }
        if !columns.iter().any(|column| column == "last_used_at") {
            self.conn
                .execute("ALTER TABLE phrases ADD COLUMN last_used_at TEXT", [])?;
        }

        Ok(())
    }

    fn seed_default_data(&self) -> SqlResult<()> {
        let now = Utc::now().to_rfc3339();
        let general_id = Uuid::new_v4().to_string();
        let support_id = Uuid::new_v4().to_string();
        let prompt_id = Uuid::new_v4().to_string();

        for (id, name, icon, order) in [
            (&general_id, "General", "*", 0),
            (&support_id, "Support", "S", 1),
            (&prompt_id, "AI Prompts", "AI", 2),
        ] {
            self.conn.execute(
                "INSERT INTO groups (id, name, icon, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, name, icon, order, now],
            )?;
        }

        let phrases = vec![
            (&general_id, "Thanks", "Thanks for your help.", "text"),
            (&general_id, "Received", "Received. I will confirm and get back to you.", "text"),
            (&support_id, "Order handled", "Hello {customer}, your order {order_id} has been handled.", "text"),
            (&support_id, "Need details", "Hello, could you please provide {detail=the order number} so I can check it for you?", "text"),
            (&prompt_id, "Rewrite professionally", "Please rewrite the following text to be more professional and concise:\n{text}", "text"),
            (&prompt_id, "Summarize", "Please summarize the following content into bullet points:\n{content}", "text"),
        ];

        for (index, (group_id, title, content, content_type)) in phrases.iter().enumerate() {
            self.conn.execute(
                "INSERT INTO phrases (id, group_id, title, content, content_type, image_data, hotkey, abbreviation, tags, sort_order, favorite, usage_count, last_used_at, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, NULL, NULL, ?6, 0, 0, NULL, ?7, ?7)",
                params![Uuid::new_v4().to_string(), group_id, title, content, content_type, index as i32, now],
            )?;
        }

        for (abbr, text) in [
            (";addr", "Example address line"),
            (";phone", "138-0000-0000"),
            (";sig", "Your Name\nTitle\nCompany\nPhone: 138-0000-0000"),
        ] {
            self.conn.execute(
                "INSERT INTO text_expansions (id, abbreviation, expanded_text, enabled, created_at)
                 VALUES (?1, ?2, ?3, 1, ?4)",
                params![Uuid::new_v4().to_string(), abbr, text, now],
            )?;
        }

        Ok(())
    }

    pub fn get_groups(&self) -> SqlResult<Vec<Group>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, icon, sort_order, created_at FROM groups ORDER BY sort_order")?;
        let rows = stmt.query_map([], map_group)?;
        rows.collect()
    }

    pub fn create_group(&self, name: &str, icon: &str) -> SqlResult<Group> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let max_order: i32 = self
            .conn
            .query_row("SELECT COALESCE(MAX(sort_order), -1) FROM groups", [], |row| row.get(0))
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
        self.conn
            .execute("UPDATE groups SET name = ?1, icon = ?2 WHERE id = ?3", params![name, icon, id])?;
        Ok(())
    }

    pub fn delete_group(&self, id: &str) -> SqlResult<()> {
        self.conn.execute("DELETE FROM phrases WHERE group_id = ?1", params![id])?;
        self.conn.execute("DELETE FROM groups WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn reorder_groups(&self, ids: &[String]) -> SqlResult<()> {
        for (index, id) in ids.iter().enumerate() {
            self.conn
                .execute("UPDATE groups SET sort_order = ?1 WHERE id = ?2", params![index as i32, id])?;
        }
        Ok(())
    }

    pub fn get_phrases(&self) -> SqlResult<Vec<Phrase>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, group_id, title, content, content_type, image_data, hotkey, abbreviation, tags, sort_order, favorite, usage_count, last_used_at, created_at, updated_at
             FROM phrases ORDER BY favorite DESC, usage_count DESC, last_used_at DESC, sort_order",
        )?;
        let rows = stmt.query_map([], map_phrase)?;
        rows.collect()
    }

    pub fn get_phrases_by_group(&self, group_id: &str) -> SqlResult<Vec<Phrase>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, group_id, title, content, content_type, image_data, hotkey, abbreviation, tags, sort_order, favorite, usage_count, last_used_at, created_at, updated_at
             FROM phrases WHERE group_id = ?1 ORDER BY favorite DESC, usage_count DESC, last_used_at DESC, sort_order",
        )?;
        let rows = stmt.query_map(params![group_id], map_phrase)?;
        rows.collect()
    }

    pub fn search_phrases(&self, query: &str) -> SqlResult<Vec<Phrase>> {
        let pattern = format!("%{}%", query);
        let mut stmt = self.conn.prepare(
            "SELECT id, group_id, title, content, content_type, image_data, hotkey, abbreviation, tags, sort_order, favorite, usage_count, last_used_at, created_at, updated_at
             FROM phrases WHERE title LIKE ?1 OR content LIKE ?1 OR abbreviation LIKE ?1 OR tags LIKE ?1
             ORDER BY favorite DESC, usage_count DESC, last_used_at DESC, sort_order LIMIT 50",
        )?;
        let rows = stmt.query_map(params![pattern], map_phrase)?;
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
        tags: Option<&str>,
    ) -> SqlResult<Phrase> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let max_order: i32 = self
            .conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM phrases WHERE group_id = ?1",
                params![group_id],
                |row| row.get(0),
            )
            .unwrap_or(-1);
        self.conn.execute(
            "INSERT INTO phrases (id, group_id, title, content, content_type, image_data, hotkey, abbreviation, tags, sort_order, favorite, usage_count, last_used_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, 0, NULL, ?11, ?11)",
            params![id, group_id, title, content, content_type, image_data, hotkey, abbreviation, tags, max_order + 1, now],
        )?;
        Ok(Phrase {
            id,
            group_id: group_id.to_string(),
            title: title.to_string(),
            content: content.to_string(),
            content_type: content_type.to_string(),
            image_data: image_data.map(str::to_string),
            hotkey: hotkey.map(str::to_string),
            abbreviation: abbreviation.map(str::to_string),
            tags: tags.map(str::to_string),
            sort_order: max_order + 1,
            favorite: false,
            usage_count: 0,
            last_used_at: None,
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
        tags: Option<&str>,
        group_id: &str,
    ) -> SqlResult<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE phrases SET title = ?1, content = ?2, content_type = ?3, image_data = ?4,
             hotkey = ?5, abbreviation = ?6, tags = ?7, group_id = ?8, updated_at = ?9 WHERE id = ?10",
            params![title, content, content_type, image_data, hotkey, abbreviation, tags, group_id, now, id],
        )?;
        Ok(())
    }

    pub fn delete_phrase(&self, id: &str) -> SqlResult<()> {
        self.conn.execute("DELETE FROM phrases WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn record_phrase_usage(&self, id: &str) -> SqlResult<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "UPDATE phrases SET usage_count = usage_count + 1, last_used_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    pub fn update_phrase_favorite(&self, id: &str, favorite: bool) -> SqlResult<()> {
        self.conn
            .execute("UPDATE phrases SET favorite = ?1 WHERE id = ?2", params![favorite as i32, id])?;
        Ok(())
    }

    pub fn get_phrase_by_id(&self, id: &str) -> SqlResult<Phrase> {
        self.conn.query_row(
            "SELECT id, group_id, title, content, content_type, image_data, hotkey, abbreviation, tags, sort_order, favorite, usage_count, last_used_at, created_at, updated_at
             FROM phrases WHERE id = ?1",
            params![id],
            map_phrase,
        )
    }

    pub fn get_text_expansions(&self) -> SqlResult<Vec<TextExpansion>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, abbreviation, expanded_text, enabled, created_at FROM text_expansions ORDER BY abbreviation")?;
        let rows = stmt.query_map([], map_text_expansion)?;
        rows.collect()
    }

    pub fn get_enabled_expansions(&self) -> SqlResult<Vec<TextExpansion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, abbreviation, expanded_text, enabled, created_at FROM text_expansions WHERE enabled = 1",
        )?;
        let rows = stmt.query_map([], map_text_expansion)?;
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

    pub fn get_process_rules(&self) -> SqlResult<Vec<ProcessRule>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, process_name, group_id, created_at FROM process_rules ORDER BY process_name")?;
        let rows = stmt.query_map([], map_process_rule)?;
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

    pub fn get_setting(&self, key: &str) -> SqlResult<Option<String>> {
        let result = self.conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        );
        match result {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(err),
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

    pub fn export_all(&self) -> SqlResult<serde_json::Value> {
        Ok(serde_json::json!({
            "version": 1,
            "groups": self.get_groups()?,
            "phrases": self.get_phrases()?,
            "text_expansions": self.get_text_expansions()?,
            "process_rules": self.get_process_rules()?,
            "settings": self.get_settings()?,
        }))
    }

    pub fn import_data(&self, data: &serde_json::Value) -> SqlResult<()> {
        self.conn.execute("DELETE FROM process_rules", [])?;
        self.conn.execute("DELETE FROM text_expansions", [])?;
        self.conn.execute("DELETE FROM phrases", [])?;
        self.conn.execute("DELETE FROM groups", [])?;

        if let Some(groups) = data["groups"].as_array() {
            for group in groups {
                self.conn.execute(
                    "INSERT INTO groups (id, name, icon, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        group["id"].as_str().unwrap_or_default(),
                        group["name"].as_str().unwrap_or(""),
                        group["icon"].as_str().unwrap_or("*"),
                        group["sort_order"].as_i64().unwrap_or(0) as i32,
                        group["created_at"].as_str().unwrap_or(""),
                    ],
                )?;
            }
        }

        if let Some(phrases) = data["phrases"].as_array() {
            for phrase in phrases {
                self.conn.execute(
                    "INSERT INTO phrases (id, group_id, title, content, content_type, image_data, hotkey, abbreviation, tags, sort_order, favorite, usage_count, last_used_at, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                    params![
                        phrase["id"].as_str().unwrap_or_default(),
                        phrase["group_id"].as_str().unwrap_or_default(),
                        phrase["title"].as_str().unwrap_or(""),
                        phrase["content"].as_str().unwrap_or(""),
                        phrase["content_type"].as_str().unwrap_or("text"),
                        phrase["image_data"].as_str(),
                        phrase["hotkey"].as_str(),
                        phrase["abbreviation"].as_str(),
                        phrase["tags"].as_str(),
                        phrase["sort_order"].as_i64().unwrap_or(0) as i32,
                        phrase["favorite"].as_bool().unwrap_or(false) as i32,
                        phrase["usage_count"].as_i64().unwrap_or(0) as i32,
                        phrase["last_used_at"].as_str(),
                        phrase["created_at"].as_str().unwrap_or(""),
                        phrase["updated_at"].as_str().unwrap_or(""),
                    ],
                )?;
            }
        }

        if let Some(expansions) = data["text_expansions"].as_array() {
            for item in expansions {
                self.conn.execute(
                    "INSERT INTO text_expansions (id, abbreviation, expanded_text, enabled, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        item["id"].as_str().unwrap_or_default(),
                        item["abbreviation"].as_str().unwrap_or(""),
                        item["expanded_text"].as_str().unwrap_or(""),
                        item["enabled"].as_bool().unwrap_or(true) as i32,
                        item["created_at"].as_str().unwrap_or(""),
                    ],
                )?;
            }
        }

        if let Some(rules) = data["process_rules"].as_array() {
            for rule in rules {
                self.conn.execute(
                    "INSERT INTO process_rules (id, process_name, group_id, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![
                        rule["id"].as_str().unwrap_or_default(),
                        rule["process_name"].as_str().unwrap_or(""),
                        rule["group_id"].as_str().unwrap_or_default(),
                        rule["created_at"].as_str().unwrap_or(""),
                    ],
                )?;
            }
        }

        Ok(())
    }
}

fn map_group(row: &rusqlite::Row<'_>) -> SqlResult<Group> {
    Ok(Group {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
        sort_order: row.get(3)?,
        created_at: row.get(4)?,
    })
}

fn map_phrase(row: &rusqlite::Row<'_>) -> SqlResult<Phrase> {
    Ok(Phrase {
        id: row.get(0)?,
        group_id: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        content_type: row.get(4)?,
        image_data: row.get(5)?,
        hotkey: row.get(6)?,
        abbreviation: row.get(7)?,
        tags: row.get(8)?,
        sort_order: row.get(9)?,
        favorite: row.get::<_, i32>(10)? != 0,
        usage_count: row.get(11)?,
        last_used_at: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn map_text_expansion(row: &rusqlite::Row<'_>) -> SqlResult<TextExpansion> {
    Ok(TextExpansion {
        id: row.get(0)?,
        abbreviation: row.get(1)?,
        expanded_text: row.get(2)?,
        enabled: row.get::<_, i32>(3)? != 0,
        created_at: row.get(4)?,
    })
}

fn map_process_rule(row: &rusqlite::Row<'_>) -> SqlResult<ProcessRule> {
    Ok(ProcessRule {
        id: row.get(0)?,
        process_name: row.get(1)?,
        group_id: row.get(2)?,
        created_at: row.get(3)?,
    })
}
