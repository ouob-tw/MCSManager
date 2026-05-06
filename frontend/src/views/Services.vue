<script setup lang="ts">
import { useAppStateStore } from "@/stores/useAppStateStore";
import {
  AppstoreOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  HddOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  ShoppingCartOutlined,
  UserOutlined,
  WalletOutlined,
} from "@ant-design/icons-vue";
import { computed, ref, onMounted } from "vue";
import CardPanel from "@/components/CardPanel.vue";
import {
  deleteArchive,
  getAssets,
  getPlans,
  newDailyInstance,
  newMonthlyInstance,
  renameArchive,
  renewDaily,
  renewMonthly,
  restoreArchive,
  type PanelArchive,
  type PanelPlan,
  type PanelInstance
} from "@/services/apis/panel";
import { InputNumber, message, Modal } from "ant-design-vue";
import { h } from "vue";

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

const gameTypeOrder = [
  "minecraft",
  "palworld",
  "rust",
  "ark-survival-evolved",
  "ark-survival-ascended",
  "enshrouded",
] as const;

const formatGameType = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  const mapping: Record<string, string> = {
    minecraft: "Minecraft",
    palworld: "Palworld",
    rust: "Rust",
    "ark-survival-evolved": "ARK: Survival Evolved",
    "ark-survival-ascended": "ARK: Survival Ascended",
    enshrouded: "Enshrouded",
  };
  return mapping[normalized] || normalized || "未分類";
};

const plansByGameType = computed(() => {
  const groups = new Map<string, PlanWithDailyPrice[]>();
  for (const plan of plans.value) {
    const gameType = String(plan.game_type || plan.category || "minecraft").trim().toLowerCase();
    const list = groups.get(gameType) || [];
    list.push(plan);
    groups.set(gameType, list);
  }
  return [...groups.entries()]
    .sort((a, b) => {
      const ai = gameTypeOrder.indexOf(a[0] as typeof gameTypeOrder[number]);
      const bi = gameTypeOrder.indexOf(b[0] as typeof gameTypeOrder[number]);
      const aRank = ai === -1 ? 999 : ai;
      const bRank = bi === -1 ? 999 : bi;
      if (aRank !== bRank) return aRank - bRank;
      return a[0].localeCompare(b[0]);
    })
    .map(([gameType, items]) => ({
      gameType,
      label: formatGameType(gameType),
      items: items.sort((a, b) => a.monthly_price - b.monthly_price)
    }));
});

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
const renewableInstances = computed(() =>
  instances.value
    .filter((i) => i.billing_type === "daily" || i.billing_type === "monthly")
    .sort((a, b) => {
      const aExpired = isExpired(a.expire_at);
      const bExpired = isExpired(b.expire_at);
      if (aExpired !== bExpired) return aExpired ? -1 : 1;
      return String(a.expire_at || "").localeCompare(String(b.expire_at || ""));
    })
);

const activeInstanceCount = computed(() => renewableInstances.value.filter((item) => item.status === "active").length);
const expiredInstanceCount = computed(() => renewableInstances.value.filter((item) => isExpired(item.expire_at)).length);
const archivedVersionCount = computed(() => archivedArchives.value.length);

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

const resolveDailyPrice = (planId: string) => {
  const plan = plans.value.find((item) => item.id === planId);
  return plan?.display_daily_price ?? 0;
};

const resolveMonthlyPrice = (planId: string) => {
  const plan = plans.value.find((item) => item.id === planId);
  return plan?.monthly_price ?? 0;
};

const handleRenewInstance = async (instance: PanelInstance) => {
  const isMonthly = instance.billing_type === "monthly";
  const quantity = ref(1);
  const unitPrice = isMonthly ? resolveMonthlyPrice(instance.plan_id) : resolveDailyPrice(instance.plan_id);

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
          await renewMonthly(instance.id, safeQuantity);
        } else {
          await renewDaily(instance.id, safeQuantity * 24);
        }
        message.success("續費成功");
        await loadAssets();
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
</script>

