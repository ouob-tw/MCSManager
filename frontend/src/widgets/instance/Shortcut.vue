<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { openInstanceTagsEditor, useDeleteInstanceDialog } from "@/components/fc/index";
import TextContainer from "@/components/TextContainer.vue";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useInstanceInfo, verifyEULA } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import {
  killInstance,
  openInstance,
  restartInstance,
  stopInstance,
  updateInstance
} from "@/services/apis/instance";
import {
  renewDaily,
  renewMonthly,
  type PanelInstance
} from "@/services/apis/panel";
import { useLayoutContainerStore } from "@/stores/useLayoutContainerStore";
import { arrayFilter } from "@/tools/array";
import { formatMemoryUsage } from "@/tools/memory";
import { parseTimestamp } from "@/tools/time";
import { reportErrorMsg } from "@/tools/validator";
import type { InstanceDetail, LayoutCard } from "@/types/index";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  CloudDownloadOutlined,
  CodeOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  TagsOutlined,
  UserOutlined
} from "@ant-design/icons-vue";
import { InputNumber, message, Modal } from "ant-design-vue";
import _ from "lodash";
import { computed, h, ref } from "vue";

const props = defineProps<{
  card: LayoutCard;
  targetInstanceInfo?: InstanceDetail;
  targetDaemonId?: string;
  panelInstance?: PanelInstance;
  dailyPrice?: number;
  monthlyPrice?: number;
}>();

const emits = defineEmits(["refreshList"]);

const isExpired = computed(() => {
  if (!props.panelInstance?.expire_at) return false;
  return new Date(props.panelInstance.expire_at) < new Date();
});

const formattedExpire = computed(() => {
  if (!props.panelInstance?.expire_at) return null;
  return new Date(props.panelInstance.expire_at).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false
  });
});

const renewLoading = ref(false);
const renewMonthlyLoading = ref(false);

const showBillingModal = (title: string, content: string) => {
  Modal.warning({ title, content });
};

const handleRenew = async (event: MouseEvent) => {
  event.stopPropagation();
  const inst = props.panelInstance;
  if (!inst) return;
  const days = ref(1);
  Modal.confirm({
    title: "確認續費",
    content: () =>
      h("div", { style: "display:flex;flex-direction:column;gap:12px;" }, [
        h("div", `每日 ${props.dailyPrice ?? 0} 金幣，選擇要續幾天`),
        h(InputNumber as any, {
          min: 1,
          precision: 0,
          value: days.value,
          style: "width:100%;",
          addonAfter: "天",
          "onUpdate:value": (value: number | null) => {
            days.value = Math.max(1, Number(value || 1));
          }
        })
      ]),
    onOk: async () => {
      const safeDays = Math.max(1, Number(days.value || 1));
      renewLoading.value = true;
      try {
        await renewDaily(inst.id, safeDays * 24);
        message.success("續費成功！");
        refreshList();
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        if (detail === "insufficient_balance") {
          showBillingModal("金幣不足", "目前金幣不足，無法完成此次續費。請先前往商城儲值。");
        } else {
          message.error(detail || "續費失敗，請稍後再試");
        }
      } finally {
        renewLoading.value = false;
      }
    }
  });
};

const handleRenewMonthly = async (event: MouseEvent) => {
  event.stopPropagation();
  const inst = props.panelInstance;
  if (!inst) return;
  const months = ref(1);
  Modal.confirm({
    title: "確認月租續費",
    content: () =>
      h("div", { style: "display:flex;flex-direction:column;gap:12px;" }, [
        h("div", `每月 ${props.monthlyPrice ?? 0} 金幣，選擇要續幾個月`),
        h(InputNumber as any, {
          min: 1,
          precision: 0,
          value: months.value,
          style: "width:100%;",
          addonAfter: "個月",
          "onUpdate:value": (value: number | null) => {
            months.value = Math.max(1, Number(value || 1));
          }
        })
      ]),
    onOk: async () => {
      const safeMonths = Math.max(1, Number(months.value || 1));
      renewMonthlyLoading.value = true;
      try {
        await renewMonthly(inst.id, safeMonths);
        message.success("月租續費成功！");
        refreshList();
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        if (detail === "insufficient_balance") {
          showBillingModal("金幣不足", "目前金幣不足，無法完成此次續費。請先前往商城儲值。");
        } else {
          message.error(detail || "續費失敗，請稍後再試");
        }
      } finally {
        renewMonthlyLoading.value = false;
      }
    }
  });
};


