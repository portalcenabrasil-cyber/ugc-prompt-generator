export interface KPIs {
  users: {
    total: number;
    active_plan: number;
    free: number;
    by_plan: Record<string, number>;
  };
  revenue: {
    last_30d_brl: number;
    mrr_brl: number;
  };
  api_costs: {
    last_30d_usd: number;
    last_30d_brl: number;
  };
  online_now: number;
  rate_usd_brl: number;
  ts: number;
}

export interface DailyMetric {
  id: string;
  date: string;
  revenue_brl: number;
  cost_usd: number;
  cost_brl: number;
  margin_brl: number;
  sales_count: number;
  new_users: number;
  active_users: number;
  generations: number;
  tokens_used: number;
}

export interface MetricsResponse {
  data: DailyMetric[];
  days: number;
}

export interface PresenceUser {
  user_id: string;
  email: string | null;
  current_page: string | null;
  current_action: string | null;
  last_ping_at: string;
  credits: number | null;
}

export interface PresenceResponse {
  data: PresenceUser[];
  online: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  plan: string | null;
  plan_active: boolean;
  generations_used: number;
  generations_limit: number;
  prompts_count: number;
  tokens_used: number;
  created_at: string;
}

export interface UsersResponse {
  data: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface Sale {
  id: string;
  kiwify_order_id: string | null;
  email: string;
  name: string | null;
  plan: string | null;
  amount_brl: number;
  net_brl: number | null;
  payment_method: string | null;
  kiwify_event: string | null;
  paid_at: string;
  created_at: string;
}

export interface SalesResponse {
  data: Sale[];
  total_brl: number;
  count: number;
}

export interface ApiCost {
  id: string;
  user_id: string | null;
  endpoint: string;
  style: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number | null;
  status: string;
  created_at: string;
}

export interface CostsResponse {
  data: ApiCost[];
  summary: {
    total_usd: number;
    total_brl: number;
    by_style: Record<string, number>;
    by_model: Record<string, number>;
  };
  rate_usd_brl: number;
}
