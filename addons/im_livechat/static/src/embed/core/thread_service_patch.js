/* @odoo-module */

import { SESSION_STATE } from "@im_livechat/embed/core/livechat_service";

import { ThreadService, threadService } from "@mail/core/common/thread_service";
import { createLocalId, onChange } from "@mail/utils/common/misc";

import { markup } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";
import { session } from "@web/session";

threadService.dependencies.push(
    "im_livechat.livechat",
    "im_livechat.chatbot",
    "mail.chat_window",
    "notification"
);

patch(ThreadService.prototype, {
    TEMPORARY_ID: "livechat_temporary_thread",

    /**
     * @param {import("@web/env").OdooEnv} env
     * @param {{
     * "im_livechat.chatbot": import("@im_livechat/embed/chatbot/chatbot_service").ChatBotService,
     * "im_livechat.livechat": import("@im_livechat/embed/core/livechat_service").LivechatService,
     * "mail.chat_window": import("@mail/core/common/chat_window_service").ChatWindowService,
     * notification: typeof import("@web/core/notifications/notification_service").notificationService.start,
     * }} services
     */
    setup(env, services) {
        super.setup(env, services);
        this.livechatService = services["im_livechat.livechat"];
        this.chatWindowService = services["mail.chat_window"];
        this.chatbotService = services["im_livechat.chatbot"];
        this.notification = services.notification;
        /** @type {Promise<import("@mail/core/common/thread_model").Thread>?} */
        this.persistPromise = null;
    },

    /**
     * Persist the given thread  and swap it with the temporary thread.
     *
     * @param {import("@mail/core/common/thread_model").Thread} thread
     * @returns {import("@mail/core/common/thread_model").Thread} The
     * persisted thread.
     */
    async persistThread(thread) {
        if (thread.id !== this.TEMPORARY_ID) {
            return thread;
        }
        if (this.persistPromise) {
            return this.persistPromise;
        }
        this.persistPromise = this.getLivechatThread({ persisted: true });
        let persistedThread;
        try {
            persistedThread = await this.persistPromise;
        } finally {
            this.persistPromise = null;
        }
        const chatWindow = this.store.chatWindows.find((c) => c.threadLocalId === thread.localId);
        if (!persistedThread) {
            this.chatWindowService.close(chatWindow);
            this.remove(thread);
            return;
        }
        chatWindow.thread = persistedThread;
        this.remove(thread);
        if (this.chatbotService.active) {
            await this.chatbotService.postWelcomeSteps();
        }
        return persistedThread;
    },

    /**
     * @returns {Promise<import("@mail/core/common/message_model").Message}
     */
    async post(thread, body, params) {
        thread = await this.persistThread(thread);
        if (!thread) {
            return;
        }
        const message = await super.post(thread, body, params);
        this.chatbotService.bus.trigger("MESSAGE_POST", message);
        return message;
    },

    async openChat() {
        if (this.chatbotService.shouldRestore) {
            this.chatbotService.restore();
        }
        const thread = await this.getLivechatThread();
        if (!thread) {
            return;
        }
        const chatWindow = this.chatWindowService.insert({
            thread,
            folded: thread.state === "folded",
        });
        chatWindow.autofocus++;
        if (this.chatbotService.active) {
            this.chatbotService.start();
        }
    },

    insert(data) {
        const isUnknown = !(createLocalId(data.model, data.id) in this.store.threads);
        const thread = super.insert(...arguments);
        if (thread.type === "livechat" && isUnknown) {
            if (
                this.livechatService.displayWelcomeMessage &&
                !this.chatbotService.isChatbotThread(thread)
            ) {
                this.livechatService.welcomeMessage = this.messageService.insert({
                    id: this.messageService.getNextTemporaryId(),
                    body: this.livechatService.options.default_message,
                    res_id: thread.id,
                    model: thread.model,
                    author: thread.operator,
                });
            }
            if (this.chatbotService.isChatbotThread(thread)) {
                this.chatbotService.typingMessage = this.messageService.insert({
                    id: this.messageService.getNextTemporaryId(),
                    res_id: thread.id,
                    model: thread.model,
                    author: thread.operator,
                });
            }
            onChange(thread, "state", () => {
                if (
                    ![SESSION_STATE.CLOSED, SESSION_STATE.NONE].includes(this.livechatService.state)
                ) {
                    this.livechatService.updateSession({ state: thread.state });
                }
            });
            onChange(thread, "seen_message_id", () => {
                if (
                    ![SESSION_STATE.CLOSED, SESSION_STATE.NONE].includes(this.livechatService.state)
                ) {
                    this.livechatService.updateSession({ seen_message_id: thread.seen_message_id });
                }
            });
            onChange(thread, "message_unread_counter", () => {
                if (
                    ![SESSION_STATE.CLOSED, SESSION_STATE.NONE].includes(this.livechatService.state)
                ) {
                    this.livechatService.updateSession({ channel: thread.channel });
                }
            });
            this.store.livechatThread = thread;
        }
        return thread;
    },

    async update(thread, data) {
        super.update(...arguments);
        if (data.operator_pid) {
            thread.operator = this.personaService.insert({
                type: "partner",
                id: data.operator_pid[0],
                name: data.operator_pid[1],
            });
        }
    },

    avatarUrl(author, thread) {
        if (thread.type !== "livechat") {
            return super.avatarUrl(...arguments);
        }
        const isFromOperator =
            author && author.id !== this.livechatService.options.current_partner_id;
        if (isFromOperator) {
            return `${session.origin}/im_livechat/operator/${
                author?.id ?? thread.operator.id
            }/avatar`;
        } else if (author) {
            return `${session.origin}/web/image/res.partner/${author.id}/avatar_128`;
        } else {
            return `${session.origin}/mail/static/src/img/smiley/avatar.jpg`;
        }
    },

    /**
     * @param {Object} param0
     * @param {boolean} param0.persisted
     * @returns {Promise<import("@mail/core/common/thread_model").Thread?>}
     */
    async getLivechatThread({ persisted = false } = {}) {
        const session = await this.livechatService.getSession({ persisted });
        if (!session?.operator_pid) {
            this.notification.add(_t("No available collaborator, please try again later."));
            return;
        }
        const thread = this.insert({
            ...session,
            id: session.id ?? this.TEMPORARY_ID,
            model: "discuss.channel",
            type: "livechat",
        });
        if (session.messages) {
            thread.messages = session.messages.map((message) => {
                if (message.parentMessage) {
                    message.parentMessage.body = markup(message.parentMessage.body);
                }
                message.body = markup(message.body);
                return this.messageService.insert(message);
            });
        }
        return thread;
    },
});