<template>
  <div class="services-container">
    <div class="services-hero">
      <div>
        <div class="hero-kicker">Services & Billing</div>
        <h2>加值服務中心</h2>
        <p>集中管理金幣、租用續費、備份容量與版本還原。</p>
      </div>
      <div class="hero-actions">
        <a-button @click="loadAssets" :loading="assetsLoading">
          <ReloadOutlined /> 更新資產
        </a-button>
        <a-button type="primary" @click="handleRentClick">
          <ScheduleOutlined /> 租用方案
        </a-button>
      </div>
    </div>

    <div class="status-grid">
      <div class="status-card balance">
        <div class="status-icon"><WalletOutlined /></div>
        <div>
          <span>目前金幣</span>
          <strong>
            <a-spin v-if="assetsLoading" size="small" />
            <template v-else>{{ userBalance }}</template>
          </strong>
        </div>
      </div>
      <div class="status-card">
        <div class="status-icon"><AppstoreOutlined /></div>
        <div>
          <span>啟用中實例</span>
          <strong>{{ activeInstanceCount }}</strong>
        </div>
      </div>
      <div class="status-card">
        <div class="status-icon"><ClockCircleOutlined /></div>
        <div>
          <span>已到期實例</span>
          <strong>{{ expiredInstanceCount }}</strong>
        </div>
      </div>
      <div class="status-card">
        <div class="status-icon"><DatabaseOutlined /></div>
        <div>
          <span>備份版本</span>
          <strong>{{ archivedVersionCount }}</strong>
        </div>
      </div>
    </div>

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
              <a-card hoverable class="action-card recharge-card" @click="openShop">
                <div class="action-content">
                  <div class="icon-wrapper recharge-icon">
                    <ShoppingCartOutlined />
                  </div>
                  <div class="action-text">
                    <h4>快速儲值</h4>
                    <p>前往甲方商城購買金幣，支援多種付款方式</p>
                  </div>
                  <div class="action-arrow">前往</div>
                </div>
              </a-card>

              <a-card hoverable class="action-card rent-card" @click="handleRentClick">
                <div class="action-content">
                  <div class="icon-wrapper rent-icon">
                    <ScheduleOutlined />
                  </div>
                  <div class="action-text">
                    <h4>租用與續費服務</h4>
                    <p>可開通日租、月租，也可對既有伺服器續費</p>
                  </div>
                  <div class="action-arrow">選擇方案</div>
                </div>
              </a-card>

              <a-card class="action-card support-card">
                <div class="action-content">
                  <div class="icon-wrapper safe-icon">
                    <SafetyCertificateOutlined />
                  </div>
                  <div class="action-text">
                    <h4>備份容量規則</h4>
                    <p>前 1 GB 免費，超過後每 5 GB 每天 1 金幣</p>
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
          <template #title>租用中的實例與續費</template>
          <template #body>
            <a-empty v-if="renewableInstances.length === 0" description="目前沒有可續費的日租或月租實例" />
            <div v-else class="instance-grid">
              <div v-for="item in renewableInstances" :key="item.id" class="managed-instance-card">
                <div class="managed-instance-main">
                  <div class="instance-title-row">
                    <div class="instance-name">{{ item.mcsm_uuid?.slice(0, 8) || item.id.slice(0, 8) }}</div>
                    <div class="instance-tags">
                      <a-tag :color="item.billing_type === 'monthly' ? 'blue' : 'green'">
                        {{ item.billing_type === "monthly" ? "月租" : "日租" }}
                      </a-tag>
                      <a-tag :color="item.status === 'active' ? 'success' : 'warning'">
                        {{ item.status }}
                      </a-tag>
                    </div>
                  </div>
                  <div class="instance-meta" :class="{ danger: isExpired(item.expire_at) }">
                    <ClockCircleOutlined />
                    到期：{{ formatExpire(item.expire_at) }}
                    <span v-if="isExpired(item.expire_at)">（已到期）</span>
                  </div>
                </div>
                <a-button type="primary" @click="handleRenewInstance(item)">
                  {{ item.billing_type === "monthly" ? "月租續費" : "日租續費" }}
                </a-button>
              </div>
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
              <div class="archive-summary-icon">
                <CloudUploadOutlined />
              </div>
              <div class="archive-summary-copy">
                <div class="archive-summary-main">
                  目前備份總容量：{{ formatArchiveSize(totalArchiveBytes) }}
                </div>
                <div class="archive-summary-sub">
                  前 1 GB 免費，超過後每 5 GB 每天 1 金幣。
                  目前超額 {{ excessArchiveGiB.toFixed(2) }} GB，預估每日 {{ backupDailyCharge }} 金幣。
                </div>
              </div>
              <div class="archive-summary-meter">
                <span>使用量</span>
                <strong>{{ totalArchiveGiB.toFixed(2) }} GB</strong>
              </div>
            </div>
            <a-empty v-if="managedInstances.length === 0" description="目前沒有可管理的備份版本" />
            <div v-else class="backup-instance-stack">
              <div v-for="item in managedInstances" :key="item.id" class="backup-instance-card">
                <div class="backup-instance-header">
                  <div>
                    <div class="instance-name">{{ item.mcsm_uuid?.slice(0, 8) || item.id.slice(0, 8) }}</div>
                    <div class="instance-meta" :class="{ danger: isExpired(item.expire_at) }">
                      <ClockCircleOutlined />
                      到期：{{ formatExpire(item.expire_at) }}
                      <span v-if="isExpired(item.expire_at)">（已到期）</span>
                    </div>
                  </div>
                  <div class="instance-tags">
                    <a-tag :color="item.billing_type === 'monthly' ? 'blue' : 'green'">
                      {{ item.billing_type === "monthly" ? "月租" : "日租" }}
                    </a-tag>
                    <a-tag :color="item.status === 'active' ? 'success' : 'warning'">
                      {{ item.status }}
                    </a-tag>
                  </div>
                </div>
                <div class="archive-card-list">
                  <div
                    v-for="archive in archivesByInstanceId.get(item.id) || []"
                    :key="archive.id"
                    class="archive-version-card"
                  >
                    <div class="archive-version-main">
                      <div class="archive-version-title">
                        <HddOutlined />
                        {{ archiveLabel(archive) }}
                      </div>
                      <div class="archive-version-meta">
                        建立時間：{{ formatExpire(archive.created_at || null) }} ｜ 大小：{{ formatArchiveSize(archive.size_bytes) }}
                        <span v-if="archive.restored_at"> ｜ 最後還原：{{ formatExpire(archive.restored_at) }}</span>
                      </div>
                    </div>
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
                  </div>
                </div>
              </div>
            </div>
          </template>
        </CardPanel>
      </a-col>
    </a-row>

    <!-- 日租方案 Modal -->
    <a-modal
      v-model:open="isRentModalOpen"
      title="選擇遊戲與方案"
      :footer="null"
      width="860px"
      centered
      class="rent-plan-modal"
    >
      <a-spin :spinning="rentLoading">
        <div class="plan-list">
          <a-empty v-if="plans.length === 0" description="暫無可用方案" />
          <template v-else>
            <div v-for="group in plansByGameType" :key="group.gameType" class="plan-group">
              <div class="plan-group-title">
                <span>{{ group.label }}</span>
                <small>{{ group.items.length }} 個方案</small>
              </div>
              <div class="plan-card-grid">
                <a-card
                  v-for="plan in group.items"
                  :key="plan.id"
                  class="plan-card"
                  hoverable
                >
                  <div class="plan-header">
                    <div>
                      <h3>{{ plan.name }}</h3>
                      <div class="plan-game-label">{{ group.label }}</div>
                    </div>
                    <div class="plan-price">{{ plan.display_daily_price }}<span>金幣 / 天</span></div>
                  </div>
                  <div class="plan-specs">
                    <div><strong>{{ plan.ram_mb / 1024 }}GB</strong><span>RAM</span></div>
                    <div><strong>{{ plan.storage_gb }}GB</strong><span>Storage</span></div>
                    <div><strong>{{ plan.monthly_price }}</strong><span>月租金幣</span></div>
                  </div>
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
            </div>
          </template>
        </div>
      </a-spin>
    </a-modal>

  </div>
