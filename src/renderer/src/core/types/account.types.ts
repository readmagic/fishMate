/**
 * 账号相关类型定义
 */

export interface AccountStatus {
    accountId: string;
    connected: boolean;
    lastHeartbeat?: string;
    lastTokenRefresh?: string;
    errorMessage?: string;
}

export interface Account {
    id: string;
    cookies: string;
    userId?: string;
    nickname?: string;
    avatar?: string;
    enabled: boolean;
    remark?: string;
    createdAt?: string;
    updatedAt?: string;
    status?: AccountStatus;
}

export interface ClientStatus {
    accountId: string;
    connected: boolean;
    userId: string;
}

export interface StatusResponse {
    clients: ClientStatus[];
    activeCount: number;
    messageCount: number;
}
