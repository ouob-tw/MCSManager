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
  console_plan_id?: string | null;
  console_plan_selected_at?: string | null;
}

export interface PanelArchive {
  id: string;
  instance_id: string;
  path: string;
  size_bytes: number;
  status: string;
  version_name?: string | null;
  restored_at?: string | null;
  created_at?: string;
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
  return res.data as { user: PanelUser; instances: PanelInstance[]; archives: PanelArchive[] };
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

export const newMonthlyInstance = async (params: {
  mcsm_username: string;
  plan_id: string;
  days?: number;
}) => {
  const res = await request.post(`${getBaseUrl()}/instances/new_monthly`, params);
  return res.data;
};

export const renewDaily = async (instanceId: string, hours = 24) => {
  const res = await request.post(
    `${getBaseUrl()}/instances/${instanceId}/renew_daily`,
    null,
    { params: { hours } }
  );
  return res.data;
};

export const renewMonthly = async (instanceId: string, months = 1) => {
  const res = await request.post(
    `${getBaseUrl()}/instances/${instanceId}/renew_monthly`,
    null,
    { params: { months } }
  );
  return res.data;
};

export const backupInstance = async (instanceId: string, versionName?: string) => {
  const res = await request.post(`${getBaseUrl()}/instances/${instanceId}/backup`, {
    version_name: versionName
  });
  return res.data as { status: string; archive: PanelArchive };
};

export const restoreArchive = async (
  instanceId: string,
  archiveId: string,
  mode: "overwrite_current" | "new_daily" | "new_monthly" = "overwrite_current"
) => {
  const res = await request.post(`${getBaseUrl()}/instances/${instanceId}/restore`, {
    archive_id: archiveId,
    mode
  });
  return res.data as {
    status: string;
    archive: PanelArchive;
    mode: "overwrite_current" | "new_daily" | "new_monthly";
    instance_id: string;
    username?: string;
    password?: string;
    mcsm_uuid?: string | null;
    expire_at?: string;
  };
};

export const renameArchive = async (instanceId: string, archiveId: string, versionName: string) => {
  const res = await request.patch(`${getBaseUrl()}/instances/${instanceId}/archives/${archiveId}`, {
    version_name: versionName
  });
  return res.data as { status: string; archive: PanelArchive };
};

export const deleteArchive = async (instanceId: string, archiveId: string) => {
  const res = await request.delete(`${getBaseUrl()}/instances/${instanceId}/archives/${archiveId}`);
  return res.data as { status: string };
};

export const getInstanceArchives = async (instanceId: string) => {
  const res = await request.get(`${getBaseUrl()}/instances/${instanceId}/archives`);
  return res.data as { archives: PanelArchive[] };
};

export const setInstanceConsolePlan = async (instanceId: string, planId: string) => {
  const res = await request.put(`${getBaseUrl()}/instances/${instanceId}/console-plan`, {
    plan_id: planId
  });
  return res.data as {
    status: string;
    instance_id: string;
    console_plan_id: string;
    console_plan_selected_at: string;
    plan: { id: string; name?: string; category?: string };
  };
};