const { containerState } = useLayoutContainerStore();
const { getMetaOrRouteValue } = useLayoutCardTools(props.card);
const { toPage } = useAppRouters();
const instanceId = props.targetInstanceInfo?.instanceUuid || getMetaOrRouteValue("instanceId");
const daemonId = props.targetDaemonId || getMetaOrRouteValue("daemonId");

const { statusText, isRunning, isStopped, instanceTypeText, instanceInfo } = useInstanceInfo({
  instanceId: props.targetInstanceInfo ? undefined : instanceId,
  daemonId: props.targetInstanceInfo ? undefined : daemonId,
  autoRefresh: props.targetInstanceInfo ? false : true,
  instanceInfo: props.targetInstanceInfo ? ref(props.targetInstanceInfo) : undefined
});

const operationConfig = {
  params: {
    uuid: instanceId || "",
    daemonId: daemonId || ""
  }
};

const { isLoading: openLoading, execute: executeOpen } = openInstance();
const { isLoading: stopLoading, execute: executeStop } = stopInstance();
const { isLoading: restartLoading, execute: executeRestart } = restartInstance();
const { isLoading: killLoading, execute: executeKill } = killInstance();
const { isLoading: updateLoading, execute: executeUpdate } = updateInstance();

const refreshList = () => {
  setTimeout(() => {
    emits("refreshList");
  }, 500);
};

const actions = {
  start: async () => {
    const flag = await verifyEULA(instanceId ?? "", daemonId ?? "");
    if (!flag) return;
    await executeOpen(operationConfig);
    message.success(t("TXT_CODE_e13abbb1"));
  },
  stop: async () => {
    await executeStop(operationConfig);
    message.success(t("TXT_CODE_efb6d377"));
  },
  restart: async () => {
    await executeRestart(operationConfig);
    message.success(t("TXT_CODE_efb6d377"));
  },
  kill: async () => {
    await executeKill(operationConfig);
    message.success(t("TXT_CODE_efb6d377"));
  },
  update: async () => {
    await executeUpdate({
      params: {
        uuid: instanceId || "",
        daemonId: daemonId || "",
        task_name: "update"
      },
      data: {
        time: new Date().getTime()
      }
    });
    message.success(t("TXT_CODE_b1600db0"));
  }
};

const execInstanceAction = async (
  event: MouseEvent,
  actName: "start" | "stop" | "restart" | "kill" | "update"
) => {
  if (isExpired.value) {
    message.error("此伺服器已到期，請先續費");
    return;
  }
  const action = actions[actName];
  try {
    if (action) {
      await action();
      refreshList();
    }
  } catch (error) {
    reportErrorMsg(error);
  }
};

