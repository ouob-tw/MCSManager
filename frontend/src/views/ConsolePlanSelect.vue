<script setup lang="ts">
import CardPanel from "@/components/CardPanel.vue";
import { router } from "@/config/router";
import { getAssets, getPlans, setInstanceConsolePlan, type PanelInstance, type PanelPlan } from "@/services/apis/panel";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { computed, onMounted, ref } from "vue";
import { message } from "ant-design-vue";

const { state } = useAppStateStore();

const loading = ref(false);
const submittingPlanId = ref("");
const panelInstance = ref<PanelInstance | null>(null);
const plans = ref<PanelPlan[]>([]);

const daemonId = computed(() => String(router.currentRoute.value.query.daemonId || ""));
const mcsmInstanceId = computed(() => String(router.currentRoute.value.query.instanceId || ""));

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
    const [assets, planRes] = await Promise.all([getAssets(username), getPlans()]);
    panelInstance.value = assets.instances.find((item) => item.mcsm_uuid === mcsmInstanceId.value) || null;
    plans.value = planRes.plans;
    if (!panelInstance.value) {
      message.error("找不到對應的實例資料");
      return;
    }
    if (panelInstance.value.console_plan_id) {
      goTerminal();
    }
  } catch (err: any) {
    message.error(err?.response?.data?.detail || "讀取版本資料失敗");
  } finally {
    loading.value = false;
  }
};

const handleSelectPlan = async (plan: PanelPlan) => {
  if (!panelInstance.value) return;
  submittingPlanId.value = plan.id;
  try {
    await setInstanceConsolePlan(panelInstance.value.id, plan.id);
    message.success(`已設定控制台版本：${plan.name}`);
    goTerminal();
  } catch (err: any) {
    message.error(err?.response?.data?.detail || "設定版本失敗");
  } finally {
    submittingPlanId.value = "";
  }
};

onMounted(() => {
  loadData();
});
</script>

<template>
  <div class="console-plan-select-page">
    <CardPanel class="console-plan-select-card">
      <template #title>選擇控制台版本</template>
      <template #body>
        <a-spin :spinning="loading">
          <div class="intro">
            <div class="intro-title">第一次進入此實例，需要先選擇版本。</div>
            <div class="intro-sub">選擇後會記錄在此實例，下次進入將直接開啟控制台。</div>
          </div>

          <a-empty v-if="!loading && plans.length === 0" description="目前沒有可選擇的版本" />

          <div v-else class="plan-grid">
            <a-card v-for="plan in plans" :key="plan.id" class="plan-card" hoverable>
              <div class="plan-name">{{ plan.name }}</div>
              <div class="plan-meta">
                <span>類型：{{ plan.category || "—" }}</span>
                <span>RAM {{ plan.ram_mb / 1024 }} GB</span>
                <span>儲存 {{ plan.storage_gb }} GB</span>
              </div>
              <a-button
                type="primary"
                block
                :loading="submittingPlanId === plan.id"
                @click="handleSelectPlan(plan)"
              >
                使用這個版本
              </a-button>
            </a-card>
          </div>
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