</template>

<style lang="scss" scoped>
.services-container {
  --services-text-strong: #f4f7fb;
  --services-text-main: #dbe5f2;
  --services-text-muted: #aebcd0;
  --services-surface-soft: rgba(255, 255, 255, 0.045);
  --services-surface-raised: rgba(255, 255, 255, 0.075);
  --services-border-soft: rgba(210, 225, 245, 0.18);

  max-width: 1200px;
  margin: 0 auto;
  animation: scaleAnimation 0.6s ease-in-out;
}

@keyframes scaleAnimation {
  0% { opacity: 0.02; transform: translateY(8px) scale(0.99); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

.services-hero {
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
  margin-bottom: 18px;
  padding: 22px 24px;
  border: 1px solid var(--card-border-color);
  border-radius: 16px;
  overflow: hidden;
  background:
    radial-gradient(circle at 8% 10%, rgba(24, 144, 255, 0.18), transparent 30%),
    linear-gradient(135deg, var(--card-background-color), var(--card-shadow-extend-color));
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);

  &::after {
    content: "";
    position: absolute;
    right: -70px;
    top: -90px;
    width: 220px;
    height: 220px;
    border-radius: 999px;
    background: rgba(250, 219, 20, 0.12);
    pointer-events: none;
  }

  .hero-kicker {
    margin-bottom: 6px;
    color: #1677ff;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    color: var(--services-text-strong);
    font-size: 26px;
    font-weight: 800;
  }

  p {
    margin: 8px 0 0;
    color: var(--services-text-muted);
  }
}

.hero-actions {
  z-index: 1;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 24px;
}

.status-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--services-border-soft);
  border-radius: 14px;
  background: linear-gradient(180deg, var(--services-surface-raised), var(--services-surface-soft));
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.055);

  .status-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    color: #1677ff;
    background: rgba(22, 119, 255, 0.12);
    font-size: 20px;
  }

  span {
    display: block;
    color: var(--services-text-muted);
    font-size: 12px;
  }

  strong {
    display: block;
    margin-top: 2px;
    color: var(--services-text-strong);
    font-size: 23px;
    line-height: 1;
  }

  &.balance .status-icon {
    color: #d48806;
    background: rgba(250, 173, 20, 0.14);
  }
}

