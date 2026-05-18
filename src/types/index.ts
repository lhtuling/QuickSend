export interface Group {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  created_at: string;
}

export interface Phrase {
  id: string;
  group_id: string;
  title: string;
  content: string;
  content_type: "text" | "image";
  image_data: string | null;
  hotkey: string | null;
  abbreviation: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TextExpansion {
  id: string;
  abbreviation: string;
  expanded_text: string;
  enabled: boolean;
  created_at: string;
}

export interface ProcessRule {
  id: string;
  process_name: string;
  group_id: string;
  created_at: string;
}

export interface Setting {
  key: string;
  value: string;
}
