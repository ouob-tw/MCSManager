<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { openMarketDialog, openRenewalDialog } from "@/components/fc";
import IconBtn from "@/components/IconBtn.vue";
import TerminalCore from "@/components/TerminalCore.vue";
import TerminalTags from "@/components/TerminalTags.vue";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { INSTANCE_TYPE_TRANSLATION, verifyEULA } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import {
  getAssets,
  getTemplates,
  switchInstanceTemplate,
  type GameTemplate,
  type PanelInstance
} from "@/services/apis/panel";
import {
  killInstance,
  openInstance,
  restartInstance,
  stopInstance,
  updateInstance
} from "@/services/apis/instance";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { sleep } from "@/tools/common";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard } from "@/types";
import { INSTANCE_CRASH_TIMEOUT, INSTANCE_STATUS } from "@/types/const";
import {
  ApartmentOutlined,
  BlockOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  DownOutlined,
  HddOutlined,
  InfoCircleOutlined,
  InteractionOutlined,
  LaptopOutlined,
  LoadingOutlined,
  MoneyCollectOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined
} from "@ant-design/icons-vue";
import { useLocalStorage } from "@vueuse/core";
import { message, Modal } from "ant-design-vue";
import prettyBytes, { type Options as PrettyOptions } from "pretty-bytes";
import { computed, h, onMounted, onUnmounted, ref } from "vue";
import type { TagInfo } from "../../components/interface";
import { GLOBAL_INSTANCE_NAME } from "../../config/const";
import { useTerminal, type UseTerminalHook } from "../../hooks/useTerminal";
import { arrayFilter } from "../../tools/array";

const props = defineProps<{
  card: LayoutCard;
}>();

const { isPhone } = useScreen();
const { state, isAdmin } = useAppStateStore();
const { getMetaOrRouteValue } = useLayoutCardTools(props.card);

// The `useTerminal` is shared by this component and `TerminalCore`.
// Please do not initialize `useTerminal` in this component; all initialization logic should be placed in its child component `TerminalCore.vue`.
// The state of the shared terminal is used here.
const terminalHook: UseTerminalHook = useTerminal();
const {
  state: instanceInfo,
  isStopped,
  isRunning,
  isBuys,
  isGlobalTerminal,
  isDockerMode,
  clearTerminal
} = terminalHook;

const instanceId = getMetaOrRouteValue("instanceId");
const daemonId = getMetaOrRouteValue("daemonId");
const viewType = getMetaOrRouteValue("viewType", false);
const innerTerminalType = computed(() => props.card.width === 12 && viewType === "inner");
const instanceTypeText = computed(
  () => INSTANCE_TYPE_TRANSLATION[instanceInfo.value?.config.type ?? -1]
);
const consolePlanName = ref("");
const panelInstanceRecord = ref<PanelInstance | null>(null);
const gameTemplates = ref<GameTemplate[]>([]);
const isSwitchVersionVisible = ref(false);
const switchingTemplateId = ref("");
const versionSwitchProgressSteps = [
  "正在建立自動備份",
  "正在停止目前伺服器",
  "正在套用新版本設定",
  "正在重新啟動伺服器",
  "正在確認伺服器狀態"
] as const;
const isVersionSwitching = ref(false);
const versionSwitchTargetName = ref("");
const versionSwitchCurrentStep = ref(0);
let versionSwitchStepTimer: number | null = null;
const recentVersionSwitchName = ref("");
let recentVersionSwitchTimer: number | null = null;
const currentTemplate = computed(() =>
  gameTemplates.value.find((item) => item.id === panelInstanceRecord.value?.selected_template_id) || null
);
const switchableTemplates = computed(() => {
  const family = currentTemplate.value?.template_family;
  if (!family) return gameTemplates.value;
  return gameTemplates.value.filter((item) => item.template_family === family);
});
const switchTemplateFamilyName = computed(() =>
  formatTemplateFamily(currentTemplate.value?.template_family || switchableTemplates.value[0]?.template_family || "")
);
const switchableTargetCount = computed(() =>
  switchableTemplates.value.filter((item) => item.id !== panelInstanceRecord.value?.selected_template_id).length
);
const versionSwitchProgressPercent = computed(() =>
  Math.round(((versionSwitchCurrentStep.value + 1) / versionSwitchProgressSteps.length) * 100)
);
const versionSwitchCurrentLabel = computed(
  () => versionSwitchProgressSteps[versionSwitchCurrentStep.value] || versionSwitchProgressSteps[0]
);

const { execute: requestOpenInstance, isLoading: isOpenInstanceLoading } = openInstance();

