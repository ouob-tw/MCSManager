<script setup lang="ts">
import { useAppStateStore } from "@/stores/useAppStateStore";
import { UserOutlined, WalletOutlined, ShoppingCartOutlined, ScheduleOutlined, ReloadOutlined } from "@ant-design/icons-vue";
import { computed, ref, onMounted } from "vue";
import CardPanel from "@/components/CardPanel.vue";
import { getAssets, getPlans, newDailyInstance, type PanelPlan, type PanelInstance } from "@/services/apis/panel";
import { message } from "ant-design-vue";

const { state } = useAppStateStore();
const userInfo = computed(() => state.userInfo);

const userBalance = ref(0);
const instances = ref<PanelInstance[]>([]);
const plans = ref<PlanWithDailyPrice[]>([]);
const assetsLoading = ref(false);
const isRentModalOpen = ref(false);
const rentLoading = ref(false);

interface PlanWithDailyPrice extends PanelPlan {
  display_daily_price: number;
}

const loadAssets = async () => {
  const username = userInfo.value?.userName;
  if (!username) return;
  assetsLoading.value = true;
  try {
    const data = await getAssets(username);
    userBalance.value = data.user.balance;
    instances.value = data.instances;
  } catch (e) {
    // 用戶在我們系統中尚未建立（尚未購買方案）
  } finally {
    assetsLoading.value = false;
  }
};

const loadPlans = async () => {
  try {
    const data = await getPlans();
    plans.value = data.plans.map((p) => ({
      ...p,
      display_daily_price: p.daily_price ?? Math.round(p.monthly_price / 30),
    }));
  } catch (e) {
    // 靜默
  }
};

onMounted(() => {
  loadAssets();
  loadPlans();
});

const openShop = () => {
  window.open("https://shop.ouob.net", "_blank");
};

const handleRentClick = () => {
  isRentModalOpen.value = true;
};

const handleSelectPlan = async (plan: PlanWithDailyPrice) => {
  const username = userInfo.value?.userName;
  if (!username) return message.error("請先登入");
  rentLoading.value = true;
  try {
    const result = await newDailyInstance({ mcsm_username: username, plan_id: plan.id, hours: 24 });
    message.success(`伺服器開通成功！帳號：${result.username}`);
    isRentModalOpen.value = false;
    await loadAssets();
  } catch (err: any) {
    const detail = err?.response?.data?.detail;
    if (detail === "insufficient_balance") {
      message.error("金幣不足，請先前往商城儲值");
    } else if (detail === "no_account_please_topup") {
      message.error("帳號尚未建立，請先至商城購買儲值卡以開通帳號");
    } else {
      message.error(detail || "開通失敗，請稍後再試");
    }
  } finally {
    rentLoading.value = false;
  }
};

const activeInstances = computed(() =>
  instances.value.filter((i) => i.status === "active" || i.status === "provisioning")
);

const formatExpire = (expire_at: string | null) => {
  if (!expire_at) return "—";
  const d = new Date(expire_at);
  return d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
};

const isExpired = (expire_at: string | null) => {
  if (!expire_at) return false;
  return new Date(expire_at) < new Date();
};
</script>

