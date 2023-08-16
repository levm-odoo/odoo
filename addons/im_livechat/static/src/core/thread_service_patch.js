/* @odoo-module */

import { DEFAULT_AVATAR } from "@mail/core/common/persona_service";
import { ThreadService } from "@mail/core/common/thread_service";
import { removeFromArray } from "@mail/utils/common/arrays";
import { assignDefined, createLocalId } from "@mail/utils/common/misc";

import { patch } from "@web/core/utils/patch";

patch(ThreadService.prototype, {
    insert(data) {
        const isUnknown = !(createLocalId(data.model, data.id) in this.store.threads);
        const thread = super.insert(data);
        if (thread.type === "livechat") {
            if (data?.channel) {
                assignDefined(thread, data.channel, ["anonymous_name"]);
            }
            if (data?.operator_pid) {
                thread.operator = this.personaService.insert({
                    type: "partner",
                    id: data.operator_pid[0],
                    displayName: data.operator_pid[1],
                });
            }
            if (isUnknown) {
                this.store.discuss.livechat.threads.push(thread.localId);
                this.sortChannels();
            }
        }
        return thread;
    },
    /**
     * @override
     * @param {import("@mail/core/common/thread_model").Thread} thread
     * @param {boolean} pushState
     */
    setDiscussThread(thread, pushState) {
        super.setDiscussThread(thread, pushState);
        if (this.ui.isSmall && thread.type === "livechat") {
            this.store.discuss.activeTab = "livechat";
        }
    },
    remove(thread) {
        if (thread.type === "livechat") {
            removeFromArray(this.store.discuss.livechat.threads, thread.localId);
        }
        super.remove(thread);
    },

    canLeave(thread) {
        return thread.type !== "livechat" && super.canLeave(thread);
    },

    canUnpin(thread) {
        if (thread.type === "livechat") {
            return thread.message_unread_counter === 0;
        }
        return super.canUnpin(thread);
    },

    getCounter(thread) {
        if (thread.type === "livechat") {
            return thread.message_unread_counter;
        }
        return super.getCounter(thread);
    },

    sortChannels() {
        super.sortChannels();
        // Live chats are sorted by most recent interest date time in the sidebar.
        this.store.discuss.livechat.threads.sort((localId_1, localId_2) => {
            const thread1 = this.store.threads[localId_1];
            const thread2 = this.store.threads[localId_2];
            return thread2.lastInterestDateTime?.ts - thread1.lastInterestDateTime?.ts;
        });
    },

    /**
     * @returns {boolean} Whether the livechat thread changed.
     */
    goToOldestUnreadLivechatThread() {
        const oldestUnreadThread =
            this.store.threads[
                Object.values(this.store.discuss.livechat.threads)
                    .filter((localId) => this.store.threads[localId].isUnread)
                    .sort(
                        (localId_1, localId_2) =>
                            this.store.threads[localId_1].lastInterestDateTime?.ts -
                            this.store.threads[localId_2].lastInterestDateTime?.ts
                    )[0]
            ];
        if (!oldestUnreadThread) {
            return false;
        }
        if (this.store.discuss.isActive) {
            this.setDiscussThread(oldestUnreadThread);
            return true;
        }
        const chatWindow = this.chatWindowService.insert({ thread: oldestUnreadThread });
        if (chatWindow.hidden) {
            this.chatWindowService.makeVisible(chatWindow);
        } else if (chatWindow.folded) {
            this.chatWindowService.toggleFold(chatWindow);
        }
        this.chatWindowService.focus(chatWindow);
        return true;
    },

    /**
     * @param {import("@mail/core/common/persona_model").Persona} persona
     * @param {import("@mail/core/common/thread_model").Thread} thread
     */
    avatarUrl(author, thread) {
        if (thread?.type !== "livechat" || author?.type !== "guest") {
            return super.avatarUrl(author, thread);
        }
        return DEFAULT_AVATAR;
    },
});