let checkRunningTimer: NodeJS.Timeout;
const toOpenInstance = async () => {
  if (checkRunningTimer) clearTimeout(checkRunningTimer);
  clearTerminal();
  try {
    if (instanceInfo.value?.config?.type?.startsWith("minecraft/java")) {
      const flag = await verifyEULA(instanceId ?? "", daemonId ?? "");
      if (!flag) return;
      await sleep(1000);
    }

    await requestOpenInstance({
      params: {
        uuid: instanceId ?? "",
        daemonId: daemonId ?? ""
      }
    });

    checkRunningTimer = setTimeout(() => {
      if (!terminalHook.isRunning.value) {
        Modal.error({
          title: t("TXT_CODE_ac405b50"),
          content: h("div", [
            h("p", t("TXT_CODE_3409258a")),
            h("p", `${t("TXT_CODE_973414e1")}：${instanceInfo.value?.config.startCommand || ""}`),
            isDockerMode.value &&
              h("p", `${t("TXT_CODE_44b585c7")}：${instanceInfo.value?.config.docker.image || ""}`)
          ])
        });
      }
    }, INSTANCE_CRASH_TIMEOUT);
  } catch (error: any) {
    reportErrorMsg(error);
  }
};

const updateCmd = computed(() => (instanceInfo.value?.config.updateCommand ? true : false));
const instanceStatusText = computed(() => INSTANCE_STATUS[instanceInfo.value?.status ?? -1]);
const quickOperations = computed(() =>
  arrayFilter([
    {
      title: t("TXT_CODE_57245e94"),
      icon: PlayCircleOutlined,
      noConfirm: false,
      type: "default",
      class: "button-color-success",
      click: toOpenInstance,
      props: {},
      condition: () => isStopped.value
    },
    {
      title: t("TXT_CODE_b1dedda3"),
      icon: PauseCircleOutlined,
      type: "default",
      click: async () => {
        try {
          await stopInstance().execute({
            params: {
              uuid: instanceId || "",
              daemonId: daemonId || ""
            }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      props: {
        danger: true
      },
      condition: () => isRunning.value
    }
  ])
);
const instanceOperations = computed(() =>
  arrayFilter([
    {
      title: t("TXT_CODE_47dcfa5"),
      icon: RedoOutlined,
      type: "default",
      noConfirm: false,
      click: async () => {
        try {
          await restartInstance().execute({
            params: {
              uuid: instanceId || "",
              daemonId: daemonId || ""
            }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      condition: () => isRunning.value
    },
    {
      title: t("TXT_CODE_7b67813a"),
      icon: CloseOutlined,
      type: "danger",
      class: "color-warning",
      click: async () => {
        try {
          await killInstance().execute({
            params: {
              uuid: instanceId || "",
              daemonId: daemonId || ""
            }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      condition: () => !isStopped.value
    },
    {
      title: t("TXT_CODE_40ca4f2"),
      type: "default",
      icon: CloudDownloadOutlined,
      click: async () => {
        try {
          clearTerminal();
          await updateInstance().execute({
            params: {
              uuid: instanceId || "",
              daemonId: daemonId || "",
              task_name: "update"
            },
            data: {
              time: new Date().getTime()
            }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      condition: () => isStopped.value && updateCmd.value
    },
    {
      title: t("TXT_CODE_b19ed1dd"),
      icon: InteractionOutlined,
      noConfirm: true,
      click: async () => {
        try {
          clearTerminal();
          await openMarketDialog(daemonId ?? "", instanceId ?? "", {
            autoInstall: true,
            onlyDockerTemplate: isDockerMode.value
          });
        } catch (error: any) {
          // ignore
        }
      },
      props: {},
      condition: () =>
        isStopped.value &&
        (state.settings.allowUsePreset || isAdmin.value) &&
        !isGlobalTerminal.value
    },
    {
      title: t("TXT_CODE_f77093c8"),
      icon: MoneyCollectOutlined,
      noConfirm: true,
      click: async () => {
        await openRenewalDialog(
          instanceInfo.value?.instanceUuid ?? "",
          daemonId ?? "",
          instanceInfo.value?.config.category ?? 0
        );
      },
      props: {},
      condition: () => !!instanceInfo.value?.config?.category
    }
  ])
);

const getInstanceName = computed(() => {
  if (instanceInfo.value?.config.nickname === GLOBAL_INSTANCE_NAME) {
    return t("TXT_CODE_5bdaf23d");
  } else {
    return instanceInfo.value?.config.nickname;
  }
});

const useByteUnit = useLocalStorage("useByteUnit", true); // true: bytes, false: bits
const prettyBytesConfig: PrettyOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  binary: true
};

const getUsageColor = (percentage?: number) => {
  percentage = Number(percentage);
  if (percentage > 600) return "error";
  if (percentage > 200) return "warning";
  return "default";
};

const formatMemoryUsage = (usage?: number, limit?: number) => {
  const fUsage = prettyBytes(usage ?? 0, prettyBytesConfig);
  const fLimit = prettyBytes(limit ?? 0, prettyBytesConfig);

  return limit ? `${fUsage} / ${fLimit}` : fUsage;
};

const formatNetworkSpeed = (bytes?: number) =>
  useByteUnit.value
    ? prettyBytes(bytes ?? 0, { ...prettyBytesConfig, binary: false }) + "/s"
    : prettyBytes((bytes ?? 0) * 8, { ...prettyBytesConfig, bits: true, binary: false }).replace(
        /bit$/,
        "b"
      ) + "ps";

const terminalTopTags = computed<TagInfo[]>(() => {
  const info = instanceInfo.value?.info;
  if (!info || isStopped.value) return [];
  const {
    cpuUsage,
    memoryUsage,
    memoryLimit,
    memoryUsagePercent,
    rxBytes,
    txBytes,
    storageUsage,
    storageLimit
  } = info;

  return arrayFilter<TagInfo>([
    {
      label: t("TXT_CODE_b862a158"),
      value: `${parseInt(String(cpuUsage))}%`,
      color: getUsageColor(cpuUsage),
      icon: BlockOutlined,
      condition: () => cpuUsage != null
    },
    {
      label: t("TXT_CODE_593ee330"),
      value: formatMemoryUsage(memoryUsage, memoryLimit),
      color: getUsageColor(memoryUsagePercent),
      icon: DashboardOutlined,
      condition: () => memoryUsage != null
    },
    {
      label: t("TXT_CODE_DISK_USAGE"),
      value: formatMemoryUsage(storageUsage, storageLimit),
      icon: HddOutlined,
      condition: () => storageUsage != null
    },
    {
      label: t("TXT_CODE_50daec4"),
      value: `↓${formatNetworkSpeed(rxBytes)} · ↑${formatNetworkSpeed(txBytes)}`,
      icon: ApartmentOutlined,
      condition: () => rxBytes != null || txBytes != null,
      onClick: () => {
        useByteUnit.value = !useByteUnit.value;
      }
    }
  ]);
});

const isAgentVisible = ref(true);
const toggleAgent = () => {
  isAgentVisible.value = !isAgentVisible.value;
};

// Horizontal Splitter - 可拖曳調整寬度
const agentWidth = ref(380);
const isDragging = ref(false);
const minAgentWidth = 280;
const maxAgentWidth = 600;

const startDrag = (e: MouseEvent) => {
  isDragging.value = true;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
  e.preventDefault();
};

const onDrag = (e: MouseEvent) => {
  if (!isDragging.value) return;
  const container = document.querySelector('.terminal-agent-container');
  if (!container) return;
  const containerRect = container.getBoundingClientRect();
  const newWidth = containerRect.right - e.clientX;
  agentWidth.value = Math.min(maxAgentWidth, Math.max(minAgentWidth, newWidth));
};

const stopDrag = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

const panelHeightStyle = computed(() => {
  if (isPhone.value) return undefined;
  return { height: `${props.card.height}px` };
});

onUnmounted(() => {
  if (checkRunningTimer) clearTimeout(checkRunningTimer);
  stopVersionSwitchProgress();
  clearRecentVersionSwitch();
});

onMounted(async () => {
  if (isAdmin.value) return;
  if (!state.userInfo?.userName || !instanceId) return;
  try {
    const assets = await getAssets(state.userInfo.userName);
    panelInstanceRecord.value = assets.instances.find((item) => item.mcsm_uuid === instanceId) || null;
    const templateRes = await getTemplates({ game_type: panelInstanceRecord.value?.game_type || "minecraft" });
    gameTemplates.value = templateRes.templates;
    const selectedTemplate = templateRes.templates.find((item) => item.id === panelInstanceRecord.value?.selected_template_id);
    consolePlanName.value = selectedTemplate?.display_name || "";
  } catch {
    consolePlanName.value = "";
  }
});

const openSwitchVersionModal = () => {
  if (!panelInstanceRecord.value) {
    message.error("找不到對應的版本資料");
    return;
  }
  if (isVersionSwitching.value) {
    message.info("版本切換進行中，請稍候");
    return;
  }
  isSwitchVersionVisible.value = true;
};

const startVersionSwitchProgress = (displayName: string) => {
  stopVersionSwitchProgress();
  isVersionSwitching.value = true;
  versionSwitchTargetName.value = displayName;
  versionSwitchCurrentStep.value = 0;
  versionSwitchStepTimer = window.setInterval(() => {
    if (versionSwitchCurrentStep.value >= versionSwitchProgressSteps.length - 1) return;
    versionSwitchCurrentStep.value += 1;
  }, 3500);
};

const stopVersionSwitchProgress = () => {
  if (versionSwitchStepTimer) {
    window.clearInterval(versionSwitchStepTimer);
    versionSwitchStepTimer = null;
  }
  isVersionSwitching.value = false;
  versionSwitchTargetName.value = "";
  versionSwitchCurrentStep.value = 0;
};

const showRecentVersionSwitch = (displayName: string) => {
  clearRecentVersionSwitch();
  recentVersionSwitchName.value = displayName;
  recentVersionSwitchTimer = window.setTimeout(() => {
    clearRecentVersionSwitch();
  }, 20000);
};

const clearRecentVersionSwitch = () => {
  if (recentVersionSwitchTimer) {
    window.clearTimeout(recentVersionSwitchTimer);
    recentVersionSwitchTimer = null;
  }
  recentVersionSwitchName.value = "";
};

const handleSwitchVersion = async (template: GameTemplate) => {
  if (!panelInstanceRecord.value || template.id === panelInstanceRecord.value.selected_template_id) return;
  switchingTemplateId.value = template.id;
  isSwitchVersionVisible.value = false;
  startVersionSwitchProgress(template.display_name);
  try {
    await switchInstanceTemplate(panelInstanceRecord.value.id, template.id, true);
    panelInstanceRecord.value = {
      ...panelInstanceRecord.value,
      selected_template_id: template.id,
      runtime_status: "active"
    };
    consolePlanName.value = template.display_name;
    versionSwitchCurrentStep.value = versionSwitchProgressSteps.length - 1;
    showRecentVersionSwitch(template.display_name);
    message.success(`已切換至 ${template.display_name}，並完成自動備份`);
  } catch (error: any) {
    stopVersionSwitchProgress();
    message.error(error?.response?.data?.detail || "切換版本失敗");
  } finally {
    if (isVersionSwitching.value) {
      window.setTimeout(() => {
        stopVersionSwitchProgress();
      }, 1200);
    }
    switchingTemplateId.value = "";
  }
};

const formatTemplateFamily = (value: string) => {
  if (!value) return "目前模板";
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};
</script>

<template>
  <!-- Terminal Page View -->
  <div v-if="innerTerminalType">
    <div class="mb-24">
      <BetweenMenus>
        <template #left>
          <div class="align-center">
            <a-typography-title class="mb-0 mr-12" :level="4">
              <CloudServerOutlined />
              <span class="ml-6"> {{ getInstanceName }} </span>
            </a-typography-title>
            <a-typography-paragraph v-if="!isPhone" class="mb-0 ml-4">
              <span class="ml-6">
                <a-tag v-if="isRunning" color="green">
                  <CheckCircleOutlined />
                  {{ instanceStatusText }}
                </a-tag>
                <a-tag v-else-if="isBuys" color="red">
                  <LoadingOutlined />
                  {{ instanceStatusText }}
                </a-tag>
                <a-tag v-else-if="instanceStatusText">
                  <InfoCircleOutlined />
                  {{ instanceStatusText }}
                </a-tag>
              </span>

              <a-tag v-if="instanceTypeText" color="purple"> {{ instanceTypeText }} </a-tag>
              <a-tag v-if="consolePlanName" color="blue">版本：{{ consolePlanName }}</a-tag>
              <a-button
                v-if="consolePlanName && !isAdmin"
                size="small"
                class="ml-8"
                @click="openSwitchVersionModal"
              >
                切換版本
              </a-button>

              <span
                v-if="instanceInfo?.watcher && instanceInfo?.watcher > 1 && !isPhone"
                class="ml-16"
              >
                <a-tooltip>
                  <template #title>
                    {{ t("TXT_CODE_4a37ec9c") }}
                  </template>
                  <LaptopOutlined />
                </a-tooltip>
                <span class="ml-6" style="opacity: 0.8">
                  {{ instanceInfo?.watcher }}
                </span>
              </span>
            </a-typography-paragraph>
          </div>
        </template>
        <template #right>
          <div v-if="!isPhone">
            <template v-for="item in [...quickOperations, ...instanceOperations]" :key="item.title">
              <a-button
                v-if="item.noConfirm"
                class="ml-8"
                :class="item.class ? item.class : ''"
                :danger="item.type === 'danger'"
                :disabled="isOpenInstanceLoading"
                @click="item.click"
              >
                <component :is="item.icon" />
                {{ item.title }}
              </a-button>
              <a-popconfirm
                v-else
                :key="item.title"
                :title="t('TXT_CODE_276756b2')"
                @confirm="item.click"
              >
                <a-button
                  class="ml-8"
                  :danger="item.type === 'danger'"
                  :class="item.class ? item.class : ''"
                >
                  <component :is="item.icon" />
                  {{ item.title }}
                </a-button>
              </a-popconfirm>
            </template>
            <a-button class="ml-8" @click="toggleAgent">
              {{ isAgentVisible ? '隱藏助理' : '顯示助理' }}
            </a-button>
          </div>

          <a-dropdown v-else>
            <template #overlay>
              <a-menu>
                <a-menu-item
                  v-for="item in [...quickOperations, ...instanceOperations]"
                  :key="item.title"
                  @click="item.click"
                >
                  <component :is="item.icon" />
                  {{ item.title }}
                </a-menu-item>
              </a-menu>
            </template>
            <a-button type="primary">
              {{ t("TXT_CODE_fe731dfc") }}
              <DownOutlined />
            </a-button>
          </a-dropdown>
        </template>
      </BetweenMenus>
    </div>

    <div class="mb-10 flex justify-end">
      <TerminalTags :tags="terminalTopTags" />
    </div>
    <div v-if="isVersionSwitching" class="version-switch-progress-card mb-12">
      <div class="version-switch-progress-header">
        <div class="version-switch-progress-title">正在切換版本</div>
        <div class="version-switch-progress-target">目標版本：{{ versionSwitchTargetName }}</div>
      </div>
      <a-progress :percent="versionSwitchProgressPercent" status="active" size="small" />
      <div class="version-switch-progress-step">目前進度：{{ versionSwitchCurrentLabel }}</div>
    </div>
    <div v-else-if="recentVersionSwitchName" class="version-switch-success-card mb-12">
      <div class="version-switch-success-title">版本切換完成</div>
      <div class="version-switch-success-target">目前版本：{{ recentVersionSwitchName }}</div>
    </div>
    <!-- Agent Scope + Terminal 並排佈局 -->
    <div class="terminal-agent-container">
      <div class="terminal-main" :style="panelHeightStyle">
        <TerminalCore
          v-if="instanceId && daemonId"
          :use-terminal-hook="terminalHook"
          :instance-id="instanceId"
          :daemon-id="daemonId"
          :height="card.height"
        />
      </div>
      <!-- Horizontal Splitter -->
      <div
        v-if="instanceId && daemonId && isAgentVisible"
        class="splitter-handle"
        @mousedown="startDrag"
      ></div>
      <div
        class="agent-sidebar"
        v-if="instanceId && daemonId"
        v-show="isAgentVisible"
        :style="{ ...panelHeightStyle, width: `${agentWidth}px` }"
      >
        <iframe
          class="agent-iframe"
          :src="`http://localhost:8000/static/agent.html?daemon=${daemonId}&instance=${instanceId}`"
          frameborder="0"
          allow="clipboard-write"
        ></iframe>
      </div>
    </div>
  </div>

  <!-- Other Page View -->
  <CardPanel v-else class="containerWrapper" style="height: 100%">
    <template #title>
      <CloudServerOutlined />
      <span class="ml-8"> {{ getInstanceName }} </span>
      <span class="ml-8">
        <a-tag v-if="isRunning" color="green">
          <CheckCircleOutlined />
          {{ instanceStatusText }}
        </a-tag>
        <a-tag v-else-if="isBuys" color="red">
          <LoadingOutlined />
          {{ instanceStatusText }}
        </a-tag>
        <a-tag v-else>
          <InfoCircleOutlined />
          {{ instanceStatusText }}
        </a-tag>
        <a-tag color="purple"> {{ instanceTypeText }} </a-tag>
        <a-tag v-if="consolePlanName" color="blue">版本：{{ consolePlanName }}</a-tag>
        <a-button
          v-if="consolePlanName && !isAdmin"
          size="small"
          class="ml-8"
          @click="openSwitchVersionModal"
        >
          切換版本
        </a-button>
      </span>
    </template>
    <template #operator>
      <span
        v-for="item in quickOperations"
        :key="item.title"
        size="default"
        class="mr-2"
        v-bind="item.props"
      >
        <IconBtn :icon="item.icon" :title="item.title" @click="item.click"></IconBtn>
      </span>
      <a-dropdown>
        <template #overlay>
          <a-menu>
            <a-menu-item v-for="item in instanceOperations" :key="item.title" @click="item.click">
              <component :is="item.icon"></component>
              <span>&nbsp;{{ item.title }}</span>
            </a-menu-item>
          </a-menu>
        </template>
        <span size="default" type="primary">
          <IconBtn :icon="DownOutlined" :title="t('TXT_CODE_fe731dfc')"></IconBtn>
        </span>
      </a-dropdown>
    </template>
    <template #body>
      <div class="mb-6">
        <TerminalTags :tags="terminalTopTags" />
      </div>
      <div v-if="isVersionSwitching" class="version-switch-progress-card mb-12">
        <div class="version-switch-progress-header">
          <div class="version-switch-progress-title">正在切換版本</div>
          <div class="version-switch-progress-target">目標版本：{{ versionSwitchTargetName }}</div>
        </div>
        <a-progress :percent="versionSwitchProgressPercent" status="active" size="small" />
        <div class="version-switch-progress-step">目前進度：{{ versionSwitchCurrentLabel }}</div>
      </div>
      <div v-else-if="recentVersionSwitchName" class="version-switch-success-card mb-12">
        <div class="version-switch-success-title">版本切換完成</div>
        <div class="version-switch-success-target">目前版本：{{ recentVersionSwitchName }}</div>
      </div>
      <TerminalCore
        v-if="instanceId && daemonId"
        :use-terminal-hook="terminalHook"
        :instance-id="instanceId"
        :daemon-id="daemonId"
        :height="card.height"
      />
    </template>
  </CardPanel>

  <a-modal
    v-model:open="isSwitchVersionVisible"
    class="version-switch-modal"
    width="760px"
    :footer="null"
  >
    <template #title>
      <div class="version-switch-modal-title">
        <InteractionOutlined />
        <span>切換遊戲模板</span>
      </div>
    </template>

    <div class="version-switch-hero">
      <div>
        <div class="version-switch-eyebrow">Template Switch</div>
        <div class="version-switch-heading">{{ switchTemplateFamilyName }} 版本切換</div>
        <div class="version-switch-description">
          系統會先建立自動備份，再停止伺服器並套用新版本設定。列表僅顯示同模板家族，避免跨遊戲或跨核心誤切。
        </div>
      </div>
      <div class="version-switch-summary">
        <div class="version-switch-summary-value">{{ switchableTargetCount }}</div>
        <div class="version-switch-summary-label">可切換版本</div>
      </div>
    </div>

    <div class="version-switch-current" v-if="currentTemplate">
      <div class="version-switch-current-label">目前版本</div>
      <div class="version-switch-current-name">{{ currentTemplate.display_name }}</div>
      <div class="version-switch-current-meta">
        <span>{{ currentTemplate.version_label }}</span>
        <span v-if="currentTemplate.build_identifier">Build {{ currentTemplate.build_identifier }}</span>
      </div>
    </div>

    <a-empty v-if="switchableTemplates.length === 0" description="目前沒有可切換的版本" />
    <div v-else class="version-switch-list">
      <div
        v-for="template in switchableTemplates"
        :key="template.id"
        class="version-switch-item"
        :class="{ current: template.id === panelInstanceRecord?.selected_template_id }"
      >
        <div class="version-switch-item-main">
          <div class="version-switch-item-topline">
            <div class="version-switch-name">{{ template.display_name }}</div>
            <a-tag v-if="template.id === panelInstanceRecord?.selected_template_id" color="blue">目前使用</a-tag>
          </div>
          <div class="version-switch-meta">
            <span>版本 {{ template.version_label }}</span>
            <span v-if="template.build_identifier">Build {{ template.build_identifier }}</span>
            <span>{{ template.docker_image }}</span>
          </div>
        </div>
        <a-button
          type="primary"
          class="version-switch-action"
          :class="{ 'is-current': template.id === panelInstanceRecord?.selected_template_id }"
          :ghost="template.id === panelInstanceRecord?.selected_template_id"
          :disabled="template.id === panelInstanceRecord?.selected_template_id"
          :loading="switchingTemplateId === template.id"
          @click="handleSwitchVersion(template)"
        >
          {{ template.id === panelInstanceRecord?.selected_template_id ? "目前版本" : "切換到此版本" }}
        </a-button>
      </div>
    </div>
    <div class="version-switch-footer">
      <div class="version-switch-footer-note">切換會產生備份版本，可在加值服務頁還原。</div>
      <a-button @click="isSwitchVersionVisible = false">關閉</a-button>
    </div>
  </a-modal>
</template>

<style scoped lang="scss">
.version-switch-modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #26374a;
  font-weight: 700;
}

.version-switch-hero {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
  padding: 18px;
  border: 1px solid rgba(142, 160, 181, 0.28);
  border-radius: 14px;
  background:
    radial-gradient(circle at top right, rgba(98, 134, 172, 0.18), transparent 38%),
    linear-gradient(135deg, #eef4f8 0%, #e6edf3 52%, #dde7ef 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58);
}

.version-switch-eyebrow {
  margin-bottom: 4px;
  color: #718196;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.version-switch-heading {
  color: #26374a;
  font-size: 18px;
  font-weight: 800;
}

.version-switch-description {
  max-width: 520px;
  margin-top: 8px;
  color: #5e6d7f;
  font-size: 13px;
  line-height: 1.65;
}

.version-switch-summary {
  min-width: 104px;
  padding: 12px 14px;
  border: 1px solid rgba(117, 138, 162, 0.22);
  border-radius: 12px;
  background: rgba(246, 250, 253, 0.68);
  text-align: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

.version-switch-summary-value {
  color: #2b3d51;
  font-size: 26px;
  font-weight: 800;
  line-height: 1;
}

.version-switch-summary-label {
  margin-top: 6px;
  color: #718196;
  font-size: 12px;
}

.version-switch-current {
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(145, 164, 186, 0.26);
  border-radius: 12px;
  background: linear-gradient(180deg, #f1f6fa 0%, #eaf1f6 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

.version-switch-current-label {
  color: #718196;
  font-size: 12px;
  font-weight: 700;
}

.version-switch-current-name {
  margin-top: 4px;
  color: #26374a;
  font-size: 15px;
  font-weight: 800;
}

.version-switch-current-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  color: #68788b;
  font-size: 12px;
}

.version-switch-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 430px;
  padding-right: 4px;
  overflow: auto;
}

.version-switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px;
  border: 1px solid rgba(145, 164, 186, 0.24);
  border-radius: 12px;
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.62), transparent 38%),
    linear-gradient(180deg, #f2f6fa 0%, #e9f0f6 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.56);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.version-switch-item:hover {
  border-color: rgba(105, 130, 158, 0.38);
  box-shadow: 0 8px 22px rgba(25, 43, 62, 0.07);
  transform: translateY(-1px);
}

.version-switch-item.current {
  border-color: rgba(91, 128, 168, 0.34);
  background:
    radial-gradient(circle at top left, rgba(200, 221, 240, 0.34), transparent 42%),
    linear-gradient(180deg, #eaf2f8 0%, #dfeaf3 100%);
}

.version-switch-item-main {
  min-width: 0;
  flex: 1;
}

.version-switch-item-topline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.version-switch-name {
  font-weight: 700;
  color: #26374a;
}

.version-switch-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 4px;
  font-size: 13px;
  color: #667789;
  word-break: break-all;
}

.version-switch-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid rgba(145, 164, 186, 0.24);
  margin-top: 16px;
}

.version-switch-footer-note {
  color: #718196;
  font-size: 12px;
}

.version-switch-action {
  flex: 0 0 auto;
}

.version-switch-action.is-current {
  color: #4c5e72 !important;
  border-color: #b5c4d4 !important;
  background: #e5edf4 !important;
  opacity: 1 !important;
  box-shadow: none !important;
}

:global(body.dark) .version-switch-modal-title,
:global(.dark) .version-switch-modal-title,
:global([data-theme="dark"]) .version-switch-modal-title {
  color: #e7edf5;
}

:global(body.dark) .version-switch-hero,
:global(.dark) .version-switch-hero,
:global([data-theme="dark"]) .version-switch-hero {
  border-color: #344458;
  background:
    radial-gradient(circle at top right, rgba(84, 132, 184, 0.2), transparent 36%),
    linear-gradient(135deg, #182230 0%, #111827 100%);
}

:global(body.dark) .version-switch-heading,
:global(.dark) .version-switch-heading,
:global([data-theme="dark"]) .version-switch-heading,
:global(body.dark) .version-switch-summary-value,
:global(.dark) .version-switch-summary-value,
:global([data-theme="dark"]) .version-switch-summary-value,
:global(body.dark) .version-switch-current-name,
:global(.dark) .version-switch-current-name,
:global([data-theme="dark"]) .version-switch-current-name,
:global(body.dark) .version-switch-name,
:global(.dark) .version-switch-name,
:global([data-theme="dark"]) .version-switch-name {
  color: #edf4fb;
}

:global(body.dark) .version-switch-description,
:global(.dark) .version-switch-description,
:global([data-theme="dark"]) .version-switch-description,
:global(body.dark) .version-switch-eyebrow,
:global(.dark) .version-switch-eyebrow,
:global([data-theme="dark"]) .version-switch-eyebrow,
:global(body.dark) .version-switch-summary-label,
:global(.dark) .version-switch-summary-label,
:global([data-theme="dark"]) .version-switch-summary-label,
:global(body.dark) .version-switch-current-label,
:global(.dark) .version-switch-current-label,
:global([data-theme="dark"]) .version-switch-current-label,
:global(body.dark) .version-switch-current-meta,
:global(.dark) .version-switch-current-meta,
:global([data-theme="dark"]) .version-switch-current-meta,
:global(body.dark) .version-switch-meta,
:global(.dark) .version-switch-meta,
:global([data-theme="dark"]) .version-switch-meta,
:global(body.dark) .version-switch-footer-note,
:global(.dark) .version-switch-footer-note,
:global([data-theme="dark"]) .version-switch-footer-note {
  color: #aab8c7;
}

:global(body.dark) .version-switch-summary,
:global(.dark) .version-switch-summary,
:global([data-theme="dark"]) .version-switch-summary {
  border-color: #3f5064;
  background: rgba(15, 23, 42, 0.52);
}

:global(body.dark) .version-switch-current,
:global(.dark) .version-switch-current,
:global([data-theme="dark"]) .version-switch-current {
  border-color: #344458;
  background: #151f2c;
}

:global(body.dark) .version-switch-item,
:global(.dark) .version-switch-item,
:global([data-theme="dark"]) .version-switch-item {
  border-color: #344458;
  background: linear-gradient(180deg, #182230 0%, #121b27 100%);
}

:global(body.dark) .version-switch-item:hover,
:global(.dark) .version-switch-item:hover,
:global([data-theme="dark"]) .version-switch-item:hover {
  border-color: #53677f;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
}

:global(body.dark) .version-switch-item.current,
:global(.dark) .version-switch-item.current,
:global([data-theme="dark"]) .version-switch-item.current {
  border-color: #4a6684;
  background: linear-gradient(180deg, #203044 0%, #182536 100%);
}

:global(body.dark) .version-switch-footer,
:global(.dark) .version-switch-footer,
:global([data-theme="dark"]) .version-switch-footer {
  border-top-color: #344458;
}

:global(body.dark) .version-switch-action.is-current,
:global(.dark) .version-switch-action.is-current,
:global([data-theme="dark"]) .version-switch-action.is-current {
  color: #e7edf5 !important;
  border-color: #6f86a1 !important;
  background: #314355 !important;
}

@media (max-width: 640px) {
  .version-switch-hero,
  .version-switch-item,
  .version-switch-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .version-switch-summary {
    text-align: left;
  }

  .version-switch-action {
    width: 100%;
  }
}

.version-switch-progress-card {
  padding: 14px 16px;
  border-radius: 12px;
  background: #f6f9fc;
  border: 1px solid #d7e1eb;
}

.version-switch-progress-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.version-switch-progress-title {
  font-size: 15px;
  font-weight: 700;
  color: #223245;
}

.version-switch-progress-target {
  font-size: 13px;
  color: #526074;
}

.version-switch-progress-step {
  margin-top: 10px;
  font-size: 13px;
  color: #526074;
}

.version-switch-success-card {
  padding: 14px 16px;
  border-radius: 12px;
  background: #f4fbf6;
  border: 1px solid #cfe7d5;
}

.version-switch-success-title {
  font-size: 15px;
  font-weight: 700;
  color: #1d5b33;
}

.version-switch-success-target {
  margin-top: 6px;
  font-size: 13px;
  color: #355844;
}
</style>

<style lang="scss" scoped>
.error-card {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 0;
  z-index: 10;
  border-radius: 20px;

  display: flex;
  align-items: center;
  justify-content: center;

  .error-card-container {
    overflow: hidden;
    max-width: 440px;
    border: 1px solid var(--color-gray-6) !important;
    background-color: var(--color-gray-1);
    border-radius: 4px;
    padding: 12px;
    box-shadow: 0px 0px 2px var(--color-gray-7);
  }

  @media (max-width: 992px) {
    .error-card-container {
      max-width: 90vw !important;
    }
  }
}
.console-wrapper {
  position: relative;

  .terminal-loading {
    z-index: 12;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .terminal-wrapper {
    border: 1px solid var(--card-border-color);
    position: relative;
    overflow: hidden;
    height: 100%;
    background-color: #1e1e1e;
    padding: 8px;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    .terminal-container {
      // min-width: 1200px;
      height: 100%;
    }

    margin-bottom: 12px;
  }

  .command-input {
    position: relative;

    .history {
      display: flex;
      max-width: 100%;
      overflow: scroll;
      z-index: 10;
      position: absolute;
      top: -35px;
      left: 0;

      li {
        list-style: none;
        span {
          padding: 3px 20px;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
        }
      }

      &::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
      }
    }
  }
}

/* Agent Scope Sidebar */
.terminal-agent-container {
  display: flex;
  gap: 16px;
  width: 100%;
  transition: all 0.3s ease;
  align-items: stretch;
}

.terminal-main {
  flex: 1;
  min-width: 0;
}

.agent-sidebar {
  width: 380px;
  align-self: stretch;
  background: #0f172a;
  border-radius: 8px;
  border: 1px solid #334155;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  display: flex;
  position: relative;
}

.agent-iframe {
  flex: 1;
  min-height: 0;
}

/* Splitter Handle */
.splitter-handle {
  width: 6px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s ease;
  border-radius: 3px;
  margin: 0 2px;

  &:hover,
  &:active {
    background: #3b82f6;
  }
}

/* 響應式優化 */
@media (max-width: 1200px) {
  .terminal-agent-container {
    flex-direction: column;
  }
  .agent-sidebar {
    width: 100%;
    height: 500px;
  }
}

</style>