.info-card { height: 100%; }

.archive-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.archive-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
  padding: 16px;
  border-radius: 14px;
  background:
    linear-gradient(135deg, rgba(22, 119, 255, 0.12), rgba(250, 173, 20, 0.10)),
    var(--services-surface-soft);
  border: 1px solid var(--services-border-soft);
}

.archive-summary-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 14px;
  color: #1677ff;
  background: rgba(22, 119, 255, 0.13);
  font-size: 24px;
}

.archive-summary-copy {
  min-width: 0;
  flex: 1;
}

.archive-summary-main {
  font-size: 16px;
  font-weight: 800;
  color: var(--services-text-strong);
}

.archive-summary-sub {
  margin-top: 6px;
  font-size: 13px;
  color: var(--services-text-muted);
}

.archive-summary-meter {
  min-width: 120px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--services-border-soft);
  text-align: right;

  span {
    display: block;
    color: var(--services-text-muted);
    font-size: 12px;
  }

  strong {
    color: var(--services-text-strong);
    font-size: 18px;
  }
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
    h3 { margin: 0; font-size: 20px; font-weight: 600; color: var(--services-text-strong); }
    .text-secondary { margin: 4px 0 0; font-size: 13px; color: var(--services-text-muted); word-break: break-all; }
  }

  .divider { width: 60%; height: 1px; background-color: var(--color-gray-4); margin: 24px 0; }

  .balance-sec {
    text-align: center;
    .balance-label { font-size: 14px; color: var(--services-text-muted); margin-bottom: 8px; }
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
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;

  .action-card {
    min-height: 118px;
    border-radius: 14px;
    border: 1px solid var(--services-border-soft);
    transition: all 0.24s ease;
    overflow: hidden;

    :deep(.ant-card-body) {
      height: 100%;
      padding: 18px;
    }

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
    }
  }

  .recharge-card,
  .rent-card {
    cursor: pointer;
  }

  .support-card {
    grid-column: 1 / -1;
    min-height: auto;
    background: linear-gradient(135deg, rgba(82, 196, 26, 0.09), rgba(22, 119, 255, 0.07));
  }

  .action-content {
    height: 100%;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .icon-wrapper {
    width: 54px; height: 54px; border-radius: 15px;
    display: flex; align-items: center; justify-content: center; font-size: 28px;
    &.recharge-icon { background-color: rgba(250, 219, 20, 0.1); color: #d4b106; }
    &.rent-icon { background-color: rgba(24, 144, 255, 0.1); color: #1890ff; }
    &.safe-icon { background-color: rgba(82, 196, 26, 0.12); color: #389e0d; }
  }

  .action-text {
    flex: 1;
    h4 { margin: 0 0 4px; font-size: 18px; font-weight: 600; color: var(--services-text-strong); }
    p { margin: 0; font-size: 14px; color: var(--services-text-muted); }
  }

  .action-arrow {
    align-self: flex-start;
    padding: 4px 9px;
    border-radius: 999px;
    background: rgba(22, 119, 255, 0.10);
    color: #1677ff;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
}

.instance-grid,
.backup-instance-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.managed-instance-card,
.backup-instance-card {
  border: 1px solid var(--services-border-soft);
  border-radius: 14px;
  background: linear-gradient(180deg, var(--services-surface-raised), var(--services-surface-soft));
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.045);
}

.managed-instance-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px;
}

.managed-instance-main {
  min-width: 0;
}

.instance-title-row,
.backup-instance-header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
}

.backup-instance-header {
  padding: 16px;
  border-bottom: 1px solid var(--card-border-color);
}

.instance-name {
  color: var(--services-text-strong);
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.instance-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.instance-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: var(--services-text-muted);
  font-size: 13px;

  &.danger {
    color: #cf1322;
    font-weight: 700;
  }
}

.archive-card-list {
  display: flex;
  flex-direction: column;
}

.archive-version-card {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--card-border-color);

  &:last-child {
    border-bottom: none;
  }
}

