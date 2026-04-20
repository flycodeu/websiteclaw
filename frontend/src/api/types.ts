export type Site = {
  id: number;
  name: string;
  url: string;
  platform: string;
  enabled: boolean;
  timeout_seconds: number;
  capture_screenshot: boolean;
  extractor_type: string;
  extractor_rules: Record<string, string>;
  ai_enabled: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type SitePayload = {
  name: string;
  url: string;
  platform: string;
  enabled: boolean;
  timeout_seconds: number;
  capture_screenshot: boolean;
  extractor_type: string;
  extractor_rules: Record<string, string>;
  ai_enabled: boolean;
  notes?: string;
};

export type SystemInfo = {
  version: string;
  started_at: string;
  features: {
    ai_providers: boolean;
    record_center?: boolean;
    system_settings?: boolean;
  };
};

export type SystemSettings = {
  id: number;
  feishu_enabled: boolean;
  feishu_app_token?: string | null;
  feishu_main_table_id?: string | null;
  feishu_product_table_id?: string | null;
  feishu_auto_sync: boolean;
  created_at: string;
  updated_at: string;
};

export type SystemSettingsPayload = {
  feishu_enabled: boolean;
  feishu_app_token?: string;
  feishu_main_table_id?: string;
  feishu_product_table_id?: string;
  feishu_auto_sync: boolean;
};

export type ProductItem = {
  product_key: string;
  name: string;
  price: string;
  stock: string;
  warranty: string;
  product_url: string;
  tags: string[];
};

export type ExecutionProduct = {
  id: number;
  record_id: number;
  sort_order: number;
  product_key?: string | null;
  name: string;
  price_text?: string | null;
  price_normalized?: string | null;
  stock_text?: string | null;
  stock_normalized?: string | null;
  warranty: string;
  product_url?: string | null;
  tags: string[];
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type ExecutionProductPayload = {
  sort_order?: number;
  product_key?: string;
  name: string;
  price_text?: string;
  price_normalized?: string;
  stock_text?: string;
  stock_normalized?: string;
  warranty: string;
  product_url?: string;
  tags?: string[];
  notes?: string;
};

export type ExecutionProductUpdatePayload = Partial<ExecutionProductPayload>;

export type ExecutionRecord = {
  id: number;
  site_id: number;
  snapshot_id?: number | null;
  site_name: string;
  site_url: string;
  final_url?: string | null;
  platform: string;
  status: string;
  manual_review_status: string;
  review?: string | null;
  screenshot_path?: string | null;
  is_accessible?: boolean | null;
  ai_summary?: string | null;
  ai_analysis?: Record<string, unknown> | null;
  feishu_sync_status: string;
  feishu_main_record_id?: string | null;
  feishu_product_sync_count: number;
  feishu_sync_error?: string | null;
  stability_level: string;
  stability_summary?: string | null;
  products_summary?: string | null;
  product_count: number;
  share_token?: string | null;
  captured_at?: string | null;
  created_at: string;
  updated_at: string;
  products: ExecutionProduct[];
};

export type ExecutionRecordUpdatePayload = {
  status?: string;
  manual_review_status?: string;
  review?: string;
};

export type ExecutionRecordShareResponse = {
  record_id: number;
  share_token: string;
};

export type Snapshot = {
  id: number;
  site_id: number;
  status: string;
  sync_status: string;
  ai_status: string;
  screenshot_upload_status: string;
  title?: string | null;
  final_url?: string | null;
  source_url: string;
  screenshot_path?: string | null;
  screenshot_file_token?: string | null;
  html_path?: string | null;
  visible_text?: string | null;
  extracted_json?: Record<string, unknown> | null;
  ai_summary?: string | null;
  ai_error_message?: string | null;
  feishu_record_id?: string | null;
  challenge_reason?: string | null;
  error_message?: string | null;
  crawled_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskLog = {
  id: number;
  site_id: number;
  snapshot_id?: number | null;
  task_type: string;
  status: string;
  duration_ms?: number | null;
  message?: string | null;
  created_at: string;
};

export type ManualSession = {
  session_id: string;
  snapshot_id: number;
  site_id: number;
  status: string;
  challenge_reason?: string | null;
  expires_at: string;
  instruction: string;
};

export type ManualSessionAction = {
  session_id: string;
  snapshot_id: number;
  status: string;
  message: string;
};
