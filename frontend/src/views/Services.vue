<script setup lang="ts">
import { useAppStateStore } from "@/stores/useAppStateStore";
import { UserOutlined, WalletOutlined, ShoppingCartOutlined, ScheduleOutlined, ReloadOutlined } from "@ant-design/icons-vue";
import { computed, ref, onMounted } from "vue";
import CardPanel from "@/components/CardPanel.vue";
import {
  deleteArchive,
  getAssets,
  getPlans,
  newDailyInstance,
  newMonthlyInstance,
  renameArchive,
  restoreArchive,
  type PanelArchive,
  type PanelPlan,
  type PanelInstance
} from "@/services/apis/panel";
import { message, Modal } from "ant-design-vue";

const { state } = useAppStateStore();
const userInfo = computed(() => state.userInfo);

const userBalance = ref(0);
const instances = ref<PanelInstance[]>([]);
const archives = ref<PanelArchive[]>([]);
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
    archives.value = data.archives;
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

const showBillingModal = (title: string, content: string) => {
  Modal.warning({ title, content });
};

const handleSelectPlan = async (plan: PlanWithDailyPrice, billingType: "daily" | "monthly") => {
  const username = userInfo.value?.userName;
  if (!username) return message.error("請先登入");
  rentLoading.value = true;
  try {
    const result =
      billingType === "monthly"
        ? await newMonthlyInstance({ mcsm_username: username, plan_id: plan.id, days: 30 })
        : await newDailyInstance({ mcsm_username: username, plan_id: plan.id, hours: 24 });
    message.success(`伺服器開通成功！帳號：${result.username}`);
    isRentModalOpen.value = false;
    await loadAssets();
  } catch (err: any) {
    const detail = err?.response?.data?.detail;
    if (detail === "insufficient_balance") {
      showBillingModal("金幣不足", "目前金幣不足，無法完成此次租用。請先前往商城儲值。");
    } else if (detail === "no_account_please_topup") {
      showBillingModal("帳號尚未建立", "請先至商城購買儲值卡或完成首次儲值，以開通帳號。");
    } else {
      message.error(detail || "開通失敗，請稍後再試");
    }
  } finally {
    rentLoading.value = false;
  }
};

const archivedInstanceIds = computed(() =>
  new Set(
    archives.value
      .filter((archive) => archive.instance_id && archive.status === "archived")
      .map((archive) => archive.instance_id)
  )
);

const archivedArchives = computed(() =>
  archives.value.filter((archive) => archive.status === "archived")
);

