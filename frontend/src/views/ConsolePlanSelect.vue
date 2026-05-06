<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { router } from "@/config/router";
import {
  getAssets,
  getTemplates,
  initializeInstanceVersion,
  setInstanceTemplate,
  type GameTemplate,
  type PanelInstance
} from "@/services/apis/panel";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { computed, onMounted, ref } from "vue";
import { message } from "ant-design-vue";

const { state } = useAppStateStore();

const loading = ref(false);
const submittingTemplateId = ref("");
const initializingMessage = ref("");
const setupError = ref("");
const panelInstance = ref<PanelInstance | null>(null);
const templates = ref<GameTemplate[]>([]);
const selectedFamily = ref("");

const daemonId = computed(() => String(router.currentRoute.value.query.daemonId || ""));
const mcsmInstanceId = computed(() => String(router.currentRoute.value.query.instanceId || ""));
const softwareOptions = computed(() => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const template of templates.value) {
    const family = template.template_family;
    if (!family || seen.has(family)) continue;
    seen.add(family);
    ordered.push(family);
  }
  return ordered;
});
const filteredTemplates = computed(() => {
  if (!selectedFamily.value) return templates.value;
  return templates.value.filter((item) => item.template_family === selectedFamily.value);
});
const selectedFamilyLabel = computed(() => formatFamilyName(selectedFamily.value));
const gameTypeLabel = computed(() => formatGameType(panelInstance.value?.game_type || ""));
const isInitializing = computed(() => Boolean(submittingTemplateId.value));

const goTerminal = () => {
  router.replace({
    path: "/instances/terminal",
    query: {
      daemonId: daemonId.value,
      instanceId: mcsmInstanceId.value,
    }
  });
};

const loadData = async () => {
  const username = state.userInfo?.userName;
  if (!username || !mcsmInstanceId.value) return;
  loading.value = true;
  try {
    const assets = await getAssets(username);
    panelInstance.value = assets.instances.find((item) => item.mcsm_uuid === mcsmInstanceId.value) || null;
    if (!panelInstance.value) {
      message.error("找不到對應的實例資料");
      return;
    }
    setupError.value = "";
    if (panelInstance.value.runtime_status === "setup_failed") {
      setupError.value = "上次版本初始化失敗，請重新選擇版本或稍後再試。";
    }
    const templateRes = await getTemplates({ game_type: panelInstance.value.game_type || "minecraft" });
    templates.value = templateRes.templates;
    if (!selectedFamily.value && templates.value.length > 0) {
      selectedFamily.value = templates.value[0].template_family;
    }
    const versionSelectionDone = !(panelInstance.value.require_version_selection ?? panelInstance.value.require_console_plan_selection);
    if (versionSelectionDone && panelInstance.value.runtime_status === "active") {
      goTerminal();
    }
  } catch (err: any) {
    message.error(err?.response?.data?.detail || "讀取版本資料失敗");
  } finally {
    loading.value = false;
  }
};

const handleSelectTemplate = async (template: GameTemplate) => {
  if (!panelInstance.value) return;
  submittingTemplateId.value = template.id;
  setupError.value = "";
  initializingMessage.value = `正在套用 ${template.display_name}，會先停止實例、更新設定、準備檔案後再啟動。`;
  try {
    await setInstanceTemplate(panelInstance.value.id, template.id);
    initializingMessage.value = `正在初始化 ${template.display_name}，下載與解壓縮大型伺服器檔案可能需要較久。`;
    await initializeInstanceVersion(panelInstance.value.id);
    message.success(`已完成版本初始化：${template.display_name}`);
    goTerminal();
  } catch (err: any) {
    const detail = normalizeTemplateError(err?.response?.data?.detail);
    setupError.value = detail;
    message.error(detail);
    await loadData();
  } finally {
    submittingTemplateId.value = "";
    initializingMessage.value = "";
  }
};

onMounted(() => {
  loadData();
});

const formatFamilyName = (value: string) => {
  if (!value) return "未分類";
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const formatGameType = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "遊戲";
  const mapping: Record<string, string> = {
    minecraft: "Minecraft",
    palworld: "Palworld",
    rust: "Rust",
    "ark-survival-evolved": "ARK: Survival Evolved",
    "ark-survival-ascended": "ARK: Survival Ascended",
    enshrouded: "Enshrouded",
  };
  return mapping[normalized] || formatFamilyName(normalized);
};

