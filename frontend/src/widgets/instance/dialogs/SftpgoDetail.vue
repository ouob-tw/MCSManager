<script setup lang="ts">
import { t } from "@/lang/i18n";
import { createSftpgoUser, getSftpgoUser, resetSftpgoPassword } from "@/services/apis/sftpgo";
import type { InstanceDetail } from "@/types";
import { message } from "ant-design-vue";
import { computed, ref } from "vue";
import { useScreen } from "@/hooks/useScreen";
import { CopyOutlined } from "@ant-design/icons-vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

const { isPhone } = useScreen();
const open = ref(false);
const loading = ref(false);
const enableLoading = ref(false);
const sftpInfo = ref<any>(null);
const isEnabled = ref(false);
const form = ref({ username: "", password: "" }); // Username generated automatically usually
const passwordForm = ref({ password: "" });

const host = computed(() => window.location.hostname);
// Hardcoded based on our setup, or could be fetched/configured
const sftpPort = 2022; 

const loadSftpInfo = async () => {
  if (!props.instanceId) return;
  loading.value = true;
  
  const shortUuid = props.instanceId.slice(0, 8);
  const targetUsername = `mcsm_${shortUuid}`;

  try {
    // Attempt to get user. If 404, valid but not enabled.
    const res = await getSftpgoUser(targetUsername);
    if (res && res.username) {
      sftpInfo.value = res;
      isEnabled.value = true;
      form.value.username = res.username;
    } else {
      isEnabled.value = false;
      // Pre-fill a username suggestion
      form.value.username = targetUsername;
    }
  } catch (error) {
    console.warn("Failed to load sftp info, likely not created yet:", error);
    isEnabled.value = false;
    form.value.username = targetUsername;
  } finally {
    loading.value = false;
  }
};

const handleEnable = async () => {
  try {
    if (!form.value.password) {
      return message.error("Please set a password");
    }
    enableLoading.value = true;
    await createSftpgoUser({
      username: form.value.username,
      password: form.value.password,
      instance_id: props.instanceId!
    });
    message.success("SFTP Enabled Successfully!");
    await loadSftpInfo();
  } catch (error: any) {
    message.error(error.message || "Failed to enable SFTP");
  } finally {
    enableLoading.value = false;
  }
};

const handleReset = async () => {
  try {
    if (!passwordForm.value.password) {
      return message.error("Please enter a new password");
    }
    const username = sftpInfo.value?.username || form.value.username;
    if (!username) {
      return message.error("Result username not found");
    }
    await resetSftpgoPassword({
      username: username,
      new_password: passwordForm.value.password
    });
    message.success("Password Reset Successfully!");
    passwordForm.value.password = "";
  } catch (error: any) {
    message.error(error.message || "Failed to reset password");
  }
};

const copyToClipboard = (text: string) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => message.success(t("TXT_CODE_b2df362")))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
};

const fallbackCopy = (text: string) => {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  
  // Avoid scrolling to bottom
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    if (successful) {
      message.success(t("TXT_CODE_b2df362")); // "Copied"
    } else {
      message.error(t("TXT_CODE_error"));
    }
  } catch (err) {
    message.error(t("TXT_CODE_error"));
  }

  document.body.removeChild(textArea);
};

const openDialog = () => {
  open.value = true;
  loadSftpInfo();
};

defineExpose({
  openDialog
});
</script>

<template>
  <a-modal
    v-model:open="open"
    title="SFTP Settings"
    :width="isPhone ? '100%' : '600px'"
    :footer="null"
    centered
    :maskClosable="false"
  >
    <div v-if="loading" class="flex justify-center items-center p-4">
      <a-spin />
    </div>

    <div v-else class="p-4">
      <div v-if="isEnabled && sftpInfo">
        <a-alert
          message="SFTP is Active"
          description="You can use these credentials to connect via FileZilla or WinSCP."
          type="success"
          show-icon
          class="mb-4"
        />

        <a-descriptions bordered :column="1" size="small">
          <a-descriptions-item label="Host">
            <a-typography-text copyable>{{ host }}</a-typography-text>
          </a-descriptions-item>
          <a-descriptions-item label="Port">
            <a-typography-text copyable>{{ sftpPort }}</a-typography-text>
          </a-descriptions-item>
          <a-descriptions-item label="Username">
            <a-typography-text copyable>{{ sftpInfo.username }}</a-typography-text>
          </a-descriptions-item>
          <a-descriptions-item label="Home Directory">
            <a-typography-text code>{{ sftpInfo.home_dir }}</a-typography-text>
          </a-descriptions-item>
        </a-descriptions>

        <a-divider>Reset Password</a-divider>

        <a-form layout="vertical">
          <a-form-item label="New Password">
            <a-input-password v-model:value="passwordForm.password" placeholder="Enter new password" />
          </a-form-item>
          <a-button type="primary" danger block @click="handleReset">Reset Password</a-button>
        </a-form>
      </div>

      <div v-else>
        <a-alert
          message="SFTP Not Enabled"
          description="Enable SFTP to manage files remotely."
          type="info"
          show-icon
          class="mb-4"
        />
        <a-form layout="vertical">
          <a-form-item label="Username (Auto-generated)">
            <a-input v-model:value="form.username" readonly>
              <template #suffix>
                <CopyOutlined class="cursor-pointer" @click.stop="copyToClipboard(form.username)" />
              </template>
            </a-input>
          </a-form-item>
          <a-form-item label="Set Password">
            <a-input-password v-model:value="form.password" placeholder="Enter initial password" />
          </a-form-item>
          <a-button type="primary" block @click="handleEnable" :loading="enableLoading">
            {{ enableLoading ? 'Enabling SFTP (This may take a while if downloading Docker image)...' : 'Enable SFTP' }}
          </a-button>
        </a-form>
      </div>
    </div>
  </a-modal>
</template>