const instanceOperations = computed(() =>
  arrayFilter([
    {
      title: t("TXT_CODE_57245e94"),
      icon: PlayCircleOutlined,
      click: async (event: MouseEvent) => {
        event.stopPropagation();
        await execInstanceAction(event, "start");
      },
      loading: openLoading.value,
      disabled: containerState.isDesignMode || isExpired.value,
      condition: () => isStopped.value
    },
    {
      title: t("TXT_CODE_b1dedda3"),
      icon: PauseCircleOutlined,
      click: (event: MouseEvent) => {
        event.stopPropagation();
        Modal.confirm({
          title: t("TXT_CODE_893567ac"),
          content: t("TXT_CODE_6da85509"),
          onOk: async () => {
            execInstanceAction(event, "stop");
          }
        });
        return false;
      },
      loading: stopLoading.value,
      disabled: containerState.isDesignMode || isExpired.value,
      condition: () => isRunning.value
    },
    {
      title: t("TXT_CODE_47dcfa5"),
      icon: RedoOutlined,
      click: async (event: MouseEvent) => {
        event.stopPropagation();
        Modal.confirm({
          title: t("TXT_CODE_893567ac"),
          content: t("TXT_CODE_f6bd907d"),
          onOk: async () => {
            execInstanceAction(event, "restart");
          }
        });
      },
      loading: restartLoading.value,
      disabled: containerState.isDesignMode || isExpired.value,
      condition: () => isRunning.value
    },
    {
      title: t("TXT_CODE_40ca4f2"),
      icon: CloudDownloadOutlined,
      click: async (event: MouseEvent) => {
        event.stopPropagation();
        execInstanceAction(event, "update");
      },
      loading: updateLoading.value,
      disabled: containerState.isDesignMode || isExpired.value,
      condition: () => isStopped.value
    },
    {
      title: t("TXT_CODE_7b67813a"),
      icon: CloseOutlined,
      click: async (event: MouseEvent) => {
        event.stopPropagation();
        Modal.confirm({
          title: t("TXT_CODE_893567ac"),
          content: t("TXT_CODE_ec08484"),
          onOk: async () => {
            execInstanceAction(event, "kill");
          }
        });
      },
      loading: killLoading.value,
      disabled: containerState.isDesignMode || isExpired.value,
      danger: true,
      condition: () => !isStopped.value
    },
    {
      area: true
    },
    {
      title: t("TXT_CODE_78e88c3f"),
      icon: TagsOutlined,
      click: async (event: MouseEvent) => {
        event.stopPropagation();
        if (instanceId && daemonId) {
          const tags = instanceInfo.value?.config.tag || [];
          const newTags = await openInstanceTagsEditor(instanceId, daemonId, tags);
          if (!_.isEqual(newTags, tags)) refreshList();
        }
      },
      disabled: containerState.isDesignMode
    },
    {
      title: t("TXT_CODE_524e3036"),
      icon: CodeOutlined,
      click: (event: MouseEvent) => {
        event.stopPropagation();
        if (isExpired.value) {
          message.error("此伺服器已到期，請先續費");
          return;
        }
        toPage({
          path: "/instances/terminal",
          query: {
            daemonId,
            instanceId
          }
        });
      },
      disabled: containerState.isDesignMode || isExpired.value
    },
    {
      title: t("TXT_CODE_a0e19f38"),
      icon: DeleteOutlined,
      click: async (event: MouseEvent) => {
        event.stopPropagation();
        const deleteInstanceResult = await useDeleteInstanceDialog(
          instanceId || "",
          daemonId || ""
        );
        if (!deleteInstanceResult) return;
        message.success(t("TXT_CODE_f486dbb4"));
        refreshList();
      },
      danger: true,
      disabled: containerState.isDesignMode
    }
  ])
);
</script>

