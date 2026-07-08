import type { ClientManager } from '../shared/websocket/client.manager.js'
import { registerAccountIPC } from './accounts.js'
import { registerGoodsIPC } from './goods.js'
import { registerMessageIPC } from './messages.js'
import { registerConversationIPC } from './conversations.js'
import { registerOrderIPC } from './orders.js'
import { registerAutoReplyIPC } from './autoreply.js'
import { registerAutoSellIPC } from './autosell.js'
import { registerWorkflowIPC } from './workflows.js'
import { registerLogIPC } from './logs.js'
import { registerStatusIPC } from './status.js'
import { registerPushIPC } from './push.js'
import { registerSettingsIPC } from './settings.js'
import { ENV } from '../shared/core/constants.js'
import { registerDevMessageIPC } from './dev-messages.js'

export function registerAllIPC(cm: ClientManager) {
    registerAccountIPC(cm)
    registerGoodsIPC(cm)
    registerMessageIPC(cm)
    registerConversationIPC()
    registerOrderIPC(cm)
    registerAutoReplyIPC()
    registerAutoSellIPC()
    registerWorkflowIPC()
    registerLogIPC()
    registerStatusIPC(cm)
    registerPushIPC(cm)
    registerSettingsIPC()
    if (ENV.IS_DEV) {
        registerDevMessageIPC()
    }
}