const normalizeTemplateError = (detail?: string) => {
  const text = String(detail || "");
  if (text.includes("mirror_not_ready") || text.includes("bedrock_template_not_mirrored")) {
    return "此 Bedrock 模板尚未完成伺服器包快取，暫時不能套用。請改選已快取完成的 Bedrock 版本。";
  }
  return text || "設定版本失敗";
};
</script>

<template>
  <div class="console-plan-select-page">
    <CardPanel class="console-plan-select-card">
      <template #title>選擇 {{ gameTypeLabel }} 模板</template>
      <template #body>
        <a-spin :spinning="loading || isInitializing" :tip="initializingMessage || undefined">
          <div class="intro">
            <div class="intro-title">第一次進入此實例，需要先選擇 {{ gameTypeLabel }} 模板。</div>
            <div class="intro-sub">選擇後會記錄在此實例，後續初始化與版本切換都以此模板為基礎。</div>
          </div>

          <a-alert
            v-if="setupError"
            class="setup-alert"
            type="error"
            show-icon
            message="版本初始化未完成"
            :description="setupError"
          />

          <a-empty v-if="!loading && templates.length === 0" :description="`目前沒有可選擇的 ${gameTypeLabel} 模板`" />

          <template v-else>
            <div class="software-tabs">
              <button
                v-for="family in softwareOptions"
                :key="family"
                type="button"
                class="software-tab"
                :class="{ active: family === selectedFamily }"
                @click="selectedFamily = family"
              >
                {{ formatFamilyName(family) }}
              </button>
            </div>

            <div class="section-title">{{ selectedFamilyLabel }} 可用版本</div>

            <div class="plan-grid">
              <a-card v-for="template in filteredTemplates" :key="template.id" class="plan-card" hoverable>
              <div class="plan-name">{{ template.display_name }}</div>
              <div class="plan-meta">
                <span>版本：{{ template.version_label }}</span>
                <span v-if="template.build_identifier">Build：{{ template.build_identifier }}</span>
                <span>映像：{{ template.docker_image }}</span>
              </div>
              <a-button
                type="primary"
                block
                :loading="submittingTemplateId === template.id"
                @click="handleSelectTemplate(template)"
              >
                使用這個版本
              </a-button>
              </a-card>
            </div>
          </template>
        </a-spin>
      </template>
    </CardPanel>
  </div>
</template>

<style scoped lang="scss">
.console-plan-select-page {
  max-width: 1080px;
  margin: 0 auto;
  padding-bottom: 24px;
}

.console-plan-select-card {
  margin-top: 12px;
}

.intro {
  margin-bottom: 18px;
  padding: 14px 16px;
  border: 1px solid #dbe4ee;
  border-radius: 10px;
  background: #f8fbff;
}

.setup-alert {
  margin-bottom: 16px;
}

.intro-title {
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
}

.intro-sub {
  margin-top: 6px;
  color: #526074;
  font-size: 13px;
}

.software-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.software-tab {
  padding: 9px 14px;
  border: 1px solid #d5dfeb;
  border-radius: 999px;
  background: #f8fbff;
  color: #526074;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.software-tab.active {
  border-color: #6d8eb3;
  background: #e8f1fb;
  color: #213446;
  box-shadow: 0 4px 12px rgba(58, 91, 128, 0.12);
}

.section-title {
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 700;
  color: #243447;
}

.plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.plan-card {
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: linear-gradient(180deg, rgba(248, 251, 255, 0.72), rgba(241, 246, 252, 0.62));
  color: #334155;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.035);
  backdrop-filter: blur(6px);
}

.plan-card:hover {
  border-color: rgba(120, 145, 172, 0.34);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
}

.plan-card :deep(.ant-card-body) {
  background: transparent;
  color: #334155;
}

.plan-name {
  font-size: 16px;
  font-weight: 700;
  color: #243447;
  margin-bottom: 10px;
  letter-spacing: 0.01em;
}

.plan-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #5f7085;
  font-size: 13px;
  margin-bottom: 14px;
}
</style>