const archivesByInstanceId = computed(() => {
  const map = new Map<string, PanelArchive[]>();
  for (const archive of archivedArchives.value) {
    const list = map.get(archive.instance_id) || [];
    list.push(archive);
    map.set(archive.instance_id, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }
  return map;
});

const managedInstances = computed(() =>
  instances.value
    .filter((i) => i.billing_type === "daily" || i.billing_type === "monthly")
    .filter((i) => archivedInstanceIds.value.has(i.id))
    .sort((a, b) => {
      const aExpired = isExpired(a.expire_at);
      const bExpired = isExpired(b.expire_at);
      if (aExpired !== bExpired) return aExpired ? -1 : 1;
      return String(b.expire_at || "").localeCompare(String(a.expire_at || ""));
    })
);

const totalArchiveBytes = computed(() =>
  archivedArchives.value.reduce((sum, archive) => sum + Number(archive.size_bytes || 0), 0)
);

const totalArchiveGiB = computed(() => totalArchiveBytes.value / 1024 / 1024 / 1024);
const freeArchiveGiB = 1;
const excessArchiveGiB = computed(() => Math.max(0, totalArchiveGiB.value - freeArchiveGiB));
const backupDailyCharge = computed(() => (excessArchiveGiB.value > 0 ? Math.ceil(excessArchiveGiB.value / 5) : 0));

const formatExpire = (expire_at: string | null) => {
  if (!expire_at) return "—";
  const d = new Date(expire_at);
  return d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
};

const formatArchiveSize = (sizeBytes: number | null | undefined) => {
  const bytes = Number(sizeBytes || 0);
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
};

const isExpired = (expire_at: string | null) => {
  if (!expire_at) return false;
  return new Date(expire_at) < new Date();
};

const archiveLabel = (archive: PanelArchive) => {
  if (archive.version_name) return archive.version_name;
  if (archive.created_at) {
    return `backup ${formatExpire(archive.created_at)}`;
  }
  return archive.id;
};

const handleRestoreArchive = async (
  instance: PanelInstance,
  archive: PanelArchive,
  mode: "overwrite_current" | "new_daily" | "new_monthly"
) => {
  const modeLabel =
    mode === "overwrite_current" ? "覆蓋目前實例" : mode === "new_daily" ? "還原成新日租" : "還原成新月租";
  const modeHint =
    mode === "overwrite_current"
      ? "目前檔案會被覆蓋。"
      : mode === "new_daily"
        ? "會依目前方案建立一台新的日租實例，並把備份內容還原進去。"
        : "會依目前方案建立一台新的月租實例，並把備份內容還原進去。";
  Modal.confirm({
    title: modeLabel,
    content: `將套用「${archiveLabel(archive)}」。${modeHint}`,
    onOk: async () => {
      try {
        const result = await restoreArchive(instance.id, archive.id, mode);
        if (mode === "overwrite_current") {
          message.success("還原完成");
        } else {
          message.success(`新實例建立完成：${result.mcsm_uuid?.slice(0, 8) || result.instance_id.slice(0, 8)}`);
        }
        await loadAssets();
      } catch (err: any) {
        const detail = err?.response?.data?.detail;
        if (detail === "insufficient_balance") {
          showBillingModal(
            "金幣不足",
            mode === "new_daily"
              ? "目前金幣不足，無法建立新的日租還原實例。請先前往商城儲值。"
              : mode === "new_monthly"
                ? "目前金幣不足，無法建立新的月租還原實例。請先前往商城儲值。"
                : "目前金幣不足，無法完成此次操作。請先前往商城儲值。"
          );
          return;
        }
        message.error(detail || "還原失敗");
      }
    }
  });
};

const handleRenameArchive = async (instance: PanelInstance, archive: PanelArchive) => {
  const nextName = window.prompt("請輸入備份版本名稱", archive.version_name || archiveLabel(archive));
  if (nextName === null) return;
  const trimmed = nextName.trim();
  if (!trimmed) {
    message.error("名稱不可為空");
    return;
  }
  try {
    await renameArchive(instance.id, archive.id, trimmed);
    message.success("版本名稱已更新");
    await loadAssets();
  } catch (err: any) {
    message.error(err?.response?.data?.detail || "重新命名失敗");
  }
};

const handleDeleteArchive = async (instance: PanelInstance, archive: PanelArchive) => {
  Modal.confirm({
    title: "刪除此備份版本",
    content: `將刪除「${archiveLabel(archive)}」，此操作無法復原。`,
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await deleteArchive(instance.id, archive.id);
        message.success("備份版本已刪除");
        await loadAssets();
      } catch (err: any) {
        message.error(err?.response?.data?.detail || "刪除失敗");
      }
    }
  });
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
                    <h4>租用與續費服務</h4>
                    <p>可開通日租、月租，也可對既有伺服器續費</p>
                  </div>
                </div>
              </a-card>
            </div>
          </template>
        </CardPanel>
      </a-col>

      <!-- 還原中心 -->
      <a-col :span="24">
        <CardPanel>
          <template #title>備份版本還原</template>
          <template #body>
            <div class="archive-summary">
              <div class="archive-summary-main">
                目前備份總容量：{{ formatArchiveSize(totalArchiveBytes) }}
              </div>
              <div class="archive-summary-sub">
                前 1 GB 免費，超過後每 5 GB 每天 1 金幣。
                目前超額 {{ excessArchiveGiB.toFixed(2) }} GB，預估每日 {{ backupDailyCharge }} 金幣。
              </div>
            </div>
            <a-empty v-if="managedInstances.length === 0" description="目前沒有可管理的備份版本" />
            <a-list v-else :data-source="managedInstances" item-layout="horizontal">
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
                      <div :style="isExpired(item.expire_at) ? 'color: red' : ''">
                        到期：{{ formatExpire(item.expire_at) }}
                        <span v-if="isExpired(item.expire_at)">（已到期）</span>
                      </div>
                      <div class="archive-inline-list">
                        <a-list
                          :data-source="archivesByInstanceId.get(item.id) || []"
                          size="small"
                          item-layout="horizontal"
                        >
                          <template #renderItem="{ item: archive }">
                            <a-list-item>
                              <a-list-item-meta>
                                <template #title>{{ archiveLabel(archive) }}</template>
                                <template #description>
                                  建立時間：{{ formatExpire(archive.created_at || null) }} ｜ 大小：{{ formatArchiveSize(archive.size_bytes) }}
                                  <span v-if="archive.restored_at"> ｜ 最後還原：{{ formatExpire(archive.restored_at) }}</span>
                                </template>
                              </a-list-item-meta>
                              <div class="archive-actions">
                                <a-button size="small" @click="handleRenameArchive(item, archive)">
                                  重新命名
                                </a-button>
                                <a-button size="small" danger @click="handleDeleteArchive(item, archive)">
                                  刪除
                                </a-button>
                                <a-button size="small" type="primary" ghost @click="handleRestoreArchive(item, archive, 'overwrite_current')">
                                  覆蓋當前
                                </a-button>
                                <a-button size="small" type="primary" ghost @click="handleRestoreArchive(item, archive, 'new_daily')">
                                  還原成日租
                                </a-button>
                                <a-button size="small" type="primary" ghost @click="handleRestoreArchive(item, archive, 'new_monthly')">
                                  還原成月租
                                </a-button>
                              </div>
                            </a-list-item>
                          </template>
                        </a-list>
                      </div>
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
            <p class="plan-desc">
              RAM {{ plan.ram_mb / 1024 }}GB・儲存空間 {{ plan.storage_gb }}GB・月租 {{ plan.monthly_price }} 金幣
            </p>
            <div class="plan-action">
              <a-button block @click="handleSelectPlan(plan, 'monthly')" :loading="rentLoading">
                月租開通
              </a-button>
              <a-button type="primary" block @click="handleSelectPlan(plan, 'daily')" :loading="rentLoading">
                日租開通
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

.instance-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.archive-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.archive-summary {
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 10px;
  background: linear-gradient(135deg, #fff4cc, #e8f3ff);
  border: 1px solid #c8d7eb;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.archive-summary-main {
  font-size: 16px;
  font-weight: 700;
  color: #1f2a37;
}

.archive-summary-sub {
  margin-top: 6px;
  font-size: 13px;
  color: #44556c;
}

.archive-inline-list {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #b8c7d9;
}

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
    .plan-action {
      display: flex;
      gap: 8px;
    }
  }
}

.archive-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
</style>