.archive-version-main {
  min-width: 0;
}

.archive-version-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--services-text-strong);
  font-weight: 800;
}

.archive-version-meta {
  margin-top: 5px;
  color: var(--services-text-muted);
  font-size: 12px;
  line-height: 1.55;
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px 4px 10px;

  .plan-card {
    border-radius: 14px;
    border: 1px solid var(--card-border-color);
    overflow: hidden;

    :deep(.ant-card-body) {
      padding: 18px;
    }

    .plan-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      h3 {
        margin: 0;
        font-size: 17px;
        font-weight: 800;
        color: var(--services-text-strong);
      }

      .plan-price {
        text-align: right;
        font-size: 24px;
        line-height: 1;
        font-weight: 900;
        color: #d48806;

        span {
          display: block;
          margin-top: 4px;
          color: var(--services-text-muted);
          font-size: 11px;
          font-weight: 600;
        }
      }
    }

    .plan-game-label {
      margin-top: 4px;
      font-size: 12px;
      color: var(--services-text-muted);
    }

    .plan-specs {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 14px 0;

      div {
        padding: 10px;
        border-radius: 10px;
        background: var(--services-surface-soft);
        border: 1px solid var(--services-border-soft);
      }

      strong {
        display: block;
        color: var(--services-text-strong);
        font-size: 16px;
      }

      span {
        color: var(--services-text-muted);
        font-size: 11px;
      }
    }

    .plan-action {
      display: flex;
      gap: 8px;
    }
  }
}

.plan-group {
  margin-bottom: 4px;
}

.plan-group-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 4px 0 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--services-text-main);

  small {
    color: var(--services-text-muted);
    font-size: 12px;
    font-weight: 500;
  }
}

.plan-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.archive-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

@media (max-width: 900px) {
  .services-hero,
  .managed-instance-card,
  .archive-version-card {
    align-items: stretch;
    flex-direction: column;
  }

  .hero-actions {
    justify-content: flex-start;
  }

  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .service-actions,
  .plan-card-grid {
    grid-template-columns: 1fr;
  }

  .archive-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 560px) {
  .status-grid {
    grid-template-columns: 1fr;
  }

  .archive-summary,
  .backup-instance-header,
  .instance-title-row {
    align-items: stretch;
    flex-direction: column;
  }

  .archive-summary-meter {
    text-align: left;
  }
}
</style>