<template>
  <div class="services-container">
    <a-row :gutter="[24, 24]">
      <!-- 帳號資訊 -->
      <a-col :span="24" :md="8">
        <CardPanel class="info-card">
          <template #title>帳號資訊</template>
          <template #body>
            <div class="user-info">
              <div class="info-item">
                <a-avatar :size="64">
                  <template #icon><UserOutlined /></template>
                </a-avatar>
                <div class="user-details">
                  <h3>{{ userInfo?.userName || "未登入" }}</h3>
                  <p class="text-secondary">{{ userInfo?.uuid || "-" }}</p>
                </div>
              </div>
              <div class="divider"></div>
              <div class="balance-sec">
                <div class="balance-label">目前餘額 (金幣)</div>
                <div class="balance-value">
                  <WalletOutlined />
                  <a-spin v-if="assetsLoading" size="small" />
                  <span v-else>{{ userBalance }}</span>
                </div>
                <a-button size="small" type="text" @click="loadAssets" style="margin-top: 8px">
                  <ReloadOutlined /> 重新整理
                </a-button>
              </div>
            </div>
          </template>
        </CardPanel>
      </a-col>

      <!-- 加值服務 -->
      <a-col :span="24" :md="16">
        <CardPanel>
          <template #title>加值與服務</template>
          <template #body>
            <div class="service-actions">
              <a-card hoverable class="action-card" @click="openShop">
                <div class="action-content">
                  <div class="icon-wrapper recharge-icon">
                    <ShoppingCartOutlined />
                  </div>
                  <div class="action-text">
                    <h4>快速儲值</h4>
                    <p>前往甲方商城購買金幣，支援多種付款方式</p>
                  </div>
                </div>
              </a-card>

              <a-card hoverable class="action-card mt-4" @click="handleRentClick">
                <div class="action-content">
                  <div class="icon-wrapper rent-icon">
                    <ScheduleOutlined />
                  </div>
                  <div class="action-text">
                    <h4>開通日租服務</h4>
                    <p>選擇方案，即刻用金幣啟用伺服器</p>
                  </div>
                </div>
              </a-card>
            </div>
          </template>
        </CardPanel>
      </a-col>

      <!-- 我的伺服器 -->
      <a-col :span="24" v-if="activeInstances.length > 0">
        <CardPanel>
          <template #title>我的伺服器</template>
          <template #body>
            <a-list :data-source="activeInstances" item-layout="horizontal">
              <template #renderItem="{ item }">
                <a-list-item>
                  <a-list-item-meta>
                    <template #title>
                      <span>{{ item.mcsm_uuid?.slice(0, 8) || item.id.slice(0, 8) }}</span>
                      <a-tag :color="item.billing_type === 'monthly' ? 'blue' : 'green'" style="margin-left: 8px">
                        {{ item.billing_type === "monthly" ? "月租" : "日租" }}
                      </a-tag>
                      <a-tag :color="item.status === 'active' ? 'success' : 'warning'">
                        {{ item.status }}
                      </a-tag>
                    </template>
                    <template #description>
                      <span :style="isExpired(item.expire_at) ? 'color: red' : ''">
                        到期：{{ formatExpire(item.expire_at) }}
                        <span v-if="isExpired(item.expire_at)">（已到期）</span>
                      </span>
                    </template>
                  </a-list-item-meta>
                </a-list-item>
              </template>
            </a-list>
          </template>
        </CardPanel>
      </a-col>
    </a-row>

    <!-- 日租方案 Modal -->
    <a-modal
      v-model:open="isRentModalOpen"
      title="選擇日租方案"
      :footer="null"
      width="600px"
      centered
    >
      <a-spin :spinning="rentLoading">
        <div class="plan-list">
          <a-empty v-if="plans.length === 0" description="暫無可用方案" />
          <a-card
            v-for="plan in plans"
            :key="plan.id"
            class="plan-card"
            hoverable
          >
            <div class="plan-header">
              <h3>{{ plan.name }}</h3>
              <div class="plan-price">{{ plan.display_daily_price }} 金幣 / 天</div>
            </div>
            <p class="plan-desc">RAM {{ plan.ram_mb / 1024 }}GB・儲存空間 {{ plan.storage_gb }}GB</p>
            <div class="plan-action">
              <a-button type="primary" block @click="handleSelectPlan(plan)" :loading="rentLoading">
                選擇此方案
              </a-button>
            </div>
          </a-card>
        </div>
      </a-spin>
    </a-modal>
  </div>
</template>

<style lang="scss" scoped>
.services-container {
  max-width: 1200px;
  margin: 0 auto;
  animation: scaleAnimation 0.6s ease-in-out;
}

@keyframes scaleAnimation {
  0% { opacity: 0.02; transform: scale(0.98); }
  100% { opacity: 1; transform: scale(1); }
}

.info-card { height: 100%; }

.user-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 0;

  .info-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: center;
  }

  .user-details {
    h3 { margin: 0; font-size: 20px; font-weight: 600; color: var(--color-gray-14); }
    .text-secondary { margin: 4px 0 0; font-size: 13px; color: var(--color-gray-8); word-break: break-all; }
  }

  .divider { width: 60%; height: 1px; background-color: var(--color-gray-4); margin: 24px 0; }

  .balance-sec {
    text-align: center;
    .balance-label { font-size: 14px; color: var(--color-gray-8); margin-bottom: 8px; }
    .balance-value {
      font-size: 32px;
      font-weight: bold;
      color: #fadb14;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
  }
}

.service-actions {
  .action-card { transition: all 0.3s ease; border-radius: 8px;
    &:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }
  }
  .mt-4 { margin-top: 16px; }
  .action-content { display: flex; align-items: center; gap: 20px; }
  .icon-wrapper {
    width: 56px; height: 56px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center; font-size: 28px;
    &.recharge-icon { background-color: rgba(250, 219, 20, 0.1); color: #d4b106; }
    &.rent-icon { background-color: rgba(24, 144, 255, 0.1); color: #1890ff; }
  }
  .action-text {
    flex: 1;
    h4 { margin: 0 0 4px; font-size: 18px; font-weight: 600; color: var(--color-gray-14); }
    p { margin: 0; font-size: 14px; color: var(--color-gray-8); }
  }
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px;

  .plan-card {
    border-radius: 8px;
    .plan-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      h3 { margin: 0; font-size: 18px; font-weight: 600; }
      .plan-price { font-size: 20px; font-weight: bold; color: #fadb14; }
    }
    .plan-desc { color: var(--color-gray-8); margin-bottom: 16px; }
  }
}
</style>
