<script setup lang="ts">
import { t } from "@/lang/i18n";
import { computed, h, onMounted, ref } from "vue";
import type { LayoutCard } from "@/types";
import { userInfoApi } from "@/services/apis/index";
import { useRouter } from "vue-router";
import { useAppStateStore } from "@/stores/useAppStateStore";
import {
  backupInstance,
  getAssets,
  getPlans,
  renewDaily,
  renewMonthly,
  type PanelInstance
} from "@/services/apis/panel";
import { INSTANCE_STATUS, INSTANCE_STATUS_CODE } from "@/types/const";
import { parseTimestamp } from "../tools/time";
import { InputNumber, message, Modal } from "ant-design-vue";

defineProps<{
  card: LayoutCard;
}>();

const router = useRouter();
const { state: appState } = useAppStateStore();

const { execute, state } = userInfoApi();
const panelInstances = ref<PanelInstance[]>([]);
const planDailyPriceMap = ref(new Map<string, number>());
const planMonthlyPriceMap = ref(new Map<string, number>());

const panelInstanceMap = computed(() => {
  const map = new Map<string, PanelInstance>();
  for (const inst of panelInstances.value) {
    if (inst.mcsm_uuid) map.set(inst.mcsm_uuid, inst);
  }
  return map;
});

const showBillingModal = (title: string, content: string) => {
  Modal.warning({ title, content });
};

const columns = [
  {
    title: t("TXT_CODE_f70badb9"),
    dataIndex: "nickname",
    key: "nickname"
  },
  {
    title: t("TXT_CODE_5476e012"),
    dataIndex: "status",
    key: "status",
    customRender: (e: { text: INSTANCE_STATUS_CODE }) => {
      return INSTANCE_STATUS[e.text] || e.text;
    }
  },
  {
    title: t("TXT_CODE_5ab2062d"),
    dataIndex: "lastDatetime",
    key: "lastDatetime",
    customRender: (e: { text: number }) => {
      return parseTimestamp(e.text);
    }
  },
  {
    title: t("TXT_CODE_fa920c0"),
    dataIndex: "endTime",
    key: "endTime",
    customRender: (e: { text: number }) => {
      return parseTimestamp(e.text) || t("TXT_CODE_abc080d");
    }
  },
  {
    title: "計費",
    key: "billing"
  },
  {
    title: "操作",
    key: "actions"
  }
];

const getInstanceList = async () => {
  await execute({
    params: {
      advanced: true
    }
  });
  const username = appState.userInfo?.userName;
  if (!username) return;
  try {
    const data = await getAssets(username);
    panelInstances.value = data.instances;
  } catch {
    panelInstances.value = [];
  }
};

const getPlansData = async () => {
  try {
    const data = await getPlans();
    planDailyPriceMap.value = new Map(
      data.plans.map((plan) => [
        plan.id,
        plan.daily_price ?? Math.round(plan.monthly_price / 30)
      ])
    );
    planMonthlyPriceMap.value = new Map(
      data.plans.map((plan) => [plan.id, plan.monthly_price])
    );
  } catch {
    planDailyPriceMap.value = new Map();
    planMonthlyPriceMap.value = new Map();
  }
};

const isExpired = (panel?: PanelInstance) => {
  if (!panel?.expire_at) return false;
  return new Date(panel.expire_at) < new Date();
};

const operate = (daemonId: string, instanceId: string, panel?: PanelInstance) => {
  if (isExpired(panel)) {
    return;
  }
  router.push({
    path: "/instances/terminal",
    query: {
      daemonId,
      instanceId
    }
  });
};

const resolvePanelInstance = (record: any) => {
  return panelInstanceMap.value.get(record.instanceUuid);
};