<template>
  <CardPanel style="width: 100%; height: 100%; position: relative">
    <template #title>
      {{ instanceInfo?.config.nickname }}
    </template>
    <template #operator> </template>
    <template #body>
      <div class="instance-card-body">
        <a-typography-paragraph>
          <div class="mb-8 flex" style="flex-wrap: wrap; gap: 8px">
            <a-tag class="m-0" :color="isRunning ? 'green' : 'blue'">
              <span v-if="isRunning">
                <CheckCircleOutlined />
                {{ statusText }}
              </span>
              <span v-else-if="isStopped">
                <ExclamationCircleOutlined />
                {{ statusText }}
              </span>
              <span v-else>
                <ExclamationCircleOutlined />
                {{ statusText }}
              </span>
            </a-tag>
            <a-tag class="m-0" color="blue">
              {{ instanceTypeText }}
            </a-tag>
            <div v-if="instanceInfo?.config.tag && instanceInfo?.config.tag.length > 0">|</div>
            <a-tag v-for="item in instanceInfo?.config.tag" :key="item" class="m-0">
              {{ item }}
            </a-tag>
          </div>

          <div class="instance-info-line">
            <span class="title">{{ t("TXT_CODE_34611898") }}:</span>
            <span class="value"> {{ parseTimestamp(instanceInfo?.config.lastDatetime) }}</span>
          </div>
          <div v-if="instanceInfo?.config.endTime && !panelInstance" class="instance-info-line">
            <span class="title">{{ t("TXT_CODE_fa920c0") }}:</span>
            <span> {{ parseTimestamp(instanceInfo?.config.endTime) }}</span>
          </div>
          <div
            v-if="
              instanceInfo?.config?.docker?.image && instanceInfo?.config?.processType === 'docker'
            "
            class="instance-info-line"
          >
            <span class="title">{{ t("TXT_CODE_77000411") }}:</span>
            <span class="value">
              <TextContainer :text="instanceInfo?.config?.docker?.image" :max-length="26" />
            </span>
          </div>
          <div v-if="instanceInfo?.info.memoryUsage" class="instance-info-line">
            <span class="title">{{ t("TXT_CODE_593ee330") }}:</span>
            <span class="value">
              {{
                formatMemoryUsage(instanceInfo?.info.memoryUsage, instanceInfo?.info.memoryLimit)
              }}
            </span>
          </div>
          <div v-if="instanceInfo?.info.mcPingOnline" class="instance-info-line">
            <span class="title">{{ t("TXT_CODE_e4dce83f") }}:</span>
            <span class="value" style="vertical-align: middle">
              <UserOutlined />
              {{ instanceInfo?.info.currentPlayers }} / {{ instanceInfo?.info.maxPlayers }}
            </span>
          </div>

          <template v-if="panelInstance">
            <div class="instance-info-line">
              <span class="title">計費:</span>
              <a-tag
                :color="panelInstance.billing_type === 'monthly' ? 'blue' : 'green'"
                class="m-0"
                style="font-size: 11px; line-height: 18px"
              >
                {{ panelInstance.billing_type === "monthly" ? "月租" : "日租" }}
              </a-tag>
            </div>
            <div v-if="formattedExpire" class="instance-info-line">
              <span class="title">到期:</span>
              <span
                class="value"
                :style="isExpired ? 'color: #ff4d4f; font-weight: 600' : ''"
              >
                <CalendarOutlined />
                {{ formattedExpire }}
                <span v-if="isExpired">（已到期）</span>
              </span>
            </div>
          </template>
        </a-typography-paragraph>

        <a-space warp :size="6" class="mb-4">
          <div v-for="item in instanceOperations" :key="item.title">
            <a-divider v-if="item.area" type="vertical" />
            <a-tooltip v-else :title="item.title">
              <a-button
                size="small"
                :loading="item.loading"
                :disabled="item.disabled"
                :danger="item.danger"
                @click="item.click"
              >
                <component :is="item.icon" style="font-size: 13px"></component>
              </a-button>
            </a-tooltip>
          </div>
        </a-space>

        <div v-if="panelInstance && panelInstance.billing_type === 'daily'" class="renew-bar" @click.stop>
          <a-button
            size="small"
            type="primary"
            ghost
            :loading="renewLoading"
            @click="handleRenew"
          >
            续费 24h（{{ dailyPrice ?? 0 }} 金幣）
          </a-button>
        </div>
        <div v-if="panelInstance && panelInstance.billing_type === 'monthly'" class="renew-bar" @click.stop>
          <a-button
            size="small"
            type="primary"
            ghost
            :loading="renewMonthlyLoading"
            @click="handleRenewMonthly"
          >
            月租續費 30 天（{{ monthlyPrice ?? 0 }} 金幣）
          </a-button>
        </div>
      </div>
    </template>
  </CardPanel>
</template>

<style clang="scss" scoped>
.instance-card {
  cursor: pointer;
  min-height: 170px;
  transition: border 0.3s ease;
}
.instance-card:hover {
  border: 1px solid var(--color-gray-8);
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.16);
}
.instance-tag-container {
  margin-left: -4px;
  margin-right: -4px;
}
.group-name-tag {
  margin: 4px;
}

.instance-card-body {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
}

.instance-info-line {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;

  .title {
    margin-right: 10px;
  }

  .value {
    opacity: 0.8;
  }
}

.renew-bar {
  margin-top: 6px;
}

</style>
