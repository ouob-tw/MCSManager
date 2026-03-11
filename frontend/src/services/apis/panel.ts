import axios from "axios";

const PANEL_PORT = 8000;
const getBaseUrl = () => {
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:${PANEL_PORT}/panel`;
};

const request = axios.create();

export interface PanelUser {
  id: string;
  email: string;
  balance: number;
}

export interface PanelInstance {
  id: string;
  plan_id: string;
  billing_type: "daily" | "monthly";
  status: string;
  expire_at: string | null;
  mcsm_uuid: string | null;
  sftp_username: string | null;
}

export interface PanelPlan {
  id: string;
  name: string;
  monthly_price: number;
  daily_price: number | null;
  ram_mb: number;
  storage_gb: number;
  category: string;
}

export const getAssets = async (mcsmUsername: string) => {
  const res = await request.get(`${getBaseUrl()}/assets`, {
    params: { mcsm_username: mcsmUsername },
  });
  return res.data as { user: PanelUser; instances: PanelInstance[]; archives: any[] };
};

export const getPlans = async () => {
  const res = await request.get(`${getBaseUrl()}/plans`);
  return res.data as { plans: PanelPlan[] };
};

export const newDailyInstance = async (params: {
  mcsm_username: string;
  plan_id: string;
  hours?: number;
}) => {
  const res = await request.post(`${getBaseUrl()}/instances/new_daily`, params);
  return res.data;
};

export const renewDaily = async (instanceId: string, hours = 24, cost = 0) => {
  const res = await request.post(
    `${getBaseUrl()}/instances/${instanceId}/renew_daily`,
    null,
    { params: { hours, cost } }
  );
  return res.data;
};