const openRenewModal = (panel: PanelInstance) => {
  const isMonthly = panel.billing_type === "monthly";
  const quantity = ref(1);
  const unitPrice = isMonthly
    ? planMonthlyPriceMap.value.get(panel.plan_id) ?? 0
    : planDailyPriceMap.value.get(panel.plan_id) ?? 0;

  Modal.confirm({
    title: isMonthly ? "月租續費" : "日租續費",
    content: () =>
      h("div", { style: "display:flex;flex-direction:column;gap:12px;" }, [
        h(
          "div",
          isMonthly
            ? `每月 ${unitPrice} 金幣，請選擇要續幾個月`
            : `每日 ${unitPrice} 金幣，請選擇要續幾天`
        ),
        h(InputNumber as any, {
          min: 1,
          precision: 0,
          value: quantity.value,
          style: "width:100%;",
          addonAfter: isMonthly ? "個月" : "天",
          "onUpdate:value": (value: number | null) => {
            quantity.value = Math.max(1, Number(value || 1));
          }
        })
      ]),
    onOk: async () => {
      const safeQuantity = Math.max(1, Number(quantity.value || 1));
      try {
        if (isMonthly) {
          await renewMonthly(panel.id, safeQuantity);
        } else {
          await renewDaily(panel.id, safeQuantity * 24);
        }
        message.success("續費成功");
        await getInstanceList();
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        if (detail === "insufficient_balance") {
          showBillingModal("金幣不足", "目前金幣不足，無法完成此次續費。請先前往商城儲值。");
        } else {
          message.error(detail || "續費失敗");
        }
      }
    }
  });
};

const openBackupModal = (panel: PanelInstance) => {
  const versionName = ref("");
  Modal.confirm({
    title: "建立備份",
    content: () =>
      h("div", {
        style:
          "display:flex;flex-direction:column;gap:12px;padding:4px 0;color:#1f2937;"
      }, [
        h(
          "div",
          {
            style:
              "font-size:14px;line-height:1.6;color:#1f2937;background:#f8fafc;border:1px solid #dbe4ee;border-radius:8px;padding:10px 12px;"
          },
          "將目前伺服器資料打包成 tar.gz 備份到 HDD。"
        ),
        h("input", {
          value: versionName.value,
          placeholder: "輸入備份名稱，例如：生存服 Day 7",
          style:
            "width:100%;padding:10px 12px;border:1px solid #94a3b8;border-radius:8px;outline:none;background:#ffffff;color:#111827;box-sizing:border-box;",
          onInput: (event: Event) => {
            versionName.value = (event.target as HTMLInputElement).value;
          }
        })
      ]),
    onOk: async () => {
      try {
        await backupInstance(panel.id, versionName.value.trim() || undefined);
        message.success("備份完成");
      } catch (err: any) {
        message.error(err?.response?.data?.detail || "備份失敗");
      }
    }
  });
};

onMounted(() => {
  getInstanceList();
  getPlansData();
});
</script>

<template>
  <CardPanel>
    <template #title>{{ card.title }}</template>
    <template #body>
      <a-table
        :data-source="state?.instances"
        :columns="columns"
        :pagination="false"
        :scroll="{ x: 'max-content' }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'billing'">
            <template v-if="resolvePanelInstance(record)">
              <a-tag :color="resolvePanelInstance(record)?.billing_type === 'monthly' ? 'blue' : 'green'">
                {{ resolvePanelInstance(record)?.billing_type === "monthly" ? "月租" : "日租" }}
              </a-tag>
              <a-tag v-if="isExpired(resolvePanelInstance(record))" color="red">
                已到期
              </a-tag>
            </template>
            <span v-else>—</span>
          </template>
          <template v-if="column.key === 'nickname'">
            <a-button
              type="link"
              style="padding-left: 0"
              :disabled="record.status === INSTANCE_STATUS_CODE.BUSY || isExpired(resolvePanelInstance(record))"
              @click="operate(record.daemonId, record.instanceUuid, resolvePanelInstance(record))"
            >
              {{ record.nickname }}
            </a-button>
          </template>
          <template v-if="column.key === 'actions'">
            <div
              v-if="resolvePanelInstance(record)"
              style="display:flex;gap:8px;flex-wrap:wrap;"
            >
              <a-button
                size="small"
                type="primary"
                ghost
                :disabled="record.status === INSTANCE_STATUS_CODE.BUSY || isExpired(resolvePanelInstance(record))"
                @click="operate(record.daemonId, record.instanceUuid, resolvePanelInstance(record))"
              >
                進入
              </a-button>
              <a-button size="small" @click="openRenewModal(resolvePanelInstance(record)!)">
                續費
              </a-button>
              <a-button size="small" @click="openBackupModal(resolvePanelInstance(record)!)">
                備份
              </a-button>
            </div>
            <span v-else>—</span>
          </template>
        </template>
      </a-table>
    </template>
  </CardPanel>
</template>
