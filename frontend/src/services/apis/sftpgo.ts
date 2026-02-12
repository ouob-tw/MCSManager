import { useDefineApi } from "@/stores/useDefineApi";

// The base URL for the MCSMSftpgo Python Service
// We assume it runs on port 8002 relative to the current hostname
const SFTPGO_SERVICE_PORT = 8002;
const getServiceUrl = () => {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:${SFTPGO_SERVICE_PORT}`;
};

// Define the response types
export interface SftpgoUserResponse {
    status: string;
    username: string;
    port: number;
    home_dir?: string;
    ip?: string;
}

export interface SftpgoErrorResponse {
    detail: string;
}

// Wrapper for Axios to point to our custom service instead of the default backend
// Since useDefineApi might be bound to the default instance, we might need a custom implementation
// or just use axios directly if useDefineApi is strict.
// But let's check useDefineApi implementation if possible. 
// For now, I will use a simple fetch or axios wrapper if useDefineApi doesn't support custom baseURL.
// Actually, I can allow the user to configure the URL in the widget, but auto-discovery is better.

import axios from "axios";

const request = axios.create();

export const createSftpgoUser = async (params: { username: string; password: string; instance_id: string }) => {
    const url = `${getServiceUrl()}/user`;
    const res = await request.post(url, params);
    return res.data;
};

export const resetSftpgoPassword = async (params: { username: string; new_password: string }) => {
    const url = `${getServiceUrl()}/user/reset`;
    const res = await request.post(url, params);
    return res.data;
};

export const getSftpgoUser = async (username: string) => {
    const url = `${getServiceUrl()}/user/${username}`;
    const res = await request.get(url);
    return res.data;
};
