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
  game_type?: string | null;
  billing_type: "daily" | "monthly";
  status: string;
  runtime_status?: string | null;
  expire_at: string | null;
  mcsm_uuid: string | null;
  sftp_username: string | null;
  console_plan_id?: string | null;
  console_plan_selected_at?: string | null;
  require_console_plan_selection?: boolean;
  selected_template_id?: string | null;
  require_version_selection?: boolean;
  version_initialized_at?: string | null;
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
  game_type?: string;
}

export interface GameTemplate {
  id: string;
  game_type: string;
  template_family: string;
  version_label: string;
  build_identifier?: string | null;
  display_name: string;
  description?: string | null;
  docker_image: string;
  startup_command: string;
  stop_command: string;
  download_url?: string | null;
  upstream_download_url?: string | null;
  mirror_url?: string | null;
  mirror_status?: string | null;
  mirror_error?: string | null;
  mirrored_at?: string | null;
  environment?: Record<string, unknown>;
  source?: string;
  source_ref?: string | null;
  mcsm_instance_type?: string;
  default_port?: number | null;
  port_protocol?: string | null;
  is_active: boolean;
  server_software?: string;
  minecraft_version?: string;
}

export type MinecraftTemplate = GameTemplate;

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

export const getTemplates = async (params?: {
  game_type?: string;
  template_family?: string;
  version_label?: string;
}) => {
  const res = await request.get(`${getBaseUrl()}/templates`, { params });
  return res.data as { templates: GameTemplate[] };
};

export const getMinecraftTemplates = async (params?: {
  server_software?: string;
  minecraft_version?: string;
}) =>
  getTemplates({
    game_type: "minecraft",
    template_family: params?.server_software,
    version_label: params?.minecraft_version,
  });

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
    require_console_plan_selection: boolean;
    plan: { id: string; name?: string; category?: string };
  };
};

export const setInstanceTemplate = async (instanceId: string, templateId: string) => {
  const res = await request.put(`${getBaseUrl()}/instances/${instanceId}/template`, {
    template_id: templateId
  });
  return res.data as {
    status: string;
    instance_id: string;
    selected_template_id: string;
    require_version_selection: boolean;
    runtime_status: string;
    template: GameTemplate;
  };
};

export const setInstanceMinecraftTemplate = setInstanceTemplate;

export const initializeInstanceVersion = async (instanceId: string) => {
  const res = await request.post(`${getBaseUrl()}/instances/${instanceId}/initialize-version`);
  return res.data as {
    status: string;
    instance_id: string;
    selected_template_id: string;
    runtime_status: string;
    version_initialized_at: string;
  };
};

export const switchInstanceTemplate = async (
  instanceId: string,
  templateId: string,
  createBackup = true
) => {
  const res = await request.post(`${getBaseUrl()}/instances/${instanceId}/switch-template`, {
    template_id: templateId,
    create_backup: createBackup,
  });
  return res.data as {
    status: string;
    instance_id: string;
    selected_template_id: string;
    runtime_status: string;
    version_initialized_at: string;
    backup_id?: string | null;
  };
};

export const switchMinecraftTemplate = switchInstanceTemplate;
